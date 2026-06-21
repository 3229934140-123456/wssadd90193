import type { TripData, CoolingMode } from '../types'
import { generateSegments } from './tripParser'

export function generateTestTrip(route: string = '广州 → 深圳'): TripData {
  const baseDate = new Date()
  baseDate.setHours(8, 0, 0, 0)

  const startTime = baseDate.getTime()
  const totalMinutes = 240
  const endTime = startTime + totalMinutes * 60 * 1000
  const intervalSec = 60
  const pointCount = Math.floor((endTime - startTime) / (intervalSec * 1000))

  const telemetry: any[] = []

  let currentFuel = 100
  let currentBattery = 100

  const phases = [
    { start: 0, end: 20, mode: 'off' as CoolingMode, speed: 0, desc: '准备阶段' },
    { start: 20, end: 50, mode: 'electric' as CoolingMode, speed: 0, desc: '装货预冷' },
    { start: 50, end: 120, mode: 'electric' as CoolingMode, speed: 60, desc: '市区行驶' },
    { start: 120, end: 180, mode: 'diesel' as CoolingMode, speed: 90, desc: '高速行驶' },
    { start: 180, end: 200, mode: 'standby' as CoolingMode, speed: 0, desc: '服务区休息' },
    { start: 200, end: 230, mode: 'diesel' as CoolingMode, speed: 70, desc: '市郊道路' },
    { start: 230, end: 240, mode: 'standby' as CoolingMode, speed: 0, desc: '到达等待' }
  ]

  for (let i = 0; i < pointCount; i++) {
    const time = startTime + i * intervalSec * 1000
    const minute = (time - startTime) / 60000

    let phase = phases[0]
    for (const p of phases) {
      if (minute >= p.start && minute < p.end) {
        phase = p
        break
      }
    }

    let compartmentTemp = -18
    let outsideTemp = 28 + Math.sin(minute * 0.05) * 2
    let doorOpen = false
    let coolingPower = 0

    if (phase.mode === 'off') {
      compartmentTemp = -15 + minute * 0.1
      coolingPower = 0
    } else if (phase.mode === 'electric') {
      compartmentTemp = -19 + Math.sin(i * 0.1) * 0.5
      coolingPower = 75
      currentBattery -= 0.04
    } else if (phase.mode === 'diesel') {
      compartmentTemp = -18.5 + Math.sin(i * 0.08) * 0.4
      coolingPower = 85
      currentFuel -= 0.025
    } else if (phase.mode === 'standby') {
      compartmentTemp = -17 + (minute - phase.start) * 0.05
      coolingPower = 0
      if (minute > 182 && minute < 188) {
        doorOpen = true
        compartmentTemp = -15 + (minute - 182) * 0.4
      }
    }

    telemetry.push({
      time,
      compartmentTemp: Math.round(compartmentTemp * 10) / 10,
      outsideTemp: Math.round(outsideTemp * 10) / 10,
      fuelLevel: Math.max(0, Math.round(currentFuel * 10) / 10),
      batteryLevel: Math.max(0, Math.round(currentBattery * 10) / 10),
      coolingMode: phase.mode,
      doorOpen,
      speed: phase.speed + Math.sin(i * 0.3) * 5,
      coolingPower: Math.round(coolingPower)
    })
  }

  const nodes = [
    { id: 'n1', type: 'loading' as const, time: startTime + 20 * 60 * 1000, label: '装货开始', description: '广州白云冷链仓库' },
    { id: 'n2', type: 'departure' as const, time: startTime + 50 * 60 * 1000, label: '发车', description: '出发前往深圳' },
    { id: 'n3', type: 'service' as const, time: startTime + 180 * 60 * 1000, label: '服务区停靠', description: '东莞服务区休息20分钟' },
    { id: 'n4', type: 'unloading' as const, time: startTime + 230 * 60 * 1000, label: '卸货开始', description: '深圳前海冷链中心' },
    { id: 'n5', type: 'arrival' as const, time: endTime, label: '任务完成' }
  ]

  const tripFileData = {
    id: `trip-${Date.now()}`,
    vehicleId: 'V-008',
    vehiclePlate: '粤B·K6688冷',
    route,
    departureTime: startTime,
    arrivalTime: endTime,
    targetTemp: -18,
    nodes,
    telemetry
  }

  const segments = generateSegments(telemetry)

  return {
    ...tripFileData,
    segments
  }
}

export function generateTempRecords(trip: TripData): any[] {
  const records: any[] = []

  for (const point of trip.telemetry) {
    const noise = (Math.random() - 0.5) * 0.3
    records.push({
      time: point.time,
      compartmentTemp: Math.round((point.compartmentTemp + noise) * 10) / 10,
      outsideTemp: Math.round((point.outsideTemp + (Math.random() - 0.5) * 0.5) * 10) / 10,
      probe1Temp: Math.round((point.compartmentTemp + 0.5 + (Math.random() - 0.5) * 0.2) * 10) / 10,
      probe2Temp: Math.round((point.compartmentTemp - 0.3 + (Math.random() - 0.5) * 0.2) * 10) / 10
    })
  }

  return records
}

export function downloadJson(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadCsv(headers: string[], rows: any[][], filename: string) {
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(row.join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
