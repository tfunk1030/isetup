// ═══════════════════════════════════════════════════════════════
// GTP Telemetry Analyzer — Type Definitions
// ═══════════════════════════════════════════════════════════════

// IBT Parser Types

export interface IBTTypeInfo {
  name: string;
  size: number;
}

export const TYPE_MAP: Record<number, IBTTypeInfo> = {
  0: { name: 'char', size: 1 },
  1: { name: 'bool', size: 1 },
  2: { name: 'int32', size: 4 },
  3: { name: 'uint32', size: 4 },
  4: { name: 'float32', size: 4 },
  5: { name: 'float64', size: 8 },
};

export interface ChannelVar {
  type: number;
  offset: number;
  count: number;
  desc: string;
  unit: string;
}

export interface IBTParsed {
  sessionInfo: SessionInfo;
  vars: Record<string, ChannelVar>;
  readChannel: (name: string) => Float64Array | null;
  recordCount: number;
  tickRate: number;
}

// Session Info (from YAML)

export interface SessionInfo {
  WeekendInfo?: WeekendInfo;
  DriverInfo?: DriverInfo;
  CarSetup?: Record<string, unknown>;
  SessionInfo?: unknown;
  [key: string]: unknown;
}

export interface WeekendInfo {
  TrackDisplayName?: string;
  TrackConfigName?: string;
  TrackLength?: string;
  TrackSurfaceTemp?: string;
  TrackAirTemp?: string;
  [key: string]: unknown;
}

export interface DriverInfo {
  DriverCarIdx?: number;
  DriverUserID?: number;
  Drivers?: Driver[];
  [key: string]: unknown;
}

export interface Driver {
  CarIdx?: number;
  UserName?: string;
  CarScreenName?: string;
  CarIsPaceCar?: number;
  [key: string]: unknown;
}

// Analysis Result Types

export interface SessionHeader {
  track: string;
  car: string;
  driver: string;
  airTemp: string;
  trackTemp: string;
  duration: string;
  samples: number;
  hz: number;
  channels: number;
  hasBrakeMig: boolean;
  isBMW: boolean;
  isFerrari: boolean;
}

export interface LapTime {
  lap: number;
  time: number;
  maxSpeed: number;
  timeStr: string;
}

export interface LapData {
  start: number;
  end: number;
  duration: number;
  maxSpeed: number;
  count: number;
}

export interface TyreCornerTemp {
  O: number;
  M: number;
  I: number;
}

export interface TyreTempLap {
  lap: number;
  LF: TyreCornerTemp;
  RF: TyreCornerTemp;
  LR: TyreCornerTemp;
  RR: TyreCornerTemp;
}

export interface TyrePressureLap {
  lap: number;
  LF: number;
  RF: number;
  LR: number;
  RR: number;
}

export interface TyreWearCorner {
  L: number;
  M: number;
  R: number;
  avg: number;
}

export interface TyreWearLap {
  lap: number;
  LF: TyreWearCorner;
  RF: TyreWearCorner;
  LR: TyreWearCorner;
  RR: TyreWearCorner;
}

export interface RideHeightSample {
  pct: number;
  LF: number;
  RF: number;
  LR: number;
  RR: number;
  speed: number;
}

export interface BottomingEvent {
  pct: number;
  corner: string;
  rideHeight: number;
}

export interface BottomingResult {
  clean: number;
  kerb: number;
  byLocation: BottomingEvent[];
}

export interface ShockVelCorner {
  p95: number;
  p99: number;
  peak: number;
}

export interface GForceSample {
  lat: number;
  long: number;
}

export interface FuelData {
  start: number;
  end: number;
  perLap: number;
  range: number;
}

export interface DriverAid {
  avg: number;
  min: number;
  max: number;
  constant: boolean;
}

export interface ConditioningCorner {
  first: number;
  last: number;
  rate: number;
  lapsTo85: number;
}

export interface EngineTempsLap {
  lap: number;
  waterTemp: number;
  oilTemp: number;
}

export interface RARBSpeedBand {
  range: string;
  avgValue: number;
  minValue: number;
  maxValue: number;
  sampleCount: number;
}

export interface RARBLapChange {
  lap: number;
  changeCount: number;
}

export interface RARBChangeEvent {
  pct: number;
  speed: number;
  fromValue: number;
  toValue: number;
}

