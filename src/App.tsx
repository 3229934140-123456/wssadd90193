import React, { useState } from 'react'
import ImportPanel from './components/ImportPanel'
import TimelineReview from './components/TimelineReview'
import ReportPage from './components/ReportPage'
import type { TripData, ReviewReport } from './types'
import { generateMockTrip } from './utils/mockData'
import { analyzeTrip } from './utils/analysis'
import type { TripFileData } from './utils/tripParser'
import type { TempRecord } from './utils/tempParser'
import './styles/App.css'

type View = 'import' | 'timeline' | 'report'

interface FileState {
  name: string
  size: string
  valid: boolean
  errors?: string[]
  warnings?: string[]
}

interface ImportState {
  tripFile: FileState | null
  tempFile: FileState | null
  tripFileData: TripFileData | null
  tempRecords: TempRecord[] | null
  timeMatchError: string | null
}

const defaultImportState: ImportState = {
  tripFile: null,
  tempFile: null,
  tripFileData: null,
  tempRecords: null,
  timeMatchError: null
}

const App: React.FC = () => {
  const [view, setView] = useState<View>('import')
  const [tripData, setTripData] = useState<TripData | null>(null)
  const [report, setReport] = useState<ReviewReport | null>(null)
  const [importState, setImportState] = useState<ImportState>(defaultImportState)

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
        <ImportPanel
          onTripLoaded={handleTripLoaded}
          onLoadDemo={handleLoadDemo}
          savedState={importState}
          onStateChange={setImportState}
        />
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
