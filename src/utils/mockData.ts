import type { TripData, TripNode, TelemetryPoint, TripSegment, CoolingMode } from '../types'

function formatTime(date: Date): string {
  return date.toISOString().slice(11, 16)
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000)
}

export function generateMockTrip(): TripData {
  const baseDate = new Date()
  baseDate.setHours(6, 0, 0, 0)

  const startTime = baseDate.getTime()
  const endTime = addMinutes(baseDate, 480).getTime()
  const intervalSec = 30
  const pointCount = Math.floor((endTime - startTime) / (intervalSec * 1000))

  const telemetry: TelemetryPoint[] = []
  const nodes: TripNode[] = []

  nodes.push({
    id: 'n1',
    type: 'loading',
    time: startTime + 10 * 60 * 1000,
    label: '装货开始',
    description: '北京大兴冷链仓库'
  })

  nodes.push({
    id: 'n2',
    type: 'departure',
    time: startTime + 45 * 60 * 1000,
    label: '发车',
    description: '出发前往上海'
  })

  nodes.push({
    id: 'n3',
    type: 'service',
    time: startTime + 180 * 60 * 1000,
    label: '服务区停靠',
    description: '济南服务区休息30分钟'
  })

  nodes.push({
    id: 'n4',
    type: 'unloading',
    time: startTime + 420 * 60 * 1000,
    label: '卸货开始',
    description: '上海浦东冷链中心'
  })

  nodes.push({
    id: 'n5',
    type: 'arrival',
    time: endTime,
    label: '任务完成'
  })

  let currentFuel = 100
  let currentBattery = 100
  let doorOpenCount = 0

  for (let i = 0; i < pointCount; i++) {
    const time = startTime + i * intervalSec * 1000
    const minutesFromStart = (time - startTime) / 60000

    let mode: CoolingMode = 'electric'
    let compartmentTemp = -18 + Math.sin(i * 0.05) * 0.8
    let outsideTemp = 25 + Math.sin(i * 0.02) * 3
    let speed = 0
    let coolingPower = 0
    let doorOpen = false

    if (minutesFromStart < 10) {
      mode = 'off'
      compartmentTemp = -17 + i * 0.1
      coolingPower = 0
    } else if (minutesFromStart < 45) {
      mode = 'electric'
      compartmentTemp = -18 - (45 - minutesFromStart) * 0.05
      coolingPower = 80
      currentBattery -= 0.03
    } else if (minutesFromStart < 90) {
      mode = 'diesel'
      speed = 70 + Math.sin(i * 0.1) * 10
      compartmentTemp = -18.5
      coolingPower = 90
      currentFuel -= 0.02
    } else if (minutesFromStart < 150) {
      mode = 'electric'
      speed = 75 + Math.sin(i * 0.08) * 8
      compartmentTemp = -18
      coolingPower = 75
      currentBattery -= 0.025
    } else if (minutesFromStart < 170) {
      mode = 'diesel'
      speed = 80
      compartmentTemp = -18.2
      coolingPower = 85
      currentFuel -= 0.018
    } else if (minutesFromStart < 210) {
      mode = 'standby'
      speed = 0
      compartmentTemp = -17.5 + (minutesFromStart - 170) * 0.04
      coolingPower = 0
      if (minutesFromStart > 185 && minutesFromStart < 195) {
        doorOpen = true
        doorOpenCount++
        compartmentTemp = -16 + (minutesFromStart - 185) * 0.3
      }
    } else if (minutesFromStart < 280) {
      mode = 'diesel'
      speed = 75 + Math.sin(i * 0.06) * 12
      compartmentTemp = -18.3
      coolingPower = 88
      currentFuel -= 0.022
    } else if (minutesFromStart < 360) {
      mode = 'electric'
      speed = 70 + Math.sin(i * 0.07) * 10
      compartmentTemp = -17.8
      coolingPower = 78
      currentBattery -= 0.028
    } else if (minutesFromStart < 420) {
      mode = 'diesel'
      speed = 60 + Math.sin(i * 0.1) * 5
      compartmentTemp = -17.5
      coolingPower = 70
      currentFuel -= 0.015
    } else if (minutesFromStart < 480) {
      mode = 'standby'
      speed = 0
      compartmentTemp = -16 + (minutesFromStart - 420) * 0.05
      coolingPower = 0
      if (minutesFromStart > 430 && minutesFromStart < 460) {
        doorOpen = true
        if (Math.random() > 0.7) doorOpenCount++
      }
    }

    telemetry.push({
      time,
      compartmentTemp: Math.round(compartmentTemp * 10) / 10,
      outsideTemp: Math.round(outsideTemp * 10) / 10,
      fuelLevel: Math.max(0, Math.round(currentFuel * 10) / 10),
      batteryLevel: Math.max(0, Math.round(currentBattery * 10) / 10),
      coolingMode: mode,
      doorOpen,
      speed: Math.round(speed * 10) / 10,
      coolingPower: Math.round(coolingPower)
    })
  }

  const segments: TripSegment[] = generateSegments(telemetry)

  return {
    id: 'trip-20240115-001',
    vehicleId: 'V-003',
    vehiclePlate: '京A·F8829冷',
    route: '北京 → 上海',
    departureTime: startTime,
    arrivalTime: endTime,
    targetTemp: -18,
    nodes,
    telemetry,
    segments
  }
}

function generateSegments(telemetry: TelemetryPoint[]): TripSegment[] {
  if (telemetry.length === 0) return []

  const segments: TripSegment[] = []
  let currentMode = telemetry[0].coolingMode
  let segmentStart = 0

  for (let i = 1; i < telemetry.length; i++) {
    if (telemetry[i].coolingMode !== currentMode) {
      segments.push(createSegment(telemetry, segmentStart, i - 1, currentMode, segments.length))
      currentMode = telemetry[i].coolingMode
      segmentStart = i
    }
  }

  segments.push(createSegment(telemetry, segmentStart, telemetry.length - 1, currentMode, segments.length))

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
  const doorOpenCount = slice.filter(p => p.doorOpen).length

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
    description: getSegmentDescription(mode, slice.length * 30 / 60)
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

export function formatTimeShort(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h > 0) {
    return `${h}小时${m}分`
  }
  return `${m}分钟`
}

export function formatDurationFromMs(ms: number): string {
  return formatDuration(ms / 60000)
}