export interface RARBAnalysis {
  speedBands: RARBSpeedBand[];
  perLapChanges: RARBLapChange[];
  bestLapLog: RARBChangeEvent[];
  available: boolean;
}

export interface SplitterSample {
  pct: number;
  height: number;
  speed: number;
}

export interface SplitterData {
  samples: SplitterSample[];
  minHeight: number;
  avgHeight: number;
  bottomingCount: number;
}

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type RecommendationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type RecommendationExactness = 'exact' | 'inferred' | 'blocked';

// Judgment-free data inventory (replaces DataQualityReport)
export interface DataInventory {
  channelsPresent: string[];
  channelsMissing: string[];
  parserWarnings: string[];
  validLapCount: number;
  totalLapCount: number;
}

export type SetupParameterGroup =
  | 'aero'
  | 'platform'
  | 'suspension'
  | 'dampers'
  | 'alignment'
  | 'brakes'
  | 'diff'
  | 'tyres'
  | 'electronics';

export type SetupMappingQuality = 'exact' | 'ordered';

export interface NormalizedSetupParameter {
  parameterKey: string;
  displayName: string;
  group: SetupParameterGroup;
  axle?: 'front' | 'rear';
  corner?: 'LF' | 'RF' | 'LR' | 'RR';
  sourcePath: string;
  rawValue: string;
  displayValue: string;
  unit?: string;
  valueType: 'number' | 'string';
  numericValue?: number;
  confidence: ConfidenceLevel;
  mappingQuality: SetupMappingQuality;
  ambiguousMatches: string[];
}

export interface NormalizedSetup {
  architecture: 'lmdh' | 'lmh' | 'unknown';
  parameters: NormalizedSetupParameter[];
  missingKeys: string[];
  unsupportedKeys: string[];
  mappingWarnings: string[];
  mappingStats: {
    exact: number;
    ordered: number;
    ambiguous: number;
  };
}

export interface AIRecommendationItem {
  parameterKey: string;
  displayName: string;
  currentValue: string;
  targetValue: string;
  delta: string;
  unit?: string;
  reason: string;
  evidence: string[];
  confidence: ConfidenceLevel;
  exactness: RecommendationExactness;
  verification: string[];
  assumptions: string[];
  source: 'ai';
  currentSourcePath?: string;
  mappingConfidence?: ConfidenceLevel;
  mappingQuality?: SetupMappingQuality;
  mappingAmbiguities?: string[];
}

export interface AISetupBrief {
  summary: string;
  recommendations: AIRecommendationItem[];
  watchItems: string[];
  confidenceNote: string;
  reasoning: string[];
  disagreements: string[];
  dataObservations: string[];
  overallAssessment: string;
  feedbackCorrelation: string;
  source: 'consensus' | 'single-model';
  modelsUsed: string[];
}

// Constraint violation from domain knowledge
export interface ConstraintViolation {
  constraintId: string;
  description: string;
  parameter: string;
  currentValue?: number;
  limit: number;
  unit: string;
  severity: RecommendationSeverity;
  workaround: string;
}

// Driver feedback types (for AI analysis input)
export type CornerPhase = 'entry' | 'mid' | 'exit';
export type SpeedRegime = 'low' | 'mid' | 'high';
export type HandlingSymptom = 'understeer' | 'oversteer' | 'instability' | 'traction-loss' | 'bottoming';

export interface DriverFeedback {
  freeText?: string;
  phase?: CornerPhase;
  symptom?: HandlingSymptom;
  speedRegime?: SpeedRegime;
}

// Setup compare types
export interface SetupDiff {
  parameterKey: string;
  displayName: string;
  group: SetupParameterGroup;
  setupA: { value: string; numeric?: number };
  setupB: { value: string; numeric?: number };
  delta: string;
  handlingImpact: string;
  impactDirection: 'positive' | 'negative' | 'neutral' | 'context-dependent';
  impactMagnitude: 'large' | 'medium' | 'small';
  hierarchyRank: number;
}

export interface CompareResult {
  diffs: SetupDiff[];
  summary: string;
  setupALabel: string;
  setupBLabel: string;
}

