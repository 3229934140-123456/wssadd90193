import type { TripData, TripNode, TelemetryPoint, TripSegment, CoolingMode, TripNodeType } from '../types'

export interface ParseResult<T> {
  success: boolean
  data?: T
  errors: string[]
  warnings: string[]
}

export interface TripFileData {
  id: string
  vehicleId: string
  vehiclePlate: string
  route: string
  departureTime: number
  arrivalTime: number
  targetTemp: number
  nodes: TripNode[]
  telemetry: TelemetryPoint[]
}

const REQUIRED_TRIP_FIELDS = ['id', 'vehicleId', 'vehiclePlate', 'route', 'departureTime', 'arrivalTime', 'targetTemp', 'nodes', 'telemetry']
const REQUIRED_NODE_FIELDS = ['id', 'type', 'time', 'label']
const REQUIRED_TELEMETRY_FIELDS = ['time', 'coolingMode', 'fuelLevel', 'batteryLevel', 'speed']

export function parseTripFile(content: string, fileName: string): ParseResult<TripFileData> {
  const errors: string[] = []
  const warnings: string[] = []

  const ext = fileName.split('.').pop()?.toLowerCase()

  let rawData: any

  if (ext === 'json') {
    try {
      rawData = JSON.parse(content)
    } catch (e) {
      errors.push('JSON 格式解析失败：' + (e as Error).message)
      return { success: false, errors, warnings }
    }
  } else if (ext === 'csv') {
    const result = parseTripCsv(content)
    if (!result.success) {
      return result as ParseResult<TripFileData>
    }
    rawData = result.data
    warnings.push(...result.warnings)
  } else {
    errors.push(`不支持的文件格式 .${ext}，请上传 JSON 或 CSV 格式的行程文件`)
    return { success: false, errors, warnings }
  }

  return validateAndNormalizeTripData(rawData)
}

