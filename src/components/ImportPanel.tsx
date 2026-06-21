import React, { useState, useEffect } from 'react'
import type { TripData, TempDataInfo } from '../types'
import { parseTripFile, generateSegments, type ParseResult, type TripFileData } from '../utils/tripParser'
import { parseTemperatureFile, mergeTemperatureData, type TempRecord } from '../utils/tempParser'

interface SavedFileState {
  name: string
  size: string
  valid: boolean
  errors?: string[]
  warnings?: string[]
}

interface SavedImportState {
  tripFile: SavedFileState | null
  tempFile: SavedFileState | null
  tripFileData: TripFileData | null
  tempRecords: TempRecord[] | null
  timeMatchError: string | null
}

interface ImportPanelProps {
  onTripLoaded: (data: TripData) => void
  onLoadDemo: () => void
  savedState?: SavedImportState | null
  onStateChange?: (state: SavedImportState) => void
}

interface FileInfo extends SavedFileState {
  content?: string
}

const ImportPanel: React.FC<ImportPanelProps> = ({ onTripLoaded, onLoadDemo, savedState, onStateChange }) => {
  const [tripFile, setTripFile] = useState<FileInfo | null>(savedState?.tripFile ?? null)
  const [tempFile, setTempFile] = useState<FileInfo | null>(savedState?.tempFile ?? null)
  const [isLoading, setIsLoading] = useState(false)
  const [tripFileData, setTripFileData] = useState<TripFileData | null>(savedState?.tripFileData ?? null)
  const [tempRecords, setTempRecords] = useState<TempRecord[] | null>(savedState?.tempRecords ?? null)
  const [timeMatchError, setTimeMatchError] = useState<string | null>(savedState?.timeMatchError ?? null)

  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        tripFile: tripFile ?? null,
        tempFile: tempFile ?? null,
        tripFileData,
        tempRecords,
        timeMatchError
      })
    }
  }, [tripFile, tempFile, tripFileData, tempRecords, timeMatchError, onStateChange])

  const handleSelectTripFile = async () => {
    let fileData: { fileName: string; content: string } | null = null

    if (window.electronAPI) {
      const result = await window.electronAPI.selectFile([
        { name: '行程文件', extensions: ['json', 'csv'] },
        { name: '所有文件', extensions: ['*'] }
      ])
      if (result) {
        fileData = { fileName: result.fileName, content: result.content }
      }
    } else {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,.csv'
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (file) {
          const reader = new FileReader()
          reader.onload = (ev) => {
            const content = ev.target?.result as string
            processTripFile(file.name, content, file.size)
          }
          reader.readAsText(file)
        }
      }
      input.click()
      return
    }

    if (fileData) {
      processTripFile(fileData.fileName, fileData.content, fileData.content.length)
    }
  }

  const processTripFile = (name: string, content: string, size: number) => {
    const result = parseTripFile(content, name)

    const fileInfo: FileInfo = {
      name,
      size: formatSize(size),
      content,
      valid: result.success,
      errors: result.errors,
      warnings: result.warnings
    }

    setTripFile(fileInfo)

    if (result.success && result.data) {
      setTripFileData(result.data)
      checkTimeMatch(result.data, tempRecords)
    } else {
      setTripFileData(null)
      setTimeMatchError(null)
    }
  }

  const checkTimeMatch = (trip: TripFileData | null, temps: TempRecord[] | null) => {
    if (!trip || !temps || temps.length === 0) {
      setTimeMatchError(null)
      return
    }

    const tripStart = trip.departureTime
    const tripEnd = trip.arrivalTime
    const tempStart = temps[0].time
    const tempEnd = temps[temps.length - 1].time

    const overlapStart = Math.max(tripStart, tempStart)
    const overlapEnd = Math.min(tripEnd, tempEnd)
    const overlapDuration = overlapEnd - overlapStart
    const tripDuration = tripEnd - tripStart

    if (overlapDuration <= 0) {
      const tripDate = new Date(tripStart).toLocaleDateString()
      const tempDate = new Date(tempStart).toLocaleDateString()
      setTimeMatchError(
        `温度记录与行程时间完全不重叠。行程时间：${tripDate}，温度记录时间：${tempDate}。请检查两份文件是否匹配。`
      )
      return
    }

    const overlapRatio = overlapDuration / tripDuration
    if (overlapRatio < 0.5) {
      const overlapPercent = Math.round(overlapRatio * 100)
      setTimeMatchError(
        `温度记录仅覆盖了行程的 ${overlapPercent}%，可能不是同一趟运输的数据。建议核对文件后重新选择。`
      )
      return
    }

    setTimeMatchError(null)
  }

  const handleSelectTempFile = async () => {
    let fileData: { fileName: string; content: string } | null = null

    if (window.electronAPI) {
      const result = await window.electronAPI.selectFile([
        { name: '温度记录', extensions: ['csv', 'json'] },
        { name: '所有文件', extensions: ['*'] }
      ])
      if (result) {
        fileData = { fileName: result.fileName, content: result.content }
      }
    } else {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,.csv'
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (file) {
          const reader = new FileReader()
          reader.onload = (ev) => {
            const content = ev.target?.result as string
            processTempFile(file.name, content, file.size)
          }
          reader.readAsText(file)
        }
      }
      input.click()
      return
    }

    if (fileData) {
      processTempFile(fileData.fileName, fileData.content, fileData.content.length)
    }
  }

  const processTempFile = (name: string, content: string, size: number) => {
    const result = parseTemperatureFile(content, name)

    const fileInfo: FileInfo = {
      name,
      size: formatSize(size),
      content,
      valid: result.success,
      errors: result.errors,
      warnings: result.warnings
    }

    setTempFile(fileInfo)

    if (result.success && result.data) {
      setTempRecords(result.data)
      checkTimeMatch(tripFileData, result.data)
    } else {
      setTempRecords(null)
      setTimeMatchError(null)
    }
  }

  const handleStartReview = () => {
    if (!tripFileData) return

    setIsLoading(true)

    try {
      let telemetry = [...tripFileData.telemetry]
      const allWarnings: string[] = []
      let tempDataInfo: TempDataInfo

      if (tempRecords && tempRecords.length > 0) {
        const mergeResult = mergeTemperatureData(telemetry, tempRecords, tempFile?.name)
        telemetry = mergeResult.telemetry
        allWarnings.push(...mergeResult.warnings)
        tempDataInfo = mergeResult.tempDataInfo
      } else {
        allWarnings.push('未上传温度记录，将使用行程文件中的温度数据进行分析')
        tempDataInfo = {
          source: 'trip_builtin',
          totalPoints: telemetry.length,
          matchedPoints: 0,
          description: '未上传温度记录文件，使用行程文件自带温度数据'
        }
      }

      const segments = generateSegments(telemetry)

      const tripData: TripData = {
        id: tripFileData.id,
        vehicleId: tripFileData.vehicleId,
        vehiclePlate: tripFileData.vehiclePlate,
        route: tripFileData.route,
        departureTime: tripFileData.departureTime,
        arrivalTime: tripFileData.arrivalTime,
        targetTemp: tripFileData.targetTemp,
        nodes: tripFileData.nodes,
        telemetry,
        segments,
        tempDataInfo
      }

      setTimeout(() => {
        setIsLoading(false)
        onTripLoaded(tripData)
      }, 500)
    } catch (e) {
      setIsLoading(false)
      alert('数据处理失败：' + (e as Error).message)
    }
  }

  const canStart = tripFile?.valid === true && tempFile?.valid !== false && timeMatchError === null

  const clearTripFile = () => {
    setTripFile(null)
    setTripFileData(null)
    setTimeMatchError(null)
  }

  const clearTempFile = () => {
    setTempFile(null)
    setTempRecords(null)
    setTimeMatchError(null)
  }

  return (
    <div className="import-panel">
      <div className="import-header">
        <div className="logo-section">
          <div className="logo-icon">❄</div>
          <div className="logo-text">
            <h1>冷机节能复盘</h1>
            <p>冷链运输油电切换智能分析工具</p>
          </div>
        </div>
      </div>

      <div className="import-content">
        <div className="import-card">
          <h2>导入运输数据</h2>
          <p className="card-desc">
            导入车辆行程文件和温度记录，系统将自动生成复盘分析报告
          </p>

          <div className="file-upload-area">
            <div className="file-upload-item">
              <div className="file-icon trip-icon">🚚</div>
              <div className="file-info">
                {tripFile ? (
                  <>
                    <div className="file-name">{tripFile.name}</div>
                    <div className="file-size">{tripFile.size}</div>
                  </>
                ) : (
                  <>
                    <div className="file-placeholder">点击导入行程文件</div>
                    <div className="file-hint">支持 JSON / CSV 格式，必需</div>
                  </>
                )}
              </div>
              <div className="file-actions">
                {tripFile ? (
                  <>
                    <span className={`file-status ${tripFile.valid ? 'status-success' : 'status-error'}`}>
                      {tripFile.valid ? '✓ 有效' : '✗ 无效'}
                    </span>
                    <button className="btn-change" onClick={clearTripFile}>更换</button>
                  </>
                ) : (
                  <button className="btn-select" onClick={handleSelectTripFile}>
                    选择文件
                  </button>
                )}
              </div>
            </div>

            {tripFile && tripFile.errors && tripFile.errors.length > 0 && (
              <div className="file-errors error-box">
                <div className="error-title">❌ 文件格式错误</div>
                <ul>
                  {tripFile.errors.slice(0, 8).map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                  {tripFile.errors.length > 8 && (
                    <li>...还有 {tripFile.errors.length - 8} 条错误</li>
                  )}
                </ul>
              </div>
            )}

            {tripFile && tripFile.valid && tripFile.warnings && tripFile.warnings.length > 0 && (
              <div className="file-warnings warning-box">
                <div className="warning-title">⚠️ 注意事项</div>
                <ul>
                  {tripFile.warnings.slice(0, 5).map((warn, idx) => (
                    <li key={idx}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="file-upload-item">
              <div className="file-icon temp-icon">🌡</div>
              <div className="file-info">
                {tempFile ? (
                  <>
                    <div className="file-name">{tempFile.name}</div>
                    <div className="file-size">{tempFile.size}</div>
                  </>
                ) : (
                  <>
                    <div className="file-placeholder">点击导入温度记录</div>
                    <div className="file-hint">支持 CSV / JSON 格式，可选</div>
                  </>
                )}
              </div>
              <div className="file-actions">
                {tempFile ? (
                  <>
                    <span className={`file-status ${tempFile.valid ? 'status-success' : 'status-error'}`}>
                      {tempFile.valid ? '✓ 有效' : '✗ 无效'}
                    </span>
                    <button className="btn-change" onClick={clearTempFile}>更换</button>
                  </>
                ) : (
                  <button className="btn-select" onClick={handleSelectTempFile}>
                    选择文件
                  </button>
                )}
              </div>
            </div>

            {tempFile && tempFile.errors && tempFile.errors.length > 0 && (
              <div className="file-errors error-box">
                <div className="error-title">❌ 温度文件格式错误</div>
                <ul>
                  {tempFile.errors.slice(0, 8).map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                  {tempFile.errors.length > 8 && (
                    <li>...还有 {tempFile.errors.length - 8} 条错误</li>
                  )}
                </ul>
              </div>
            )}

            {tempFile && tempFile.valid && tempFile.warnings && tempFile.warnings.length > 0 && (
              <div className="file-warnings warning-box">
                <div className="warning-title">⚠️ 注意事项</div>
                <ul>
                  {tempFile.warnings.slice(0, 5).map((warn, idx) => (
                    <li key={idx}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}

            {timeMatchError && (
              <div className="time-match-error error-box">
                <div className="error-title">⏱ 时间范围不匹配</div>
                <p>{timeMatchError}</p>
              </div>
            )}

            {!tempFile && tripFile?.valid && (
              <div className="temp-notice info-box">
                <div className="info-title">💡 提示</div>
                <p>未上传温度记录，将使用行程文件中的温度数据。温度记录文件可提供更精准的厢温分析和预冷判断。</p>
              </div>
            )}

            {(tripFile?.valid || (tempFile && tempFile.valid)) && (
              <div className="data-preview">
                <h3 className="preview-title">📋 数据预览</h3>
                <div className="preview-grid">
                  {tripFileData && (
                    <>
                      <div className="preview-item">
                        <span className="preview-label">运输路线</span>
                        <span className="preview-value">{tripFileData.route}</span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">车牌号码</span>
                        <span className="preview-value">{tripFileData.vehiclePlate}</span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">行程编号</span>
                        <span className="preview-value">{tripFileData.id}</span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">节点数量</span>
                        <span className="preview-value">{tripFileData.nodes.length} 个</span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">行程时段</span>
                        <span className="preview-value">
                          {new Date(tripFileData.departureTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          {' ~ '}
                          {new Date(tripFileData.arrivalTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">目标温度</span>
                        <span className="preview-value">{tripFileData.targetTemp}°C</span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">遥测数据点</span>
                        <span className="preview-value">{tripFileData.telemetry.length} 条</span>
                      </div>
                    </>
                  )}
                  {tempRecords && tempRecords.length > 0 && (
                    <>
                      <div className="preview-item">
                        <span className="preview-label">温度记录数</span>
                        <span className="preview-value">{tempRecords.length} 条</span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">温度起止</span>
                        <span className="preview-value">
                          {new Date(tempRecords[0].time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          {' ~ '}
                          {new Date(tempRecords[tempRecords.length - 1].time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {tripFileData && (() => {
                        const tripStart = tripFileData.departureTime
                        const tripEnd = tripFileData.arrivalTime
                        const tempStart = tempRecords[0].time
                        const tempEnd = tempRecords[tempRecords.length - 1].time
                        const overlapStart = Math.max(tripStart, tempStart)
                        const overlapEnd = Math.min(tripEnd, tempEnd)
                        const overlapDuration = Math.max(0, overlapEnd - overlapStart)
                        const tripDuration = tripEnd - tripStart
                        const coverage = tripDuration > 0 ? Math.round((overlapDuration / tripDuration) * 100) : 0
                        return (
                          <div className="preview-item">
                            <span className="preview-label">时间覆盖率</span>
                            <span className={`preview-value coverage-${coverage >= 80 ? 'good' : coverage >= 50 ? 'mid' : 'low'}`}>
                              {coverage}%
                              {coverage < 80 && ' ⚠'}
                            </span>
                          </div>
                        )
                      })()}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="import-actions">
            <button
              className="btn btn-primary"
              onClick={handleStartReview}
              disabled={!canStart || isLoading}
            >
              {isLoading ? '分析中...' : '开始复盘分析'}
            </button>
            <button className="btn btn-secondary" onClick={onLoadDemo}>
              加载示例数据
            </button>
          </div>
        </div>

        <div className="features-section">
          <h3>功能亮点</h3>
          <div className="feature-list">
            <div className="feature-item">
              <div className="feature-icon">📊</div>
              <div className="feature-text">
                <h4>时间轴可视化</h4>
                <p>直观展示装货、发车、停靠、卸货等关键节点</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">⚡</div>
              <div className="feature-text">
                <h4>油电切换分析</h4>
                <p>智能识别油机空转、电量闲置等浪费场景</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">💡</div>
              <div className="feature-text">
                <h4>改进建议</h4>
                <p>生成评分报告和针对性优化建议</p>
              </div>
            </div>
          </div>

          <div className="format-guide">
            <h4>📋 文件格式说明</h4>
            <div className="guide-content">
              <p><strong>行程文件 (JSON):</strong></p>
              <pre>{`{
  "id": "trip-001",
  "vehicleId": "V-001",
  "vehiclePlate": "京A·12345冷",
  "route": "北京 → 天津",
  "departureTime": 1705000000000,
  "arrivalTime": 1705020000000,
  "targetTemp": -18,
  "nodes": [...],
  "telemetry": [...]
}`}</pre>
              <p><strong>行程文件 (CSV) - 必需列：</strong></p>
              <pre>tripId,vehiclePlate,route,targetTemp,time,\ncoolingMode,fuelLevel,batteryLevel,speed,\nnodeType,nodeLabel,compartmentTemp</pre>
              <p className="guide-note">在节点对应的行填写 nodeType（如 departure/arrival）和 nodeLabel 来标记关键节点。</p>
              <p><strong>温度记录 (CSV):</strong></p>
              <pre>time,compartmentTemp,outsideTemp
1705000000,-18.2,25.3
1705000300,-18.0,25.5</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default ImportPanel
