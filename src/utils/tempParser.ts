import type { ParseResult } from './tripParser'

export interface TempRecord {
  time: number
  compartmentTemp: number
  outsideTemp?: number
  probe1Temp?: number
  probe2Temp?: number
}

const REQUIRED_TEMP_FIELDS = ['time', 'compartmentTemp']

export function parseTemperatureFile(content: string, fileName: string): ParseResult<TempRecord[]> {
  const errors: string[] = []
  const warnings: string[] = []

  const ext = fileName.split('.').pop()?.toLowerCase()

  if (ext === 'json') {
    return parseTempJson(content)
  } else if (ext === 'csv') {
    return parseTempCsv(content)
  } else {
    errors.push(`不支持的文件格式 .${ext}，请上传 JSON 或 CSV 格式的温度记录`)
    return { success: false, errors, warnings }
  }
}

function parseTempJson(content: string): ParseResult<TempRecord[]> {
  const errors: string[] = []
  const warnings: string[] = []

  let raw: any
  try {
    raw = JSON.parse(content)
  } catch (e) {
    errors.push('JSON 格式解析失败：' + (e as Error).message)
    return { success: false, errors, warnings }
  }

  if (!Array.isArray(raw)) {
    if (typeof raw === 'object' && raw !== null && Array.isArray(raw.records)) {
      raw = raw.records
    } else {
      errors.push('温度文件内容格式不正确，应为数组或包含 records 数组的对象')
      return { success: false, errors, warnings }
    }
  }

  if (raw.length === 0) {
    errors.push('温度记录数组为空')
    return { success: false, errors, warnings }
  }

  const records: TempRecord[] = []

  raw.forEach((item: any, idx: number) => {
    for (const field of REQUIRED_TEMP_FIELDS) {
      if (item[field] === undefined || item[field] === null) {
        errors.push(`温度记录 [${idx}] 缺少必需字段：${field}`)
      }
    }

    const time = normalizeTimestamp(item.time)
    if (item.time !== undefined && time === null) {
      errors.push(`温度记录 [${idx}] 的 time 格式不正确`)
    }

    if (item.compartmentTemp !== undefined && isNaN(Number(item.compartmentTemp))) {
      errors.push(`温度记录 [${idx}] 的 compartmentTemp 不是有效数字`)
    }

    if (errors.length > 20) return
  })

  if (errors.length > 0) {
    return { success: false, errors, warnings }
  }

  for (const item of raw) {
    records.push({
      time: normalizeTimestamp(item.time)!,
      compartmentTemp: Number(item.compartmentTemp),
      outsideTemp: item.outsideTemp !== undefined ? Number(item.outsideTemp) : undefined,
      probe1Temp: item.probe1Temp !== undefined ? Number(item.probe1Temp) : undefined,
      probe2Temp: item.probe2Temp !== undefined ? Number(item.probe2Temp) : undefined
    })
  }

  records.sort((a, b) => a.time - b.time)

  if (!raw.some((r: any) => r.outsideTemp !== undefined)) {
    warnings.push('温度记录中缺少外温数据，部分分析功能可能受限')
  }

  return { success: true, data: records, errors, warnings }
}

function parseTempCsv(content: string): ParseResult<TempRecord[]> {
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
  const tempIdx = headers.indexOf('compartmenttemp')
  const tempIdx2 = headers.indexOf('temp')
  const compartmentIdx = tempIdx !== -1 ? tempIdx : tempIdx2
  const outsideIdx = headers.indexOf('outsidetemp')
  const probe1Idx = headers.indexOf('probe1temp')
  const probe2Idx = headers.indexOf('probe2temp')

  if (timeIdx === -1) {
    errors.push('CSV 文件缺少必需列：time')
  }
  if (compartmentIdx === -1) {
    errors.push('CSV 文件缺少必需列：compartmentTemp 或 temp')
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings }
  }

  const records: TempRecord[] = []

  for (let i = 0; i < dataLines.length; i++) {
    const values = dataLines[i].split(',').map(v => v.trim())

    if (values.length < 2) {
      warnings.push(`第 ${i + 2} 行数据列数不足，已跳过`)
      continue
    }

    const time = normalizeTimestamp(values[timeIdx])
    if (time === null) {
      errors.push(`第 ${i + 2} 行的 time 格式不正确`)
      continue
    }

    const compartmentTemp = Number(values[compartmentIdx])
    if (isNaN(compartmentTemp)) {
      errors.push(`第 ${i + 2} 行的厢温数据不是有效数字`)
      continue
    }

    records.push({
      time,
      compartmentTemp,
      outsideTemp: outsideIdx !== -1 && values[outsideIdx] ? Number(values[outsideIdx]) : undefined,
      probe1Temp: probe1Idx !== -1 && values[probe1Idx] ? Number(values[probe1Idx]) : undefined,
      probe2Temp: probe2Idx !== -1 && values[probe2Idx] ? Number(values[probe2Idx]) : undefined
    })
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings }
  }

  records.sort((a, b) => a.time - b.time)

  if (outsideIdx === -1) {
    warnings.push('温度记录中缺少外温数据，部分分析功能可能受限')
  }

  return { success: true, data: records, errors, warnings }
}

