import type { TripData, ImprovementItem, ReviewReport } from '../types'

const DIESEL_COST_PER_LITER = 7.5
const ELECTRIC_COST_PER_KWH = 1.2

export function analyzeTrip(trip: TripData): ReviewReport {
  const improvements: ImprovementItem[] = []
  const suggestions: string[] = []

  const dieselSegments = trip.segments.filter(s => s.mode === 'diesel')
  const electricSegments = trip.segments.filter(s => s.mode === 'electric')
  const standbySegments = trip.segments.filter(s => s.mode === 'standby')

  const dieselDuration = dieselSegments.reduce((s, seg) => s + (seg.endTime - seg.startTime), 0)
  const electricDuration = electricSegments.reduce((s, seg) => s + (seg.endTime - seg.startTime), 0)
  const standbyDuration = standbySegments.reduce((s, seg) => s + (seg.endTime - seg.startTime), 0)

  const totalFuelUsed = dieselSegments.reduce((s, seg) => s + seg.fuelUsed, 0)
  const totalBatteryUsed = electricSegments.reduce((s, seg) => s + seg.batteryUsed, 0)

  const dieselIdleItems = detectDieselIdle(trip)
  improvements.push(...dieselIdleItems)

  const batteryWasteItems = detectBatteryWaste(trip)
  improvements.push(...batteryWasteItems)

  const precoolItems = detectPrecoolIssues(trip)
  improvements.push(...precoolItems)

  const doorItems = detectDoorCoolingIssues(trip)
  improvements.push(...doorItems)

  if (dieselIdleItems.length > 0) {
    const totalFuelSaved = dieselIdleItems.reduce((s, item) => s + (item.fuelSaved || 0), 0)
    suggestions.push(`检测到 ${dieselIdleItems.length} 处油机空转情况，预估可节省燃油 ${totalFuelSaved.toFixed(1)} 升`)
  }

  if (electricDuration > dieselDuration * 1.5) {
    suggestions.push('本次运输电机使用占比较高，整体策略偏节能，继续保持')
  }

  if (standbyDuration > 30 * 60 * 1000) {
    suggestions.push('待机时间较长，请注意检查是否存在不必要的待机时段')
  }

  suggestions.push('建议夜间市区配送优先使用电机制冷，噪音小且成本更低')
  suggestions.push('长时间排队或等待前建议提前强冷，避免途中频繁启动油机')

  const totalSeverityScore = improvements.reduce((score, item) => {
    switch (item.severity) {
      case 'high': return score + 15
      case 'medium': return score + 8
      case 'low': return score + 3
    }
  }, 0)

  const score = Math.max(0, Math.min(100, 100 - totalSeverityScore))

  improvements.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 }
    return severityOrder[a.severity] - severityOrder[b.severity]
  })

  return {
    tripId: trip.id,
    score: Math.round(score),
    totalFuelUsed: Math.round(totalFuelUsed * 10) / 10,
    totalBatteryUsed: Math.round(totalBatteryUsed * 10) / 10,
    dieselDuration,
    electricDuration,
    standbyDuration,
    improvements,
    suggestions
  }
}

function detectDieselIdle(trip: TripData): ImprovementItem[] {
  const items: ImprovementItem[] = []
  const dieselSegments = trip.segments.filter(s => s.mode === 'diesel')

  for (const seg of dieselSegments) {
    const slice = trip.telemetry.filter(p => p.time >= seg.startTime && p.time <= seg.endTime)
    if (slice.length < 2) continue

    const avgSpeed = slice.reduce((s, p) => s + p.speed, 0) / slice.length
    const durationMin = (seg.endTime - seg.startTime) / 60000

    if (avgSpeed < 5 && durationMin > 10) {
      const fuelSaved = seg.fuelUsed * 0.6
      items.push({
        id: `diesel-idle-${seg.id}`,
        type: 'diesel_idle',
        severity: durationMin > 20 ? 'high' : 'medium',
        startTime: seg.startTime,
        endTime: seg.endTime,
        title: '油机怠速空转',
        description: `车辆静止时油机持续运行约 ${Math.round(durationMin)} 分钟，平均车速仅 ${avgSpeed.toFixed(1)} km/h`,
        suggestion: '车辆长时间静止时建议切换至电机制冷或待机状态，减少燃油消耗',
        fuelSaved: Math.round(fuelSaved * 10) / 10,
        costSaved: Math.round(fuelSaved * DIESEL_COST_PER_LITER * 100) / 100
      })
    }
  }

  return items
}

