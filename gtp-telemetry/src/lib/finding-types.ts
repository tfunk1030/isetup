// ═══════════════════════════════════════════════════════════════
// TELEMETRY FINDING TYPES — Evidence chain architecture
// The intermediate layer between raw data and recommendations.
//
// Pipeline: Raw Data → Findings → Diagnoses → Recommendations
//
// Every recommendation must trace back to specific findings,
// and every finding must trace back to measured data points.
// This "show your work" architecture prevents the overconfidence
// problem where the engine recommends specific values from
// insufficient evidence.
// ═══════════════════════════════════════════════════════════════

import type { ConfidenceLevel, RecommendationSeverity } from './types';

// ─── Finding (Stage 2: computed observation from raw data) ──────

export type FindingCategory =
  | 'thermal'      // Tyre temps, engine temps, conditioning
  | 'mechanical'   // Pressures, wear, spring/damper state
  | 'aero'         // Ride heights, bottoming, splitter, aero balance
  | 'balance'      // Understeer/oversteer gradient, cross-weight
  | 'traction'     // Wheelspin, diff behavior, TC activity
  | 'dynamics'     // Shock velocities, oscillation, bump stop contact
  | 'driver-aids'; // TC climbing, brake bias drift, ARB overuse

export interface TelemetryFinding {
  /** Unique finding ID (e.g., "thermal-lf-outer-hot", "aero-porpoising-front") */
  id: string;
  /** Finding domain category */
  category: FindingCategory;
  /** Human-readable observation */
  observation: string;
  /** Metric identifier (e.g., "tyreTempGradient.LF", "rideHeightSigma.front") */
  metric: string;
  /** Measured value */
  value: number;
  /** Normal/acceptable range for this metric */
  normalRange: [number, number];
  /** How far outside normal (ratio: 1.0 = at boundary, 2.0 = 2x beyond) */
  deviation: number;
  /** Direction of deviation */
  deviationDirection: 'above' | 'below' | 'inverted';
  /** Number of telemetry samples supporting this finding */
  dataPoints: number;
  /** Lap consistency: fraction of valid laps showing this pattern (0-1) */
  lapConsistency: number;
  /** Which specific corners? null = whole-lap finding */
  cornerIds: string[] | null;
  /** Related findings that correlate with this one */
  relatedFindingIds: string[];
  /** Numerical confidence (0-1) */
  confidence: number;
  /** Severity for UI rendering */
  severity: RecommendationSeverity;
}

// ─── Diagnosis (Stage 3: causal interpretation) ─────────────────

export interface Diagnosis {
  /** Unique diagnosis ID */
  id: string;
  /** IDs of findings that support this diagnosis */
  findingIds: string[];
  /** Human-readable diagnosis statement */
  diagnosis: string;
  /** Identified root cause */
  rootCause: string;
  /** Setup parameter keys that could address this */
  parameterKeys: string[];
  /** Confidence score (0-1), factoring in evidence strength */
  confidenceScore: number;
  /** Display confidence level */
  confidenceLevel: ConfidenceLevel;
  /** IDs of conflicting diagnoses (mutually exclusive) */
  conflictsWith: string[];
  /** Corner phase when this manifests */
  phase?: 'entry' | 'mid' | 'exit' | 'straight';
  /** Speed regime */
  speedRegime?: 'low' | 'mid' | 'high' | 'any';
}

// ─── Enhanced Recommendation (Stage 4) ──────────────────────────

export interface RecommendationConflict {
  /** ID of the conflicting recommendation */
  recId: string;
  /** Why they conflict */
  explanation: string;
  /** Which takes priority */
  resolution: 'this-wins' | 'other-wins' | 'user-choice';
}

export interface RecommendationTradeoff {
  /** What improves */
  helps: string[];
  /** What worsens */
  hurts: string[];
  /** Net expected lap time effect (negative = faster) */
  expectedLapTimeDelta?: [number, number]; // [min, max] in seconds
}

export interface CalibrationScore {
  /** Minimum supported confidence (0-1) */
  belief: number;
  /** Maximum possible confidence (0-1) */
  plausibility: number;
  /** Number of independent evidence sources */
  evidenceCount: number;
  /** Quality of underlying data (0-1) */
  dataQuality: number;
}

// ─── Coupling Matrix (for conflict detection) ───────────────────

export type CouplingDirection = 'same' | 'inverse' | 'complex';

export interface CouplingEffect {
  /** 'same' = both increase roll stiffness; 'inverse' = one up, other down; 'complex' = non-linear */
  direction: CouplingDirection;
  /** Coupling strength (0-1): 0 = independent, 1 = strongly coupled */
  strength: number;
  /** Explanation */
  note: string;
}

/**
 * Vehicle dynamics parameter coupling matrix.
 * Maps parameterKey → { relatedKey → CouplingEffect }
 *
 * When two recommendations affect coupled parameters, the
 * recommendation builder flags the coupling and generates
 * a tradeoff explanation.
 */