function validateAndNormalizeTripData(raw: any): ParseResult<TripFileData> {
  const errors: string[] = []
  const warnings: string[] = []

  if (typeof raw !== 'object' || raw === null) {
    errors.push('行程文件内容格式不正确，应为对象格式')
    return { success: false, errors, warnings }
  }

  for (const field of REQUIRED_TRIP_FIELDS) {
    if (raw[field] === undefined || raw[field] === null) {
      errors.push(`缺少必需字段：${field}`)
    }
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings }
  }

  if (typeof raw.id !== 'string' || raw.id.trim() === '') {
    errors.push('字段 id 必须是非空字符串')
  }
  if (typeof raw.vehicleId !== 'string' || raw.vehicleId.trim() === '') {
    errors.push('字段 vehicleId 必须是非空字符串')
  }
  if (typeof raw.vehiclePlate !== 'string' || raw.vehiclePlate.trim() === '') {
    errors.push('字段 vehiclePlate 必须是非空字符串')
  }
  if (typeof raw.route !== 'string' || raw.route.trim() === '') {
    errors.push('字段 route 必须是非空字符串')
  }

  const departureTime = normalizeTimestamp(raw.departureTime)
  const arrivalTime = normalizeTimestamp(raw.arrivalTime)

  if (departureTime === null) {
    errors.push('字段 departureTime 格式不正确，应为时间戳或 ISO 时间字符串')
  }
  if (arrivalTime === null) {
    errors.push('字段 arrivalTime 格式不正确，应为时间戳或 ISO 时间字符串')
  }
  if (departureTime !== null && arrivalTime !== null && departureTime >= arrivalTime) {
    errors.push('发车时间必须早于到达时间')
  }

  if (typeof raw.targetTemp !== 'number') {
    errors.push('字段 targetTemp 必须是数字')
  }

  if (!Array.isArray(raw.nodes)) {
    errors.push('字段 nodes 必须是数组')
  } else if (raw.nodes.length === 0) {
    errors.push('字段 nodes 不能为空')
  } else {
    raw.nodes.forEach((node: any, idx: number) => {
      for (const field of REQUIRED_NODE_FIELDS) {
        if (node[field] === undefined || node[field] === null) {
          errors.push(`节点 [${idx}] 缺少必需字段：${field}`)
        }
      }
      const nodeTime = normalizeTimestamp(node.time)
      if (node.time !== undefined && nodeTime === null) {
        errors.push(`节点 [${idx}] 的 time 格式不正确`)
      }
      const validTypes: TripNodeType[] = ['loading', 'departure', 'service', 'unloading', 'arrival']
      if (node.type && !validTypes.includes(node.type)) {
        warnings.push(`节点 [${idx}] 的 type "${node.type}" 不是标准类型`)
      }
    })
  }

  if (!Array.isArray(raw.telemetry)) {
    errors.push('字段 telemetry 必须是数组')
  } else if (raw.telemetry.length === 0) {
    errors.push('字段 telemetry 不能为空')
  } else {
    raw.telemetry.forEach((point: any, idx: number) => {
      for (const field of REQUIRED_TELEMETRY_FIELDS) {
        if (point[field] === undefined || point[field] === null) {
          errors.push(`遥测数据 [${idx}] 缺少必需字段：${field}`)
        }
      }
      const pointTime = normalizeTimestamp(point.time)
      if (point.time !== undefined && pointTime === null) {
        errors.push(`遥测数据 [${idx}] 的 time 格式不正确`)
      }
      const validModes: CoolingMode[] = ['diesel', 'electric', 'standby', 'off']
      if (point.coolingMode && !validModes.includes(point.coolingMode)) {
        errors.push(`遥测数据 [${idx}] 的 coolingMode "${point.coolingMode}" 无效，有效值为: ${validModes.join(', ')}`)
      }
    })
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings }
  }

  const nodes: TripNode[] = raw.nodes.map((n: any) => ({
    id: String(n.id),
    type: n.type as TripNodeType,
    time: normalizeTimestamp(n.time)!,
    label: String(n.label),
    description: n.description ? String(n.description) : undefined
  }))

  nodes.sort((a, b) => a.time - b.time)

  const telemetry: TelemetryPoint[] = raw.telemetry.map((p: any) => ({
    time: normalizeTimestamp(p.time)!,
    compartmentTemp: p.compartmentTemp !== undefined ? Number(p.compartmentTemp) : 0,
    outsideTemp: p.outsideTemp !== undefined ? Number(p.outsideTemp) : 25,
    fuelLevel: Number(p.fuelLevel),
    batteryLevel: Number(p.batteryLevel),
    coolingMode: p.coolingMode as CoolingMode,
    doorOpen: Boolean(p.doorOpen),
    speed: Number(p.speed),
    coolingPower: p.coolingPower !== undefined ? Number(p.coolingPower) : 0
  }))

  telemetry.sort((a, b) => a.time - b.time)

  if (telemetry.some(p => p.compartmentTemp === 0)) {
    warnings.push('部分遥测数据缺少厢温数据，将使用默认值 0°C，建议上传温度记录文件以获得更准确的分析')
  }

  const data: TripFileData = {
    id: String(raw.id),
    vehicleId: String(raw.vehicleId),
    vehiclePlate: String(raw.vehiclePlate),
    route: String(raw.route),
    departureTime: departureTime!,
    arrivalTime: arrivalTime!,
    targetTemp: Number(raw.targetTemp),
    nodes,
    telemetry
  }

  return { success: true, data, errors, warnings }
}

function parseTripCsv(content: string): ParseResult<TripFileData> {
  const errors: string[] = []
  const warnings: string[] = []

  const lines = content.split(/\r?\n/).filter(line => line.trim())
  if (lines.length < 2) {
    errors.push('CSV 文件内容为空或格式不正确')
    return { success: false, errors, warnings }
  }

  const headerLine = lines[0]
  const dataLines = lines.slice(1)

  const headers = headerLine.split(',').map(h => h.trim().toLowerCase())

  const timeIdx = headers.indexOf('time')
  const modeIdx = headers.indexOf('coolingmode')
  const fuelIdx = headers.indexOf('fuellevel')
  const batteryIdx = headers.indexOf('batterylevel')
  const speedIdx = headers.indexOf('speed')
  const tempIdx = headers.indexOf('compartmenttemp')
  const outsideIdx = headers.indexOf('outsidetemp')
  const doorIdx = headers.indexOf('dooropen')

  if (timeIdx === -1) {
    errors.push('CSV 文件缺少必需列：time')
  }
  if (modeIdx === -1) {
    errors.push('CSV 文件缺少必需列：coolingMode')
  }
  if (fuelIdx === -1) {
    errors.push('CSV 文件缺少必需列：fuelLevel')
  }
  if (batteryIdx === -1) {
    errors.push('CSV 文件缺少必需列：batteryLevel')
  }
  if (speedIdx === -1) {
    errors.push('CSV 文件缺少必需列：speed')
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings }
  }

  const telemetry: TelemetryPoint[] = []

  for (let i = 0; i < dataLines.length; i++) {
    const values = dataLines[i].split(',').map(v => v.trim())
    const time = normalizeTimestamp(values[timeIdx])
    if (time === null) {
      errors.push(`第 ${i + 2} 行的 time 格式不正确`)
      continue
    }

    telemetry.push({
      time,
      compartmentTemp: tempIdx !== -1 ? Number(values[tempIdx]) : 0,
      outsideTemp: outsideIdx !== -1 ? Number(values[outsideIdx]) : 25,
      fuelLevel: Number(values[fuelIdx]),
      batteryLevel: Number(values[batteryIdx]),
      coolingMode: values[modeIdx] as CoolingMode,
      doorOpen: doorIdx !== -1 ? values[doorIdx] === 'true' || values[doorIdx] === '1' : false,
      speed: Number(values[speedIdx]),
      coolingPower: 0
    })
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings }
  }

  telemetry.sort((a, b) => a.time - b.time)

  const data: TripFileData = {
    id: `trip-${Date.now()}`,
    vehicleId: 'unknown',
    vehiclePlate: '未知车牌',
    route: '未知路线',
    departureTime: telemetry[0].time,
    arrivalTime: telemetry[telemetry.length - 1].time,
    targetTemp: -18,
    nodes: [
      { id: 'n-departure', type: 'departure', time: telemetry[0].time, label: '发车' },
      { id: 'n-arrival', type: 'arrival', time: telemetry[telemetry.length - 1].time, label: '到达' }
    ],
    telemetry
  }

  warnings.push('CSV 格式仅包含遥测数据，车辆信息和节点信息使用默认值，建议使用 JSON 格式以获得完整数据')

  return { success: true, data, errors, warnings }
}