export interface SessionAnalysis {
  header: SessionHeader;
  setup: [string, unknown][];
  normalizedSetup: NormalizedSetup;
  lapTimes: LapTime[];
  bestTime: number;
  tyreTempData: TyreTempLap[];
  tyrePressureData: TyrePressureLap[];
  tyreWearData: TyreWearLap[];
  rideHeightData: RideHeightSample[];
  bottoming: BottomingResult;
  shockVelStats: Record<string, ShockVelCorner>;
  gForceData: GForceSample[];
  peakLatG: number;
  peakBrakeG: number;
  peakAccelG: number;
  fuel: FuelData;
  aids: Record<string, DriverAid>;
  conditioning: Record<string, ConditioningCorner> | null;
  engineTemps: EngineTempsLap[];
  rarb: RARBAnalysis | null;
  splitter: SplitterData | null;
  validLaps: number[];
  dataInventory: DataInventory;
  carProfileId: string | null;
  trackProfileId: string | null;
  // Domain knowledge enrichment
  constraintViolations: ConstraintViolation[];
  physicsVersionNote: string | null;
  trackGuidance: import('./domain-knowledge').TrackSetupGuidance | null;
  carDeepKnowledge: import('./domain-knowledge').CarDeepKnowledge | null;
}

// Car Profile

export type ChassisType = 'dallara' | 'multimatic' | 'oreca' | 'ferrari_lmh';
export type DiffArchitecture = 'rear_only' | 'front_and_rear';
export type ARBValueType = 'descriptive' | 'indexed';

export interface CarProfile {
  id: string;
  name: string;
  screenNameMatch: string[];
  chassis: ChassisType;
  architecture: 'lmdh' | 'lmh';
  hasBrakeMigration: boolean;
  pushrodParamName: 'PushrodLengthOffset' | 'PushrodLengthDelta';
  arbValueType: ARBValueType;
  diffArchitecture: DiffArchitecture;
  setupPathPrefix: {
    brakesDiff: string;
    dampers: string;
  };
  defaultBrakeBias: number;
  knownQuirks: string[];
}

// Track Profile

export interface TrackProfile {
  id: string;
  name: string;
  displayNameMatch: string[];
  length_km: number;
  type: string;
  kerbZones: [number, number][];
  validLapWindow: [number, number];
  backStraightZone?: [number, number];
  setupFocus: string;
  mandatoryGearStack?: string | null;
}

// Channels the analysis engine needs
export const ANALYSIS_CHANNELS = [
  'SessionTime', 'Lap', 'LapDistPct', 'Speed', 'LatAccel', 'LongAccel',
  'Throttle', 'Brake', 'SteeringWheelAngle', 'Gear', 'RPM', 'FuelLevel',
  'WaterTemp', 'OilTemp', 'dcBrakeBias', 'dcTractionControl', 'dcTractionControl2',
  'dcABS', 'dcAntiRollFront', 'dcAntiRollRear',
  'LFtempL', 'LFtempM', 'LFtempR', 'RFtempL', 'RFtempM', 'RFtempR',
  'LRtempL', 'LRtempM', 'LRtempR', 'RRtempL', 'RRtempM', 'RRtempR',
  'LFpressure', 'RFpressure', 'LRpressure', 'RRpressure',
  'LFwearL', 'LFwearM', 'LFwearR', 'RFwearL', 'RFwearM', 'RFwearR',
  'LRwearL', 'LRwearM', 'LRwearR', 'RRwearL', 'RRwearM', 'RRwearR',
  'LFrideHeight', 'RFrideHeight', 'LRrideHeight', 'RRrideHeight',
  'CFSRrideHeight', 'HFshockDefl',
  'LFshockDefl', 'RFshockDefl', 'LRshockDefl', 'RRshockDefl',
] as const;

export type AnalysisChannelName = typeof ANALYSIS_CHANNELS[number];

// Extracted channel data (for worker serialization)
export type ChannelData = Record<string, Float64Array | null>;

// Worker message types
export interface WorkerParseRequest {
  type: 'parse';
  buffer: ArrayBuffer;
}

export interface WorkerParseResult {
  type: 'result';
  sessionInfo: SessionInfo;
  vars: Record<string, ChannelVar>;
  channels: Record<string, number[] | null>;
  recordCount: number;
  tickRate: number;
}

export interface WorkerProgress {
  type: 'progress';
  message: string;
}

export interface WorkerError {
  type: 'error';
  message: string;
}

export type WorkerMessage = WorkerParseResult | WorkerProgress | WorkerError;