export const PARAMETER_COUPLING: Record<string, Record<string, CouplingEffect>> = {
  // ── Platform (front) ──────────────────────────────────────────
  'platform.frontHeaveSpring': {
    'platform.rearHeaveSpring': {
      direction: 'complex',
      strength: 0.7,
      note: 'Front/rear heave ratio controls pitch behavior and aero balance under braking',
    },
    'suspension.frontArbBlades': {
      direction: 'same',
      strength: 0.5,
      note: 'Both increase front roll stiffness distribution; combined effect is amplified',
    },
    'platform.frontHeavePerch': {
      direction: 'complex',
      strength: 0.8,
      note: 'Heave spring rate and perch offset together set the ride height operating window',
    },
  },
  'platform.rearHeaveSpring': {
    'suspension.rearArbBlades': {
      direction: 'same',
      strength: 0.5,
      note: 'Both increase rear roll stiffness; excessive combined stiffness locks rear end',
    },
    'platform.rearHeavePerch': {
      direction: 'complex',
      strength: 0.8,
      note: 'Rear heave spring rate and perch together control rear ride height and rake',
    },
  },

  // ── Suspension (ARBs) ─────────────────────────────────────────
  'suspension.frontArbBlades': {
    'suspension.rearArbBlades': {
      direction: 'inverse',
      strength: 0.9,
      note: 'Front/rear ARB ratio is the primary balance tuning tool; changing one without the other shifts balance dramatically',
    },
    'alignment.frontCamber': {
      direction: 'complex',
      strength: 0.3,
      note: 'Stiffer ARB = less roll = less dynamic camber change; may need more static camber to compensate',
    },
  },
  'suspension.rearArbBlades': {
    'diff.rearPreload': {
      direction: 'complex',
      strength: 0.4,
      note: 'Both affect rear-end rotation: higher preload + stiffer rear ARB compounds mid-corner understeer',
    },
  },

  // ── Alignment ─────────────────────────────────────────────────
  'alignment.frontToe': {
    'alignment.rearToe': {
      direction: 'inverse',
      strength: 0.5,
      note: 'Front toe-out + rear toe-in = more rotation; both toe-out = instability',
    },
  },
  'alignment.frontCamber': {
    'tyres.frontColdPressure': {
      direction: 'complex',
      strength: 0.4,
      note: 'Camber affects tyre contact patch shape; pressure affects contact patch size. Both influence thermal distribution.',
    },
  },

  // ── Aero ──────────────────────────────────────────────────────
  'aero.rearWingAngle': {
    'platform.frontPushrod': {
      direction: 'complex',
      strength: 0.6,
      note: 'Wing angle sets total downforce level; pushrod sets mechanical aero balance. Both affect front:rear ratio.',
    },
    'platform.rearPushrod': {
      direction: 'complex',
      strength: 0.6,
      note: 'Wing angle + rear pushrod together control rear ride height and rake angle.',
    },
  },

  // ── Brakes ────────────────────────────────────────────────────
  'brakes.bias': {
    'alignment.frontToe': {
      direction: 'complex',
      strength: 0.3,
      note: 'Brake bias affects entry rotation; front toe-out also affects entry rotation. Combined extreme can cause snap oversteer on entry.',
    },
  },

  // ── Differential ──────────────────────────────────────────────
  'diff.rearPreload': {
    'diff.rearCoast': {
      direction: 'same',
      strength: 0.6,
      note: 'Both affect rear-end stability on coast/decel; high preload + low coast ramp = very locked rear under braking',
    },
    'diff.rearDrive': {
      direction: 'same',
      strength: 0.5,
      note: 'Both affect traction on exit; high preload + high drive ramp = very locked on power',
    },
  },

  // ── Dampers ───────────────────────────────────────────────────
  'dampers.LF.hsComp': {
    'dampers.RF.hsComp': {
      direction: 'same',
      strength: 0.9,
      note: 'Front pair should generally be matched; asymmetry causes diagonal weight transfer issues',
    },
  },
  'dampers.LR.hsComp': {
    'dampers.RR.hsComp': {
      direction: 'same',
      strength: 0.9,
      note: 'Rear pair should generally be matched',
    },
  },
};

// ─── Analysis depth (graceful degradation) ──────────────────────

export type AnalysisDepth = 'full' | 'directional' | 'observational';

/**
 * Determine how deep the analysis should go based on data quality.
 *
 * - 'full': All findings + recommendations with exact values
 * - 'directional': Findings + directional recs only (no exact values)
 * - 'observational': Only findings, no recommendations
 */
export function selectAnalysisDepth(
  confidence: ConfidenceLevel,
  validLapCount: number,
): AnalysisDepth {
  if (confidence === 'HIGH' && validLapCount >= 5) return 'full';
  if (confidence === 'MEDIUM' || validLapCount >= 3) return 'directional';
  return 'observational';
}