function normalizeTimestamp(value: any): number | null {
  if (value === null || value === undefined) return null

  if (typeof value === 'number') {
    if (value > 1e12) return value
    if (value > 1e9) return value * 1000
  }

  if (typeof value === 'string') {
    const num = Number(value)
    if (!isNaN(num)) {
      if (num > 1e12) return num
      if (num > 1e9) return num * 1000
    }

    const date = new Date(value)
    if (!isNaN(date.getTime())) {
      return date.getTime()
    }
  }

  return null
}

export function generateSegments(telemetry: TelemetryPoint[]): TripSegment[] {
  if (telemetry.length === 0) return []

  const segments: TripSegment[] = []
  let currentMode = telemetry[0].coolingMode
  let segmentStartIdx = 0

  for (let i = 1; i < telemetry.length; i++) {
    if (telemetry[i].coolingMode !== currentMode) {
      segments.push(createSegment(telemetry, segmentStartIdx, i - 1, currentMode, segments.length))
      currentMode = telemetry[i].coolingMode
      segmentStartIdx = i
    }
  }

  segments.push(createSegment(telemetry, segmentStartIdx, telemetry.length - 1, currentMode, segments.length))

  return segments
}

function createSegment(
  telemetry: TelemetryPoint[],
  startIdx: number,
  endIdx: number,
  mode: CoolingMode,
  index: number
): TripSegment {
  const slice = telemetry.slice(startIdx, endIdx + 1)
  const avgCompartmentTemp = slice.reduce((s, p) => s + p.compartmentTemp, 0) / slice.length
  const avgOutsideTemp = slice.reduce((s, p) => s + p.outsideTemp, 0) / slice.length
  const fuelUsed = slice[0].fuelLevel - slice[slice.length - 1].fuelLevel
  const batteryUsed = slice[0].batteryLevel - slice[slice.length - 1].batteryLevel
  let doorOpenCount = 0
  let prevDoorOpen = false
  for (const p of slice) {
    if (p.doorOpen && !prevDoorOpen) {
      doorOpenCount++
    }
    prevDoorOpen = p.doorOpen
  }

  return {
    id: `seg-${index}`,
    startTime: slice[0].time,
    endTime: slice[slice.length - 1].time,
    mode,
    avgCompartmentTemp: Math.round(avgCompartmentTemp * 10) / 10,
    avgOutsideTemp: Math.round(avgOutsideTemp * 10) / 10,
    fuelUsed: Math.max(0, Math.round(fuelUsed * 10) / 10),
    batteryUsed: Math.max(0, Math.round(batteryUsed * 10) / 10),
    doorOpenCount,
    description: getSegmentDescription(mode, (slice.length * 30) / 60)
  }
}

function getSegmentDescription(mode: CoolingMode, durationMin: number): string {
  const duration = Math.round(durationMin)
  switch (mode) {
    case 'diesel':
      return `油机制冷运行约${duration}分钟`
    case 'electric':
      return `电机制冷运行约${duration}分钟`
    case 'standby':
      return `待机状态约${duration}分钟`
    case 'off':
      return `设备关闭约${duration}分钟`
  }
}
