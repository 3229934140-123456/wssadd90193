import React, { useState } from 'react'
import type { TripData } from '../types'

interface ImportPanelProps {
  onTripLoaded: (data: TripData) => void
  onLoadDemo: () => void
}

interface FileInfo {
  name: string
  type: 'trip' | 'temperature'
  size: string
}

const ImportPanel: React.FC<ImportPanelProps> = ({ onTripLoaded, onLoadDemo }) => {
  const [tripFile, setTripFile] = useState<FileInfo | null>(null)
  const [tempFile, setTempFile] = useState<FileInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSelectTripFile = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.selectFile([
        { name: '行程文件', extensions: ['json', 'csv', 'txt'] },
        { name: '所有文件', extensions: ['*'] }
      ])
      if (result) {
        setTripFile({
          name: result.fileName,
          type: 'trip',
          size: formatSize(result.content.length)
        })
      }
    } else {
      setTripFile({
        name: 'trip_log_20240115.json',
        type: 'trip',
        size: '256 KB'
      })
    }
  }

  const handleSelectTempFile = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.selectFile([
        { name: '温度记录', extensions: ['csv', 'json', 'txt'] },
        { name: '所有文件', extensions: ['*'] }
      ])
      if (result) {
        setTempFile({
          name: result.fileName,
          type: 'temperature',
          size: formatSize(result.content.length)
        })
      }
    } else {
      setTempFile({
        name: 'temp_record_20240115.csv',
        type: 'temperature',
        size: '128 KB'
      })
    }
  }

  const handleStartReview = () => {
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      onLoadDemo()
    }, 800)
  }

  const canStart = tripFile !== null

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
            <div className="file-upload-item" onClick={handleSelectTripFile}>
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
                    <div className="file-hint">支持 JSON / CSV 格式</div>
                  </>
                )}
              </div>
              <div className="file-action">
                {tripFile ? '✓ 已选择' : '选择文件'}
              </div>
            </div>

            <div className="file-upload-item" onClick={handleSelectTempFile}>
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
                    <div className="file-hint">支持 CSV / JSON 格式（可选）</div>
                  </>
                )}
              </div>
              <div className="file-action">
                {tempFile ? '✓ 已选择' : '选择文件'}
              </div>
            </div>
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
