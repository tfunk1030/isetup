// Dark motorsport theme colors
export const COLORS = {
  bg: '#0a0e17',
  card: '#111827',
  cardBorder: '#1e293b',
  accent: '#f59e0b',
  accentDim: '#92400e',
  green: '#10b981',
  red: '#ef4444',
  blue: '#3b82f6',
  cyan: '#06b6d4',
  purple: '#8b5cf6',
  text: '#e2e8f0',
  textDim: '#94a3b8',
  textMuted: '#64748b',
  // Per-corner colors
  LF: '#3b82f6',
  RF: '#ef4444',
  LR: '#06b6d4',
  RR: '#f59e0b',
} as const;

// Tyre temperature thresholds (surface temps, °C)
export const TYRE_TEMP = {
  COLD: 70,
  OK_MIN: 70,
  OK_MAX: 105,
  HOT: 105,
  PEAK_GRIP_MIN: 95,
  PEAK_GRIP_MAX: 100,
  OPERATING_TARGET: 85,
} as const;

// Tyre pressure thresholds (PSI)
export const TYRE_PRESSURE = {
  HIGH_THRESHOLD: 24,
  MIN_COLD_KPA: 152,
  MIN_COLD_PSI: 22.0,
} as const;

// Shock velocity thresholds (mm/s, from Penske Racing Shocks)
export const SHOCK_VELOCITY = {
  LOW_SPEED_MAX: 75,
  HIGH_SPEED_MIN: 75,
  HIGH: 500,
  EXTREME: 700,
} as const;

// Analysis thresholds
export const ANALYSIS = {
  HIGH_SPEED_KPH: 200,
  BOTTOMING_THRESHOLD_MM: 0,
  FRONT_RH_MIN_MM: 30.0, // Sim-enforced minimum
  CONDITIONING_CONSTANT_THRESHOLD: 0.5,
  PRESSURE_CROWN_THRESHOLD: 3, // mid - avg(outer, inner) > 3 = crowning
  PRESSURE_CUP_THRESHOLD: -3,  // < -3 = cupping
} as const;

// Engine temp thresholds (°C)
export const ENGINE_TEMP = {
  WATER_WARNING: 110,
  OIL_WARNING: 130,
} as const;

// Tab definitions
export const TABS = [
  { id: 'overview', label: 'Overview', icon: '\u{1F4CA}' },
  { id: 'tyres', label: 'Tyres', icon: '\u{1F525}' },
  { id: 'platform', label: 'Aero Platform', icon: '\u{1F4D0}' },
  { id: 'dynamics', label: 'Dynamics', icon: '\u26A1' },
  { id: 'setup', label: 'Setup', icon: '\u{1F527}' },
] as const;

// Status badge types
export type StatusType = 'COLD' | 'OK' | 'HOT' | 'HIGH' | 'SAFE' | 'RISK';

export const STATUS_COLORS: Record<StatusType, string> = {
  COLD: COLORS.blue,
  OK: COLORS.green,
  HOT: COLORS.red,
  HIGH: COLORS.accent,
  SAFE: COLORS.green,
  RISK: COLORS.red,
};
