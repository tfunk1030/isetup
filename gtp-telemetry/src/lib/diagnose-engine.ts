// ═══════════════════════════════════════════════════════════════
// DIAGNOSE ENGINE — Natural language handling problem → setup changes
// ═══════════════════════════════════════════════════════════════

import type {
  DiagnoseInput,
  DiagnoseResult,
  ParameterChange,
  SessionAnalysis,
  CornerPhase,
  SpeedRegime,
  HandlingSymptom,
} from './types';
import {
  TRACK_SETUP_GUIDANCE,
  CAR_DEEP_KNOWLEDGE,
  WET_PROTOCOL,
  getImpactRank,
  isVisionTreadActive,
  matchDiagnosticRules,
} from './domain-knowledge';

// ── Keyword classification ─────────────────────────────────────

const PHASE_KEYWORDS: Record<CornerPhase, string[]> = {
  entry: ['entry', 'turn-in', 'turn in', 'braking', 'trail brake', 'trail-brake', 'initial rotation', 'tip-in'],
  mid: ['mid-corner', 'mid corner', 'apex', 'steady state', 'steady-state', 'middle', 'sustained'],
  exit: ['exit', 'power', 'throttle', 'acceleration', 'drive', 'traction', 'power-on', 'power on'],
};

const SYMPTOM_KEYWORDS: Record<HandlingSymptom, string[]> = {
  understeer: ['understeer', 'push', 'plough', 'plow', 'tight', 'won\'t rotate', 'wont rotate', 'not turning', 'sluggish'],
  oversteer: ['oversteer', 'loose', 'snap', 'rotate too much', 'spinning', 'tail out', 'rear slides', 'kick'],
  instability: ['unstable', 'dancing', 'nervous', 'inconsistent', 'floaty', 'unpredictable', 'wandering'],
  'traction-loss': ['traction', 'wheelspin', 'no grip', 'slipping', 'spinning wheels', 'no drive'],
  bottoming: ['bottoming', 'bottomed', 'scraping', 'ride height', 'splitter', 'platform collapse'],
};

const SPEED_KEYWORDS: Record<SpeedRegime, string[]> = {
  low: ['low speed', 'slow corner', 'hairpin', 'tight', 'chicane', 'slow'],
  mid: ['medium speed', 'mid speed', 'sweeper', 'direction change', 'esses', 'transition'],
  high: ['high speed', 'fast corner', 'flat out', 'aero', 'downforce', 'blanchimont', 'eau rouge', '130r', 'kink'],
};

function classifyFromText(text: string): {
  phase?: CornerPhase;
  symptom?: HandlingSymptom;
  speedRegime?: SpeedRegime;
} {
  const lower = text.toLowerCase();
  let phase: CornerPhase | undefined;
  let symptom: HandlingSymptom | undefined;
  let speedRegime: SpeedRegime | undefined;

  for (const [p, keywords] of Object.entries(PHASE_KEYWORDS) as [CornerPhase, string[]][]) {
    if (keywords.some(k => lower.includes(k))) { phase = p; break; }
  }
  for (const [s, keywords] of Object.entries(SYMPTOM_KEYWORDS) as [HandlingSymptom, string[]][]) {
    if (keywords.some(k => lower.includes(k))) { symptom = s; break; }
  }
  for (const [sr, keywords] of Object.entries(SPEED_KEYWORDS) as [SpeedRegime, string[]][]) {
    if (keywords.some(k => lower.includes(k))) { speedRegime = sr; break; }
  }

  return { phase, symptom, speedRegime };
}

// ── Main diagnose function ─────────────────────────────────────

