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

// Data filtering constants (physics facts, not judgments)
export const ANALYSIS = {
  HIGH_SPEED_KPH: 200,           // High-speed data filter threshold
  BOTTOMING_THRESHOLD_MM: 0,     // Physics: 0mm = ground contact
  FRONT_RH_MIN_MM: 30.0,        // Sim-enforced garage minimum
  CONDITIONING_CONSTANT_THRESHOLD: 0.5,
  CONDITIONING_TARGET_TEMP: 85,       // Used for laps-to-target calculation
  RARB_CHANGE_DELTA: 0.01,
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

// Tab definitions — icons are Lucide icon names, rendered in TabBar
export const TABS = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
  { id: 'tyres', label: 'Tyres', icon: 'circle-dot' },
  { id: 'platform', label: 'Aero Platform', icon: 'ruler' },
  { id: 'dynamics', label: 'Dynamics', icon: 'zap' },
  { id: 'compare', label: 'Compare', icon: 'git-compare' },
  { id: 'setup', label: 'Setup', icon: 'wrench' },
] as const;
