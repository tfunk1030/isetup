// DSP (Digital Signal Processing) module for telemetry analysis
// Provides signal filtering, derived channels, and frequency analysis.

export {
  computeSGCoefficients,
  applySGFilter,
  filterWithPreset,
  getPresetCoefficients,
  computeShockVelocity,
  computePercentiles,
  SG_PRESETS,
  type SGPreset,
} from './savitzky-golay';

export {
  computeDerivedChannels,
  getCarConstants,
  CHASSIS_CONSTANTS,
  type DerivedChannels,
  type CarPhysicalConstants,
} from './derived-channels';

export {
  analyzeOscillation,
  type OscillationAnalysis,
  type OscillationSegment,
} from './fft-analysis';
