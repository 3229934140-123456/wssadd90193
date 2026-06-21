import React from 'react'
import type { TripData, ReviewReport, ImprovementItem } from '../types'
import { formatTimeShort, formatDurationFromMs } from '../utils/mockData'
import { generateReportText } from '../utils/analysis'

interface ReportPageProps {
  tripData: TripData
  report: ReviewReport
  onBack: () => void
  onGoHome: () => void
}

const ReportPage: React.FC<ReportPageProps> = ({ tripData, report, onBack, onGoHome }) => {
  const handleExport = async () => {
    const text = generateReportText(tripData, report)
    const fileName = `复盘报告_${tripData.id}.txt`

    if (window.electronAPI) {
      await window.electronAPI.saveReport(text, fileName)
    } else {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 85) return '#10b981'
    if (score >= 70) return '#f59e0b'
    return '#ef4444'
  }

  const getScoreLevel = (score: number) => {
    if (score >= 90) return '优秀'
    if (score >= 80) return '良好'
    if (score >= 70) return '一般'
    if (score >= 60) return '待改进'
    return '较差'
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return '#ef4444'
      case 'medium': return '#f59e0b'
      case 'low': return '#3b82f6'
      default: return '#6b7280'
    }
  }

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'high': return '高'
      case 'medium': return '中'
      case 'low': return '低'
      default: return severity
    }
  }

  const totalFuelSaved = report.improvements.reduce((s, i) => s + (i.fuelSaved || 0), 0)
  const totalCostSaved = report.improvements.reduce((s, i) => s + (i.costSaved || 0), 0)

  return (
    <div className="report-page">
      <header className="report-header">
        <div className="header-left">
          <button className="btn-back" onClick={onBack}>
            ← 返回时间轴
          </button>
          <h2>复盘分析报告</h2>
        </div>
        <div className="header-right">
          <button className="btn btn-secondary" onClick={onGoHome}>
            🏠 首页
          </button>
          <button className="btn btn-primary" onClick={handleExport}>
            📥 导出报告
          </button>
        </div>
      </header>

      <div className="report-content">
        <div className="report-summary">
          <div className="score-section">
            <div className="score-circle" style={{ borderColor: getScoreColor(report.score) }}>
              <div className="score-number" style={{ color: getScoreColor(report.score) }}>
                {report.score}
              </div>
              <div className="score-level">{getScoreLevel(report.score)}</div>
            </div>
            <div className="score-desc">
              <h3>综合节能评分</h3>
              <p>基于油电切换策略、能耗效率和温度管控综合评估</p>
            </div>
          </div>

          <div className="summary-stats">
            <div className="stat-card">
              <div className="stat-icon diesel">⛽</div>
              <div className="stat-info">
                <div className="stat-value">{report.totalFuelUsed.toFixed(1)} L</div>
                <div className="stat-label">燃油消耗</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon electric">⚡</div>
              <div className="stat-info">
                <div className="stat-value">{report.totalBatteryUsed.toFixed(1)} %</div>
                <div className="stat-label">电量消耗</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon time">⏱</div>
              <div className="stat-info">
                <div className="stat-value">{formatDurationFromMs(report.dieselDuration)}</div>
                <div className="stat-label">油机运行</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon time-electric">🔋</div>
              <div className="stat-info">
                <div className="stat-value">{formatDurationFromMs(report.electricDuration)}</div>
                <div className="stat-label">电机运行</div>
              </div>
            </div>
          </div>
        </div>

        <div className={`temp-data-source-card temp-source-${report.tempDataInfo.source}`}>
          <div className="temp-source-header">
            <span className="temp-source-icon">🌡</span>
            <div>
              <div className="temp-source-title">温度数据来源</div>
              <div className="temp-source-type">
                {report.tempDataInfo.source === 'separate_file' ? '独立温度文件 ✓' :
                 report.tempDataInfo.source === 'trip_builtin' ? '行程文件自带温度 ⚠' :
                 '独立温度文件（部分区间未匹配） ⚠'}
              </div>
            </div>
            <div className="temp-source-coverage">
              <div className="coverage-label">数据匹配</div>
              <div className="coverage-value">{report.tempDataInfo.matchedPoints} / {report.tempDataInfo.totalPoints}</div>
            </div>
          </div>
          <div className="temp-source-description">{report.tempDataInfo.description}</div>
          {report.tempDataInfo.fileName && (
            <div className="temp-source-filename">文件：{report.tempDataInfo.fileName}</div>
          )}
        </div>

        <div className="report-details">
          <div className="improvements-section">
            <div className="section-header">
              <h3>🔍 可改进片段</h3>
              <span className="improvement-count">共 {report.improvements.length} 项</span>
            </div>

            {report.improvements.length > 0 ? (
              <div className="improvement-list">
                {report.improvements.map((item, index) => (
                  <ImprovementCard
                    key={item.id}
                    item={item}
                    index={index}
                    severityColor={getSeverityColor(item.severity)}
                    severityLabel={getSeverityLabel(item.severity)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🎉</div>
                <p>本次运输表现优秀，未发现明显的节能改进空间</p>
              </div>
            )}

            {totalFuelSaved > 0 && (
              <div className="savings-summary">
                <div className="savings-item">
                  <span>预估可节省燃油</span>
                  <strong>{totalFuelSaved.toFixed(1)} L</strong>
                </div>
                <div className="savings-item">
                  <span>预估可节省费用</span>
                  <strong>约 {totalCostSaved.toFixed(2)} 元</strong>
                </div>
              </div>
            )}
          </div>

          <div className="suggestions-section">
            <div className="section-header">
              <h3>💡 优化建议</h3>
            </div>
            <div className="suggestion-list">
              {report.suggestions.map((suggestion, index) => (
                <div key={index} className="suggestion-item">
                  <div className="suggestion-number">{index + 1}</div>
                  <div className="suggestion-text">{suggestion}</div>
                </div>
              ))}
            </div>

            <div className="tips-section">
              <h4>📌 常用节能策略</h4>
              <div className="tips-grid">
                <div className="tip-card">
                  <div className="tip-icon">🌙</div>
                  <div className="tip-content">
                    <h5>夜间市区配送</h5>
                    <p>优先使用电机制冷，噪音小且运营成本更低</p>
                  </div>
                </div>
                <div className="tip-card">
                  <div className="tip-icon">⏰</div>
                  <div className="tip-content">
                    <h5>排队预冷</h5>
                    <p>长时间排队前提前强冷，避免途中频繁启动油机</p>
                  </div>
                </div>
                <div className="tip-card">
                  <div className="tip-icon">🚪</div>
                  <div className="tip-content">
                    <h5>开门作业</h5>
                    <p>装卸货时尽量缩短开门时间，减少冷量流失</p>
                  </div>
                </div>
                <div className="tip-card">
                  <div className="tip-icon">🌡</div>
                  <div className="tip-content">
                    <h5>温度控制</h5>
                    <p>根据货物类型合理设定目标温度，避免过度制冷</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const ImprovementCard: React.FC<{
  item: ImprovementItem
  index: number
  severityColor: string
  severityLabel: string
}> = ({ item, index, severityColor, severityLabel }) => {
  const [expanded, setExpanded] = React.useState(false)

  return (
    <div
      className={`improvement-card severity-${item.severity} ${expanded ? 'expanded' : ''}`}
      style={{ borderLeftColor: severityColor }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="improvement-card-header">
        <div className="improvement-index">{index + 1}</div>
        <div className="improvement-info">
          <div className="improvement-title-row">
            <h4>{item.title}</h4>
            <span className="severity-tag" style={{ backgroundColor: severityColor }}>
              {severityLabel}
            </span>
          </div>
          <div className="improvement-time">
            {formatTimeShort(item.startTime)} - {formatTimeShort(item.endTime)}
          </div>
        </div>
        <div className="improvement-toggle">{expanded ? '▲' : '▼'}</div>
      </div>
      {expanded && (
        <div className="improvement-card-body">
          <p className="improvement-description">
            <strong>问题描述：</strong>{item.description}
          </p>
          <p className="improvement-suggestion">
            <strong>优化建议：</strong>{item.suggestion}
          </p>
          {item.fuelSaved && item.fuelSaved > 0 && (
            <p className="improvement-saving">
              <strong>预估收益：</strong>
              节省 {item.fuelSaved} L 燃油，约 {item.costSaved?.toFixed(2)} 元
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default ReportPage