function normalizeTimestamp(value: any): number | null {
  if (value === null || value === undefined) return null

  if (typeof value === 'number') {
    if (value > 1e12) return value
    if (value > 1e9) return value * 1000
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    const num = Number(trimmed)
    if (!isNaN(num) && trimmed.match(/^\d+$/)) {
      if (num > 1e12) return num
      if (num > 1e9) return num * 1000
    }

    const date = new Date(trimmed)
    if (!isNaN(date.getTime())) {
      return date.getTime()
    }
  }

  return null
}

export function mergeTemperatureData(
  telemetry: any[],
  tempRecords: TempRecord[]
): { telemetry: any[]; warnings: string[] } {
  const warnings: string[] = []

  if (tempRecords.length === 0) {
    warnings.push('温度记录为空，未进行合并')
    return { telemetry, warnings }
  }

  const tripStart = telemetry[0]?.time || 0
  const tripEnd = telemetry[telemetry.length - 1]?.time || 0
  const tempStart = tempRecords[0].time
  const tempEnd = tempRecords[tempRecords.length - 1].time

  if (tempEnd < tripStart || tempStart > tripEnd) {
    warnings.push('温度记录的时间范围与行程数据不重叠，无法合并')
    return { telemetry, warnings }
  }

  if (tempStart > tripStart) {
    const diffMin = (tempStart - tripStart) / 60000
    warnings.push(`温度记录比行程晚开始约 ${Math.round(diffMin)} 分钟，前段数据无温度记录`)
  }
  if (tempEnd < tripEnd) {
    const diffMin = (tripEnd - tempEnd) / 60000
    warnings.push(`温度记录比行程早结束约 ${Math.round(diffMin)} 分钟，后段数据无温度记录`)
  }

  const mergedTelemetry = telemetry.map(point => {
    const tempRecord = findClosestTempRecord(point.time, tempRecords)
    if (tempRecord) {
      return {
        ...point,
        compartmentTemp: tempRecord.compartmentTemp,
        outsideTemp: tempRecord.outsideTemp !== undefined ? tempRecord.outsideTemp : point.outsideTemp
      }
    }
    return point
  })

  let mergedCount = 0
  for (let i = 0; i < mergedTelemetry.length; i++) {
    if (mergedTelemetry[i].compartmentTemp !== telemetry[i].compartmentTemp) {
      mergedCount++
    }
  }

  if (mergedCount > 0) {
    warnings.push(`已成功合并 ${mergedCount} 条温度数据点`)
  }

  return { telemetry: mergedTelemetry, warnings }
}

function findClosestTempRecord(time: number, tempRecords: TempRecord[]): TempRecord | null {
  if (tempRecords.length === 0) return null

  let left = 0
  let right = tempRecords.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    if (tempRecords[mid].time === time) {
      return tempRecords[mid]
    } else if (tempRecords[mid].time < time) {
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  const maxDiffMs = 5 * 60 * 1000

  if (right >= 0 && time - tempRecords[right].time <= maxDiffMs) {
    return tempRecords[right]
  }
  if (left < tempRecords.length && tempRecords[left].time - time <= maxDiffMs) {
    return tempRecords[left]
  }

  return null
}
