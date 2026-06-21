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

  const tripIdIdx = Math.max(headers.indexOf('tripid'), headers.indexOf('id'))
  const vehiclePlateIdx = headers.indexOf('vehicleplate')
  const routeIdx = headers.indexOf('route')
  const targetTempIdx = headers.indexOf('targettemp')
  const timeIdx = headers.indexOf('time')
  const modeIdx = headers.indexOf('coolingmode')
  const fuelIdx = headers.indexOf('fuellevel')
  const batteryIdx = headers.indexOf('batterylevel')
  const speedIdx = headers.indexOf('speed')
  const tempIdx = Math.max(headers.indexOf('compartmenttemp'), headers.indexOf('temp'))
  const outsideIdx = headers.indexOf('outsidetemp')
  const doorIdx = headers.indexOf('dooropen')
  const nodeTypeIdx = headers.indexOf('nodetype')
  const nodeLabelIdx = headers.indexOf('nodelabel')

  if (tripIdIdx === -1) {
    errors.push('CSV 文件缺少必需列：tripId（行程编号）')
  }
  if (vehiclePlateIdx === -1) {
    errors.push('CSV 文件缺少必需列：vehiclePlate（车牌号）')
  }
  if (routeIdx === -1) {
    errors.push('CSV 文件缺少必需列：route（运输路线）')
  }
  if (targetTempIdx === -1) {
    errors.push('CSV 文件缺少必需列：targetTemp（目标温度）')
  }
  if (timeIdx === -1) {
    errors.push('CSV 文件缺少必需列：time（时间）')
  }
  if (modeIdx === -1) {
    errors.push('CSV 文件缺少必需列：coolingMode（制冷模式）')
  }
  if (fuelIdx === -1) {
    errors.push('CSV 文件缺少必需列：fuelLevel（油量）')
  }
  if (batteryIdx === -1) {
    errors.push('CSV 文件缺少必需列：batteryLevel（电量）')
  }
  if (speedIdx === -1) {
    errors.push('CSV 文件缺少必需列：speed（车速）')
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings }
  }

  if (nodeTypeIdx === -1) {
    errors.push('CSV 文件缺少节点信息列：nodeType、nodeLabel，无法标记装货/发车/停靠等关键节点')
    return { success: false, errors, warnings }
  }

  const telemetry: TelemetryPoint[] = []
  const nodes: TripNode[] = []
  let tripId = ''
  let vehiclePlate = ''
  let route = ''
  let targetTemp: number | null = null

  for (let i = 0; i < dataLines.length; i++) {
    const values = dataLines[i].split(',').map(v => v.trim())

    if (i === 0) {
      tripId = values[tripIdIdx] || ''
      vehiclePlate = values[vehiclePlateIdx] || ''
      route = values[routeIdx] || ''
      const rawTargetTemp = Number(values[targetTempIdx])
      targetTemp = isNaN(rawTargetTemp) ? null : rawTargetTemp
    }

    const time = normalizeTimestamp(values[timeIdx])
    if (time === null) {
      errors.push(`第 ${i + 2} 行的 time 格式不正确`)
      continue
    }

    const mode = values[modeIdx]
    const validModes: CoolingMode[] = ['diesel', 'electric', 'standby', 'off']
    if (!validModes.includes(mode as CoolingMode)) {
      errors.push(`第 ${i + 2} 行的 coolingMode "${mode}" 无效，有效值为: ${validModes.join(', ')}`)
      continue
    }

    const fuel = Number(values[fuelIdx])
    if (isNaN(fuel)) {
      errors.push(`第 ${i + 2} 行的 fuelLevel 不是有效数字`)
      continue
    }

    const battery = Number(values[batteryIdx])
    if (isNaN(battery)) {
      errors.push(`第 ${i + 2} 行的 batteryLevel 不是有效数字`)
      continue
    }

    const speed = Number(values[speedIdx])
    if (isNaN(speed)) {
      errors.push(`第 ${i + 2} 行的 speed 不是有效数字`)
      continue
    }

    const compartmentTemp = tempIdx !== -1 ? Number(values[tempIdx]) : undefined
    const outsideTemp = outsideIdx !== -1 ? Number(values[outsideIdx]) : undefined
    const doorOpen = doorIdx !== -1 ? (values[doorIdx] === 'true' || values[doorIdx] === '1') : false

    if (compartmentTemp !== undefined && isNaN(compartmentTemp)) {
      warnings.push(`第 ${i + 2} 行的厢温数据无效，该点温度将从相邻数据插值`)
    }

    telemetry.push({
      time,
      compartmentTemp: compartmentTemp !== undefined && !isNaN(compartmentTemp) ? compartmentTemp : 0,
      outsideTemp: outsideTemp !== undefined && !isNaN(outsideTemp) ? outsideTemp : 25,
      fuelLevel: fuel,
      batteryLevel: battery,
      coolingMode: mode as CoolingMode,
      doorOpen,
      speed,
      coolingPower: 0
    })

    if (nodeTypeIdx !== -1 && values[nodeTypeIdx]) {
      const nodeType = values[nodeTypeIdx]
      const nodeLabel = nodeLabelIdx !== -1 ? values[nodeLabelIdx] : nodeType
      const validNodeTypes: TripNodeType[] = ['loading', 'departure', 'service', 'unloading', 'arrival']
      if (validNodeTypes.includes(nodeType as TripNodeType)) {
        nodes.push({
          id: `node-${i}`,
          type: nodeType as TripNodeType,
          time,
          label: nodeLabel || nodeType
        })
      } else {
        warnings.push(`第 ${i + 2} 行的 nodeType "${nodeType}" 不是标准类型`)
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings }
  }

  if (!tripId || tripId.trim() === '') {
    errors.push('行程编号 (tripId) 不能为空')
  }
  if (!vehiclePlate || vehiclePlate.trim() === '') {
    errors.push('车牌号 (vehiclePlate) 不能为空')
  }
  if (!route || route.trim() === '') {
    errors.push('运输路线 (route) 不能为空')
  }
  if (targetTemp === null || isNaN(targetTemp)) {
    errors.push('目标温度 (targetTemp) 无效')
  }

  if (nodes.length === 0) {
    errors.push('未找到任何节点数据，请在 CSV 中通过 nodeType 列标记装货、发车、卸货等节点')
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings }
  }

  telemetry.sort((a, b) => a.time - b.time)
  nodes.sort((a, b) => a.time - b.time)

  const departureTime = telemetry[0].time
  const arrivalTime = telemetry[telemetry.length - 1].time

  const data: TripFileData = {
    id: tripId,
    vehicleId: vehiclePlate,
    vehiclePlate,
    route,
    departureTime,
    arrivalTime,
    targetTemp: targetTemp!,
    nodes,
    telemetry
  }

  if (tempIdx === -1) {
    warnings.push('CSV 文件中缺少厢温数据 (compartmentTemp)，建议上传温度记录文件以获得更准确的分析')
  }

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
