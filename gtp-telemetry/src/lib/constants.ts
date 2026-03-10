export const COLORS = {
  bg: 'var(--color-bg)',
  bgSubtle: 'var(--color-bg-subtle)',
  bgElevated: 'var(--color-bg-elevated)',
  card: 'var(--color-card)',
  cardHover: 'var(--color-card-hover)',
  cardBorder: 'var(--color-card-border)',
  cardBorderHover: 'var(--color-card-border-hover)',
  surface: 'var(--color-surface)',
  surfaceAlt: 'var(--color-surface-alt)',
  accent: 'var(--color-accent)',
  accentSoft: 'var(--color-accent-soft)',
  accentDim: 'var(--color-accent-dim)',
  accentGlow: 'var(--color-accent-glow)',
  green: 'var(--color-green)',
  greenDim: 'var(--color-green-dim)',
  red: 'var(--color-red)',
  redDim: 'var(--color-red-dim)',
  blue: 'var(--color-blue)',
  blueDim: 'var(--color-blue-dim)',
  cyan: 'var(--color-cyan)',
  cyanDim: 'var(--color-cyan-dim)',
  purple: 'var(--color-purple)',
  text: 'var(--color-text)',
  textDim: 'var(--color-text-dim)',
  textMuted: 'var(--color-text-muted)',
  textSoft: 'var(--color-text-soft)',
  line: 'var(--color-line)',
  LF: 'var(--color-LF)',
  RF: 'var(--color-RF)',
  LR: 'var(--color-LR)',
  RR: 'var(--color-RR)',
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
  LOW_THRESHOLD: 22,
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
  RARB_CHANGE_DELTA: 0.01,
  CONDITIONING_TARGET_TEMP: 85,
  TYRE_WEAR_RISK_THRESHOLD: 90,
} as const;

export const RECOMMENDATION = {
  PLATFORM_CLEAN_BOTTOMING_WARN: 8,
  PLATFORM_CLEAN_BOTTOMING_CRITICAL: 20,
  SPLITTER_MIN_HEIGHT_WARN_MM: 8,
  SPLITTER_MIN_HEIGHT_CRITICAL_MM: 3,
  SHOCK_PEAK_WARN_MM_S: SHOCK_VELOCITY.HIGH,
  SHOCK_PEAK_CRITICAL_MM_S: SHOCK_VELOCITY.EXTREME,
  TYRE_SHAPE_DELTA_WARN_C: 3,
  TYRE_TEMP_SPREAD_WARN_C: 12,
  TYRE_TEMP_SPREAD_CRITICAL_C: 18,
  DRIVER_AID_ACTIVE_RANGE_WARN: 2,
  LOW_VALID_LAP_WARN: 3,
  LOW_VALID_LAP_CRITICAL: 2,
  OPTIONAL_CHANNEL_MISSING_WARN: 10,
  OPTIONAL_CHANNEL_MISSING_CRITICAL: 18,
} as const;

export const CHANNEL_UNITS: Record<string, string> = {
  Speed: 'm/s',
  LatAccel: 'm/s^2',
  LongAccel: 'm/s^2',
  LFpressure: 'kPa',
  RFpressure: 'kPa',
  LRpressure: 'kPa',
  RRpressure: 'kPa',
  LFrideHeight: 'm',
  RFrideHeight: 'm',
  LRrideHeight: 'm',
  RRrideHeight: 'm',
  CFSRrideHeight: 'm',
  LFshockDefl: 'm',
  RFshockDefl: 'm',
  LRshockDefl: 'm',
  RRshockDefl: 'm',
  WaterTemp: 'C',
  OilTemp: 'C',
};

// Engine temp thresholds (°C)
export const ENGINE_TEMP = {
  WATER_WARNING: 110,
  OIL_WARNING: 130,
} as const;

// Tab definitions — icons are Lucide icon names, rendered in TabBar
export const TABS = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
  { id: 'tyres', label: 'Tyres', icon: 'circle-dot' },
  { id: 'platform', label: 'Aero Platform', icon: 'ruler' },
  { id: 'dynamics', label: 'Dynamics', icon: 'zap' },
  { id: 'diagnose', label: 'Diagnose', icon: 'stethoscope' },
  { id: 'compare', label: 'Compare', icon: 'git-compare' },
  { id: 'setup', label: 'Setup', icon: 'wrench' },
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