function detectBatteryWaste(trip: TripData): ImprovementItem[] {
  const items: ImprovementItem[] = []

  for (let i = 0; i < trip.segments.length - 1; i++) {
    const current = trip.segments[i]
    const next = trip.segments[i + 1]

    if (current.mode === 'standby' && next.mode === 'diesel') {
      const standbyDuration = (current.endTime - current.startTime) / 60000
      const prevSeg = i > 0 ? trip.segments[i - 1] : null
      const batteryBefore = prevSeg && prevSeg.mode === 'electric'
        ? trip.telemetry.find(p => p.time >= prevSeg.startTime)?.batteryLevel || 100
        : 100

      if (standbyDuration > 15 && batteryBefore > 40) {
        items.push({
          id: `battery-waste-${current.id}`,
          type: 'battery_waste',
          severity: standbyDuration > 30 ? 'high' : 'medium',
          startTime: current.startTime,
          endTime: next.endTime,
          title: '电量闲置后立即用油机',
          description: `待机 ${Math.round(standbyDuration)} 分钟后直接启动油机，当时电量约 ${batteryBefore.toFixed(0)}%`,
          suggestion: '电量充足时优先使用电机制冷，尤其是在等待或短距离行驶时',
          fuelSaved: Math.round(next.fuelUsed * 0.3 * 10) / 10,
          costSaved: Math.round(next.fuelUsed * 0.3 * DIESEL_COST_PER_LITER * 100) / 100
        })
      }
    }
  }

  return items
}

function detectPrecoolIssues(trip: TripData): ImprovementItem[] {
  const items: ImprovementItem[] = []
  const unloadingNode = trip.nodes.find(n => n.type === 'unloading')
  if (!unloadingNode) return items

  const beforeUnload = trip.telemetry.filter(
    p => p.time >= unloadingNode.time - 30 * 60 * 1000 && p.time <= unloadingNode.time
  )

  if (beforeUnload.length > 0) {
    const avgTemp = beforeUnload.reduce((s, p) => s + p.compartmentTemp, 0) / beforeUnload.length
    const tempDiff = avgTemp - trip.targetTemp

    if (tempDiff > 2) {
      items.push({
        id: 'precool-insufficient',
        type: 'precool_insufficient',
        severity: tempDiff > 4 ? 'high' : 'medium',
        startTime: unloadingNode.time - 30 * 60 * 1000,
        endTime: unloadingNode.time,
        title: '到仓前预冷不足',
        description: `卸货前30分钟平均厢温 ${avgTemp.toFixed(1)}°C，比目标温度高 ${tempDiff.toFixed(1)}°C`,
        suggestion: '建议在到达目的地前30分钟加强制冷，确保卸货时厢温达标，减少货物变质风险',
        fuelSaved: 0,
        costSaved: 0
      })
    }
  }

  return items
}

