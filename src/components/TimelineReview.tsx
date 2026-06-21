import React, { useState, useMemo } from 'react'
import type { TripData, TripSegment, TripNode, ReviewReport, ImprovementItem } from '../types'
import { formatTimeShort, formatDurationFromMs } from '../utils/mockData'

interface TimelineReviewProps {
  tripData: TripData
  report: ReviewReport
  onBack: () => void
  onGoReport: () => void
}

const TimelineReview: React.FC<TimelineReviewProps> = ({ tripData, report, onBack, onGoReport }) => {
  const [selectedSegment, setSelectedSegment] = useState<TripSegment | null>(null)
  const [hoveredNode, setHoveredNode] = useState<TripNode | null>(null)

  const totalDuration = tripData.arrivalTime - tripData.departureTime

  const getSegmentStyle = (mode: string) => {
    switch (mode) {
      case 'diesel':
        return { background: 'linear-gradient(90deg, #ef4444, #f97316)', color: '#fff' }
      case 'electric':
        return { background: 'linear-gradient(90deg, #3b82f6, #06b6d4)', color: '#fff' }
      case 'standby':
        return { background: 'linear-gradient(90deg, #6b7280, #9ca3af)', color: '#fff' }
      case 'off':
        return { background: 'linear-gradient(90deg, #374151, #4b5563)', color: '#9ca3af' }
      default:
        return { background: '#6b7280', color: '#fff' }
    }
  }

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'diesel': return '油机制冷'
      case 'electric': return '电机制冷'
      case 'standby': return '待机'
      case 'off': return '关机'
      default: return mode
    }
  }

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'loading': return '📦'
      case 'departure': return '🚀'
      case 'service': return '⛽'
      case 'unloading': return '📤'
      case 'arrival': return '🏁'
      default: return '📍'
    }
  }

  const improvementsAtSegment = useMemo(() => {
    if (!selectedSegment) return []
    return report.improvements.filter(
      imp => imp.startTime <= selectedSegment.endTime && imp.endTime >= selectedSegment.startTime
    )
  }, [selectedSegment, report.improvements])

  const selectedTelemetry = useMemo(() => {
    if (!selectedSegment) return []
    return tripData.telemetry.filter(
      p => p.time >= selectedSegment.startTime && p.time <= selectedSegment.endTime
    )
  }, [selectedSegment, tripData.telemetry])

  const handleSegmentClick = (segment: TripSegment) => {
    setSelectedSegment(segment)
  }

  return (
    <div className="timeline-review">
      <header className="review-header">
        <div className="header-left">
          <button className="btn-back" onClick={onBack}>
            ← 返回
          </button>
          <div className="trip-info">
            <h2>{tripData.route}</h2>
            <div className="trip-meta">
              <span className="meta-item">🚛 {tripData.vehiclePlate}</span>
              <span className="meta-item">📋 {tripData.id}</span>
              <span className="meta-item">
                ⏱ {formatTimeShort(tripData.departureTime)} - {formatTimeShort(tripData.arrivalTime)}
              </span>
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className="score-badge">
            <span className="score-label">评分</span>
            <span className="score-value">{report.score}</span>
          </div>
          <button className="btn btn-primary" onClick={onGoReport}>
            查看完整报告 →
          </button>
        </div>
      </header>

      <div className="review-body">
        <div className="timeline-section">
          <div className="timeline-header">
            <h3>运输时间轴</h3>
            <div className="legend">
              <div className="legend-item">
                <span className="legend-color diesel"></span>
                <span>油机制冷</span>
              </div>
              <div className="legend-item">
                <span className="legend-color electric"></span>
                <span>电机制冷</span>
              </div>
              <div className="legend-item">
                <span className="legend-color standby"></span>
                <span>待机</span>
              </div>
              <div className="legend-item">
                <span className="legend-color off"></span>
                <span>关机</span>
              </div>
            </div>
          </div>

          <div className="timeline-container">
            <div className="timeline-nodes">
              {tripData.nodes.map(node => {
                const left = ((node.time - tripData.departureTime) / totalDuration) * 100
                return (
                  <div
                    key={node.id}
                    className="timeline-node"
                    style={{ left: `${left}%` }}
                    onMouseEnter={() => setHoveredNode(node)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <div className="node-icon">{getNodeIcon(node.type)}</div>
                    <div className="node-label">{node.label}</div>
                    <div className="node-time">{formatTimeShort(node.time)}</div>
                    {hoveredNode?.id === node.id && node.description && (
                      <div className="node-tooltip">{node.description}</div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="timeline-bar">
              {tripData.segments.map(seg => {
                const left = ((seg.startTime - tripData.departureTime) / totalDuration) * 100
                const width = ((seg.endTime - seg.startTime) / totalDuration) * 100
                const style = getSegmentStyle(seg.mode)
                const isSelected = selectedSegment?.id === seg.id
                const hasIssue = report.improvements.some(
                  imp => imp.startTime <= seg.endTime && imp.endTime >= seg.startTime
                )

                return (
                  <div
                    key={seg.id}
                    className={`timeline-segment ${isSelected ? 'selected' : ''} ${hasIssue ? 'has-issue' : ''}`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      ...style
                    }}
                    onClick={() => handleSegmentClick(seg)}
                    title={`${getModeLabel(seg.mode)} - ${formatDurationFromMs(seg.endTime - seg.startTime)}`}
                  >
                    {width > 8 && (
                      <span className="segment-label">
                        {getModeLabel(seg.mode)}
                      </span>
                    )}
                    {hasIssue && <div className="issue-dot"></div>}
                  </div>
                )
              })}
            </div>

            <div className="timeline-scale">
              {[0, 25, 50, 75, 100].map(percent => {
                const time = tripData.departureTime + (totalDuration * percent) / 100
                return (
                  <div key={percent} className="scale-mark" style={{ left: `${percent}%` }}>
                    <span>{formatTimeShort(time)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="temp-chart-section">
            <h3>厢温变化趋势</h3>
            <div className="temp-chart">
              <TempChart telemetry={tripData.telemetry} targetTemp={tripData.targetTemp} />
            </div>
          </div>
        </div>

        <div className="detail-panel">
          <div className="panel-header">
            <h3>时段详情</h3>
            {selectedSegment && (
              <span className="panel-subtitle">
                {formatTimeShort(selectedSegment.startTime)} - {formatTimeShort(selectedSegment.endTime)}
              </span>
            )}
          </div>

          {selectedSegment ? (
            <div className="panel-content">
              <div className="detail-card mode-card" style={getSegmentStyle(selectedSegment.mode)}>
                <div className="detail-mode">{getModeLabel(selectedSegment.mode)}</div>
                <div className="detail-duration">
                  持续 {formatDurationFromMs(selectedSegment.endTime - selectedSegment.startTime)}
                </div>
              </div>

              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">平均厢温</span>
                  <span className="detail-value">{selectedSegment.avgCompartmentTemp}°C</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">平均外温</span>
                  <span className="detail-value">{selectedSegment.avgOutsideTemp}°C</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">燃油消耗</span>
                  <span className="detail-value fuel">{selectedSegment.fuelUsed} L</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">电量消耗</span>
                  <span className="detail-value battery">{selectedSegment.batteryUsed} %</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">开门次数</span>
                  <span className="detail-value">{selectedSegment.doorOpenCount} 次</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">目标温度</span>
                  <span className="detail-value">{tripData.targetTemp}°C</span>
                </div>
              </div>

              {improvementsAtSegment.length > 0 && (
                <div className="improvements-section">
                  <h4>⚡ 可改进点</h4>
                  {improvementsAtSegment.map(imp => (
                    <div key={imp.id} className={`improvement-item severity-${imp.severity}`}>
                      <div className="improvement-header">
                        <span className="severity-badge">
                          {imp.severity === 'high' ? '高' : imp.severity === 'medium' ? '中' : '低'}
                        </span>
                        <span className="improvement-title">{imp.title}</span>
                      </div>
                      <p className="improvement-desc">{imp.description}</p>
                      <p className="improvement-suggestion">💡 {imp.suggestion}</p>
                      {imp.fuelSaved && imp.fuelSaved > 0 && (
                        <p className="improvement-saving">
                          预估节省：{imp.fuelSaved} L 燃油 / 约 {imp.costSaved} 元
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {selectedTelemetry.length > 0 && (
                <div className="telemetry-preview">
                  <h4>📈 数据概览</h4>
                  <div className="telemetry-mini">
                    <span>
                      起始油量：{selectedTelemetry[0].fuelLevel}%
                    </span>
                    <span>
                      结束油量：{selectedTelemetry[selectedTelemetry.length - 1].fuelLevel}%
                    </span>
                    <span>
                      起始电量：{selectedTelemetry[0].batteryLevel}%
                    </span>
                    <span>
                      结束电量：{selectedTelemetry[selectedTelemetry.length - 1].batteryLevel}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="panel-empty">
              <div className="empty-icon">👆</div>
              <p>点击时间轴上的任意时段</p>
              <p className="empty-hint">查看详细数据和节能分析</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const TempChart: React.FC<{ telemetry: any[]; targetTemp: number }> = ({ telemetry, targetTemp }) => {
  const chartRef = React.useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = React.useState({ width: 800, height: 200 })

  React.useEffect(() => {
    const updateSize = () => {
      if (chartRef.current) {
        setDimensions({
          width: chartRef.current.offsetWidth,
          height: 200
        })
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  if (telemetry.length === 0) return null

  const minTemp = Math.min(...telemetry.map(p => p.compartmentTemp)) - 2
  const maxTemp = Math.max(...telemetry.map(p => p.compartmentTemp)) + 2
  const tempRange = maxTemp - minTemp

  const points = telemetry.map((p, i) => {
    const x = (i / (telemetry.length - 1)) * dimensions.width
    const y = dimensions.height - ((p.compartmentTemp - minTemp) / tempRange) * dimensions.height
    return `${x},${y}`
  }).join(' ')

  const targetY = dimensions.height - ((targetTemp - minTemp) / tempRange) * dimensions.height

  return (
    <div className="temp-chart-container" ref={chartRef}>
      <svg width={dimensions.width} height={dimensions.height} className="temp-svg">
        <line
          x1={0}
          y1={targetY}
          x2={dimensions.width}
          y2={targetY}
          stroke="#f97316"
          strokeWidth={1}
          strokeDasharray="5,5"
          className="target-line"
        />
        <text x={5} y={targetY - 5} fill="#f97316" fontSize="11">
          目标 {targetTemp}°C
        </text>
        <polyline
          points={points}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
          className="temp-line"
        />
        <defs>
          <linearGradient id="tempGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`0,${dimensions.height} ${points} ${dimensions.width},${dimensions.height}`}
          fill="url(#tempGradient)"
        />
      </svg>
      <div className="temp-labels">
        <span>{maxTemp.toFixed(0)}°C</span>
        <span>{minTemp.toFixed(0)}°C</span>
      </div>
    </div>
  )
}

export default TimelineReview
