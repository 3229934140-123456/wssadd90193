import React, { useState } from 'react'
import ImportPanel from './components/ImportPanel'
import TimelineReview from './components/TimelineReview'
import ReportPage from './components/ReportPage'
import type { TripData, ReviewReport } from './types'
import { generateMockTrip } from './utils/mockData'
import { analyzeTrip } from './utils/analysis'
import './styles/App.css'

type View = 'import' | 'timeline' | 'report'

const App: React.FC = () => {
  const [view, setView] = useState<View>('import')
  const [tripData, setTripData] = useState<TripData | null>(null)
  const [report, setReport] = useState<ReviewReport | null>(null)

  const handleTripLoaded = (data: TripData) => {
    setTripData(data)
    const analysis = analyzeTrip(data)
    setReport(analysis)
    setView('timeline')
  }

  const handleLoadDemo = () => {
    const mockTrip = generateMockTrip()
    handleTripLoaded(mockTrip)
  }

  const handleBack = () => {
    setView('import')
  }

  return (
    <div className="app-container">
      {view === 'import' && (
        <ImportPanel onTripLoaded={handleTripLoaded} onLoadDemo={handleLoadDemo} />
      )}
      {view === 'timeline' && tripData && report && (
        <TimelineReview
          tripData={tripData}
          report={report}
          onBack={handleBack}
          onGoReport={() => setView('report')}
        />
      )}
      {view === 'report' && tripData && report && (
        <ReportPage
          tripData={tripData}
          report={report}
          onBack={() => setView('timeline')}
          onGoHome={handleBack}
        />
      )}
    </div>
  )
}

export default App
