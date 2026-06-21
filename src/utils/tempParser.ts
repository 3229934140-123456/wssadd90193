import type { ParseResult } from './tripParser'
import type { TempDataInfo, TempDataSource } from '../types'

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

    if (item.compartmentTemp !== undefined && item.compartmentTemp !== null && isNaN(Number(item.compartmentTemp))) {
      errors.push(`温度记录 [${idx}] 的 compartmentTemp (厢温) 不是有效数字，值为: ${item.compartmentTemp}`)
    }

    if (item.outsideTemp !== undefined && item.outsideTemp !== null && item.outsideTemp !== '' && isNaN(Number(item.outsideTemp))) {
      errors.push(`温度记录 [${idx}] 的 outsideTemp (外温) 不是有效数字，值为: ${item.outsideTemp}`)
    }

    if (item.probe1Temp !== undefined && item.probe1Temp !== null && item.probe1Temp !== '' && isNaN(Number(item.probe1Temp))) {
      errors.push(`温度记录 [${idx}] 的 probe1Temp (探头1温度) 不是有效数字，值为: ${item.probe1Temp}`)
    }

    if (item.probe2Temp !== undefined && item.probe2Temp !== null && item.probe2Temp !== '' && isNaN(Number(item.probe2Temp))) {
      errors.push(`温度记录 [${idx}] 的 probe2Temp (探头2温度) 不是有效数字，值为: ${item.probe2Temp}`)
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
      errors.push(`第 ${i + 2} 行数据列数不足`)
      continue
    }

    const time = normalizeTimestamp(values[timeIdx])
    if (time === null) {
      errors.push(`第 ${i + 2} 行的 time 格式不正确，值为: ${values[timeIdx]}`)
      continue
    }

    const compartmentTemp = Number(values[compartmentIdx])
    if (isNaN(compartmentTemp)) {
      errors.push(`第 ${i + 2} 行的 compartmentTemp (厢温) 不是有效数字，值为: ${values[compartmentIdx]}`)
      continue
    }

    let outsideTemp: number | undefined = undefined
    if (outsideIdx !== -1 && values[outsideIdx] !== '') {
      outsideTemp = Number(values[outsideIdx])
      if (isNaN(outsideTemp)) {
        errors.push(`第 ${i + 2} 行的 outsideTemp (外温) 不是有效数字，值为: ${values[outsideIdx]}`)
        continue
      }
    }

    let probe1Temp: number | undefined = undefined
    if (probe1Idx !== -1 && values[probe1Idx] !== '') {
      probe1Temp = Number(values[probe1Idx])
      if (isNaN(probe1Temp)) {
        errors.push(`第 ${i + 2} 行的 probe1Temp (探头1温度) 不是有效数字，值为: ${values[probe1Idx]}`)
        continue
      }
    }

    let probe2Temp: number | undefined = undefined
    if (probe2Idx !== -1 && values[probe2Idx] !== '') {
      probe2Temp = Number(values[probe2Idx])
      if (isNaN(probe2Temp)) {
        errors.push(`第 ${i + 2} 行的 probe2Temp (探头2温度) 不是有效数字，值为: ${values[probe2Idx]}`)
        continue
      }
    }

    records.push({
      time,
      compartmentTemp,
      outsideTemp,
      probe1Temp,
      probe2Temp
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
  tempRecords: TempRecord[],
  tempFileName?: string
): { telemetry: any[]; warnings: string[]; tempDataInfo: TempDataInfo } {
  const warnings: string[] = []

  if (tempRecords.length === 0) {
    warnings.push('温度记录为空，未进行合并')
    const tempDataInfo: TempDataInfo = {
      source: 'trip_builtin',
      totalPoints: telemetry.length,
      matchedPoints: 0,
      description: '温度记录为空，使用行程文件自带温度数据'
    }
    return { telemetry, warnings, tempDataInfo }
  }

  const tripStart = telemetry[0]?.time || 0
  const tripEnd = telemetry[telemetry.length - 1]?.time || 0
  const tempStart = tempRecords[0].time
  const tempEnd = tempRecords[tempRecords.length - 1].time

  let missingAtStart = 0
  let missingAtEnd = 0

  if (tempStart > tripStart) {
    missingAtStart = Math.round((tempStart - tripStart) / 60000)
    warnings.push(`温度记录比行程晚开始约 ${missingAtStart} 分钟，前段数据无温度记录`)
  }
  if (tempEnd < tripEnd) {
    missingAtEnd = Math.round((tripEnd - tempEnd) / 60000)
    warnings.push(`温度记录比行程早结束约 ${missingAtEnd} 分钟，后段数据无温度记录`)
  }

  const mergedTelemetry = telemetry.map(point => {
    const tempRecord = findClosestTempRecord(point.time, tempRecords)
    if (tempRecord) {
      return {
        ...point,
        compartmentTemp: tempRecord.compartmentTemp,
        outsideTemp: tempRecord.outsideTemp !== undefined ? tempRecord.outsideTemp : point.outsideTemp,
        tempFromFile: true
      }
    }
    return { ...point, tempFromFile: false }
  })

  let matchedCount = 0
  for (const p of mergedTelemetry) {
    if (p.tempFromFile) matchedCount++
  }

  let source: TempDataSource = 'separate_file'
  let description = ''

  if (matchedCount === 0) {
    source = 'trip_builtin'
    description = '温度记录与行程时间不重叠，使用行程文件自带温度数据'
  } else if (matchedCount < telemetry.length) {
    source = 'partial_missing'
    const missingCount = telemetry.length - matchedCount
    description = `使用独立温度文件（${tempFileName || '未知文件'}），${matchedCount}/${telemetry.length} 条数据匹配成功，${missingCount} 条未匹配使用行程自带温度`
  } else {
    description = `使用独立温度文件（${tempFileName || '未知文件'}），全部 ${matchedCount} 条数据匹配成功`
  }

  if (matchedCount > 0 && matchedCount < telemetry.length) {
    warnings.push(`已成功合并 ${matchedCount} 条温度数据点，${telemetry.length - matchedCount} 条未匹配`)
  } else if (matchedCount > 0) {
    warnings.push(`已成功合并全部 ${matchedCount} 条温度数据点`)
  }

  const tempDataInfo: TempDataInfo = {
    source,
    fileName: tempFileName,
    totalPoints: telemetry.length,
    matchedPoints: matchedCount,
    missingAtStart: missingAtStart > 0 ? missingAtStart : undefined,
    missingAtEnd: missingAtEnd > 0 ? missingAtEnd : undefined,
    description
  }

  return { telemetry: mergedTelemetry, warnings, tempDataInfo }
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
