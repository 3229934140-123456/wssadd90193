export type CoolingMode = 'diesel' | 'electric' | 'standby' | 'off'

export type TripNodeType = 'loading' | 'departure' | 'service' | 'unloading' | 'arrival'

export type TempDataSource = 'separate_file' | 'trip_builtin' | 'partial_missing'

export interface TripNode {
  id: string
  type: TripNodeType
  time: number
  label: string
  description?: string
}

export interface TelemetryPoint {
  time: number
  compartmentTemp: number
  outsideTemp: number
  fuelLevel: number
  batteryLevel: number
  coolingMode: CoolingMode
  doorOpen: boolean
  speed: number
  coolingPower: number
  tempFromFile?: boolean
}

export interface TripSegment {
  id: string
  startTime: number
  endTime: number
  mode: CoolingMode
  avgCompartmentTemp: number
  avgOutsideTemp: number
  fuelUsed: number
  batteryUsed: number
  doorOpenCount: number
  description?: string
}

export interface TempDataInfo {
  source: TempDataSource
  fileName?: string
  totalPoints: number
  matchedPoints: number
  missingAtStart?: number
  missingAtEnd?: number
  description: string
}

export interface TripData {
  id: string
  vehicleId: string
  vehiclePlate: string
  route: string
  departureTime: number
  arrivalTime: number
  targetTemp: number
  nodes: TripNode[]
  telemetry: TelemetryPoint[]
  segments: TripSegment[]
  tempDataInfo: TempDataInfo
}

export interface ImprovementItem {
  id: string
  type: 'diesel_idle' | 'battery_waste' | 'precool_insufficient' | 'door_cooling'
  severity: 'high' | 'medium' | 'low'
  startTime: number
  endTime: number
  title: string
  description: string
  suggestion: string
  fuelSaved?: number
  costSaved?: number
}

export interface ReviewReport {
  tripId: string
  score: number
  totalFuelUsed: number
  totalBatteryUsed: number
  dieselDuration: number
  electricDuration: number
  standbyDuration: number
  improvements: ImprovementItem[]
  suggestions: string[]
  tempDataInfo: TempDataInfo
}
