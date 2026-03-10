import type {
  ConfidenceLevel,
  RecommendationExpectedGain,
  SetupRecommendation,
  TelemetryReasoningSignal,
  TelemetrySegmentFeature,
} from './types';

interface ImpactEstimateInput {
  recommendation: Pick<SetupRecommendation, 'category' | 'severity' | 'parameterKey' | 'exactness'>;
  architecture: 'lmdh' | 'lmh' | 'unknown';
  dataConfidence: ConfidenceLevel;
  segmentFeatures: TelemetrySegmentFeature[];
  telemetryReasoning: TelemetryReasoningSignal[];
}

interface ImpactEstimate {
  expectedGain: RecommendationExpectedGain;
  modelConfidence: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function confidenceToNumeric(confidence: ConfidenceLevel): number {
  if (confidence === 'HIGH') return 0.82;
  if (confidence === 'MEDIUM') return 0.64;
  return 0.42;
}

function architectureMultiplier(architecture: ImpactEstimateInput['architecture']): number {
  if (architecture === 'lmh') return 1.08;
  if (architecture === 'lmdh') return 1.0;
  return 0.86;
}

function categoryBaseGain(category: ImpactEstimateInput['recommendation']['category']): number {
  switch (category) {
    case 'PLATFORM':
    case 'AERO':
      return -0.14;
    case 'DYNAMICS':
    case 'BRAKES':
      return -0.1;
    case 'TYRES':
      return -0.08;
    case 'AIDS':
      return -0.06;
    case 'POWERTRAIN':
      return -0.05;
    case 'TRACK':
    default:
      return -0.03;
  }
}

function severityMultiplier(severity: ImpactEstimateInput['recommendation']['severity']): number {
  if (severity === 'CRITICAL') return 1.35;
  if (severity === 'WARNING') return 1.0;
  return 0.62;
}

function phaseSignalMultiplier(input: ImpactEstimateInput): number {
  const recommendation = input.recommendation;
  const preferredPhase = recommendation.category === 'PLATFORM' || recommendation.category === 'AERO'
    ? 'platform'
    : recommendation.category === 'TYRES'
      ? 'tyres'
      : recommendation.category === 'BRAKES'
        ? 'entry'
        : recommendation.category === 'DYNAMICS'
          ? 'mid'
          : recommendation.category === 'AIDS'
            ? 'exit'
            : null;

  if (!preferredPhase) return 1;

  const directionalSignal = input.telemetryReasoning.filter((signal) =>
    signal.phase === preferredPhase
    && signal.direction !== 'stable'
    && (!recommendation.parameterKey || signal.candidateParameterKeys.includes(recommendation.parameterKey))
  ).length;
  if (directionalSignal === 0) return 0.88;
  if (directionalSignal === 1) return 1.0;
  return 1.15;
}

function segmentCoverageScore(segmentFeatures: TelemetrySegmentFeature[]): number {
  const expectedCells = 9; // 3 phases x 3 speed bands
  const coverage = segmentFeatures.length / expectedCells;
  return clamp01(coverage);
}

export function estimateRecommendationImpact(input: ImpactEstimateInput): ImpactEstimate {
  const dataScore = confidenceToNumeric(input.dataConfidence);
  const segmentCoverage = segmentCoverageScore(input.segmentFeatures);
  const modelConfidence = clamp01(0.32 + dataScore * 0.34 + segmentCoverage * 0.34);

  const base = categoryBaseGain(input.recommendation.category);
  const severityBoost = severityMultiplier(input.recommendation.severity);
  const phaseBoost = phaseSignalMultiplier(input);
  const architectureBoost = architectureMultiplier(input.architecture);
  const blockedPenalty = input.recommendation.exactness === 'blocked' ? 0.2 : 1;

  const median = Number((base * severityBoost * phaseBoost * architectureBoost * blockedPenalty).toFixed(2));
  const spread = Number((0.07 + (1 - modelConfidence) * 0.16).toFixed(2));
  const interval90: [number, number] = [
    Number((median - spread).toFixed(2)),
    Number((median + spread).toFixed(2)),
  ];

  return {
    expectedGain: {
      metric: 'lapTimeDeltaSec',
      median,
      interval90,
      source: 'counterfactual-model',
    },
    modelConfidence: Number(modelConfidence.toFixed(2)),
  };
}