function detectDoorCoolingIssues(trip: TripData): ImprovementItem[] {
  const items: ImprovementItem[] = []
  let doorPeriodStart: number | null = null
  let maxTempDuringDoor = -Infinity

  for (const point of trip.telemetry) {
    if (point.doorOpen && doorPeriodStart === null) {
      doorPeriodStart = point.time
      maxTempDuringDoor = point.compartmentTemp
    } else if (point.doorOpen && doorPeriodStart !== null) {
      maxTempDuringDoor = Math.max(maxTempDuringDoor, point.compartmentTemp)
    } else if (!point.doorOpen && doorPeriodStart !== null) {
      const duration = (point.time - doorPeriodStart) / 60000
      const tempRise = maxTempDuringDoor - trip.targetTemp

      if (duration > 5 && tempRise > 3) {
        const afterDoor = trip.telemetry.filter(
          p => p.time >= point.time && p.time <= point.time + 20 * 60 * 1000
        )
        const dieselMode = afterDoor.filter(p => p.coolingMode === 'diesel').length > afterDoor.length * 0.5

        if (dieselMode) {
          items.push({
            id: `door-cooling-${doorPeriodStart}`,
            type: 'door_cooling',
            severity: 'low',
            startTime: doorPeriodStart,
            endTime: point.time + 20 * 60 * 1000,
            title: '开门后油机回冷',
            description: `开门约 ${Math.round(duration)} 分钟，厢温上升 ${tempRise.toFixed(1)}°C，随后使用油机回冷`,
            suggestion: '如果是在服务区或装卸货期间开门，建议使用电机辅助回冷，降低燃油消耗',
            fuelSaved: 0.5,
            costSaved: Math.round(0.5 * DIESEL_COST_PER_LITER * 100) / 100
          })
        }
      }

      doorPeriodStart = null
      maxTempDuringDoor = -Infinity
    }
  }

  return items
}

export function generateReportText(trip: TripData, report: ReviewReport): string {
  const lines: string[] = []

  lines.push('='.repeat(60))
  lines.push('              冷机节能复盘报告')
  lines.push('='.repeat(60))
  lines.push('')

  lines.push(`任务编号：${trip.id}`)
  lines.push(`车辆牌号：${trip.vehiclePlate}`)
  lines.push(`运输路线：${trip.route}`)
  lines.push(`目标温度：${trip.targetTemp}°C`)
  lines.push('')

  const depTime = new Date(trip.departureTime)
  const arrTime = new Date(trip.arrivalTime)
  lines.push(`发车时间：${depTime.toLocaleString()}`)
  lines.push(`到达时间：${arrTime.toLocaleString()}`)
  lines.push(`总运行时长：${formatDurationMs(report.dieselDuration + report.electricDuration)}`)
  lines.push('')

  lines.push('-'.repeat(60))
  lines.push('能耗概况')
  lines.push('-'.repeat(60))
  lines.push(`油机运行时长：${formatDurationMs(report.dieselDuration)}`)
  lines.push(`电机运行时长：${formatDurationMs(report.electricDuration)}`)
  lines.push(`待机时长：${formatDurationMs(report.standbyDuration)}`)
  lines.push(`燃油消耗量：${report.totalFuelUsed.toFixed(1)} 升`)
  lines.push(`电量消耗量：${report.totalBatteryUsed.toFixed(1)} %`)
  lines.push('')

  lines.push('-'.repeat(60))
  lines.push(`综合评分：${report.score} 分`)
  lines.push('-'.repeat(60))
  lines.push('')

  lines.push('可改进片段：')
  lines.push('')
  report.improvements.forEach((item, idx) => {
    const severityLabel = item.severity === 'high' ? '[高]' : item.severity === 'medium' ? '[中]' : '[低]'
    lines.push(`${idx + 1}. ${severityLabel} ${item.title}`)
    lines.push(`   时段：${formatTime(item.startTime)} - ${formatTime(item.endTime)}`)
    lines.push(`   描述：${item.description}`)
    lines.push(`   建议：${item.suggestion}`)
    if (item.fuelSaved && item.fuelSaved > 0) {
      lines.push(`   预估节省：${item.fuelSaved.toFixed(1)} 升燃油 / 约 ${item.costSaved?.toFixed(2)} 元`)
    }
    lines.push('')
  })

  lines.push('-'.repeat(60))
  lines.push('改进建议')
  lines.push('-'.repeat(60))
  report.suggestions.forEach((s, idx) => {
    lines.push(`${idx + 1}. ${s}`)
  })
  lines.push('')

  lines.push('='.repeat(60))
  lines.push('              报告结束')
  lines.push('='.repeat(60))

  return lines.join('\n')
}

function formatDurationMs(ms: number): string {
  const minutes = ms / 60000
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h > 0) {
    return `${h}小时${m}分钟`
  }
  return `${m}分钟`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