export function diagnose(input: DiagnoseInput, analysis?: SessionAnalysis): DiagnoseResult {
  // Classify from free text if provided
  let phase = input.phase;
  let symptom = input.symptom;
  let speedRegime = input.speedRegime;

  if (input.freeText) {
    const classified = classifyFromText(input.freeText);
    if (!phase) phase = classified.phase;
    if (!symptom) symptom = classified.symptom;
    if (!speedRegime) speedRegime = classified.speedRegime;
  }

  // Default to understeer if no symptom detected
  if (!symptom) symptom = 'understeer';

  // Match diagnostic rules
  const matchedRules = matchDiagnosticRules(symptom, phase, speedRegime);

  // Build parameter changes from matched rules
  const parameterChanges: ParameterChange[] = matchedRules.flatMap(rule =>
    rule.primaryParameters.map(paramKey => ({
      parameterKey: paramKey,
      displayName: formatParamName(paramKey),
      direction: rule.direction,
      magnitude: rule.magnitude,
      tradeoff: rule.tradeoff,
      verifyChannel: rule.verifyChannel,
      confidence: rule.confidence,
      impactRank: getImpactRank(paramKey),
      telemetryEvidence: analysis ? getTelemetryEvidence(paramKey, analysis) : undefined,
    }))
  );

  // Deduplicate by parameterKey, keeping highest-confidence
  const deduped = new Map<string, ParameterChange>();
  for (const change of parameterChanges) {
    const existing = deduped.get(change.parameterKey);
    if (!existing || change.confidence === 'HIGH') {
      deduped.set(change.parameterKey, change);
    }
  }

  // Sort by impact hierarchy
  const sorted = [...deduped.values()].sort((a, b) => a.impactRank - b.impactRank);

  // Track-specific notes
  const trackNotes: string[] = [];
  const carId = input.carId || analysis?.carProfileId;
  const trackId = input.trackId || analysis?.trackProfileId;

  if (trackId) {
    const guidance = TRACK_SETUP_GUIDANCE[trackId];
    if (guidance) {
      trackNotes.push(`Surface: ${guidance.surfaceType}`);
      trackNotes.push(`Recommended wing level: ${guidance.wingLevel}`);
      if (guidance.hsCompSlopeGuidance) {
        trackNotes.push(`HS comp slope: ${guidance.hsCompSlopeGuidance}`);
      }
      if (guidance.keyCompromise) {
        trackNotes.push(`Key compromise: ${guidance.keyCompromise}`);
      }
      trackNotes.push(...guidance.specialNotes.slice(0, 3));
    }
  }

  // Car-specific notes
  const carNotes: string[] = [];
  if (carId) {
    const deep = CAR_DEEP_KNOWLEDGE[carId];
    if (deep) {
      carNotes.push(deep.character);
      carNotes.push(`Diff sensitivity: ${deep.diffSensitivity}`);
      carNotes.push(deep.damperScaleWarning);
      if (deep.weaknesses.length > 0) {
        carNotes.push(`Key weakness: ${deep.weaknesses[0]}`);
      }
    }
  }

  // Wet protocol
  const wetProtocol = input.isWet
    ? WET_PROTOCOL.map(step => ({
        action: step.action,
        magnitude: step.magnitude,
        rationale: step.rationale,
      }))
    : null;

  // Physics version note
  const physicsNote = isVisionTreadActive()
    ? 'S1 2026 Vision tread: fronts need 13-15 laps to reach 85°C, rears 8-9 laps. Short stint cold tyres are normal.'
    : null;

  return {
    matchedSymptom: symptom,
    matchedPhase: phase,
    matchedSpeed: speedRegime,
    parameterChanges: sorted.slice(0, 10),
    trackNotes,
    carNotes,
    wetProtocol,
    physicsNote,
  };
}

// ── Helpers ────────────────────────────────────────────────────

function formatParamName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .replace(/^(front|rear|LF|RF|LR|RR)\s/i, (m) => m.toUpperCase())
    .trim();
}

function getTelemetryEvidence(paramKey: string, analysis: SessionAnalysis): string | undefined {
  // Cross-reference parameter key with analysis data
  if (paramKey.includes('HeaveSpring') || paramKey.includes('ThirdSpring')) {
    if (analysis.bottoming.clean > 0) {
      return `Telemetry confirms: ${analysis.bottoming.clean} clean bottoming events`;
    }
  }
  if (paramKey.includes('DiffPreload')) {
    const rearWear = analysis.tyreWearData[analysis.tyreWearData.length - 1];
    if (rearWear) {
      const rearAvg = (rearWear.LR.avg + rearWear.RR.avg) / 2;
      const frontAvg = (rearWear.LF.avg + rearWear.RF.avg) / 2;
      if (rearAvg < frontAvg - 2) {
        return `Telemetry confirms: rear wearing faster (${rearAvg.toFixed(1)}% vs front ${frontAvg.toFixed(1)}%)`;
      }
    }
  }
  if (paramKey.includes('Arb') || paramKey.includes('ARB')) {
    const reasoning = analysis.telemetryReasoning.find(r => r.phase === 'mid');
    if (reasoning) {
      return `Telemetry: ${reasoning.summary}`;
    }
  }
  return undefined;
}
