import type {
  AIRecommendationItem,
  AISetupBrief,
  ConfidenceLevel,
  RecommendationExactness,
  SessionAnalysis,
} from './types';
import {
  SIM_CONSTRAINTS,
  IMPACT_HIERARCHY,
  getPhysicsVersionNote,
  getCarDeepKnowledge,
  getTrackGuidance,
} from './domain-knowledge';

const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-pro';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const DEFAULT_OPUS_MODEL = 'claude-opus-4-6';

interface ModelBrief {
  summary: string;
  recommendations: AIRecommendationItem[];
  watchItems: string[];
  confidenceNote: string;
  reasoning: string[];
  assumptions: string[];
}

interface ModelResult {
  modelName: string;
  brief: ModelBrief;
}

function getEnv(name: string): string | undefined {
  const raw = (import.meta.env as Record<string, unknown>)[name];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1).trim();

  throw new Error('No JSON object in model output.');
}

function parseConfidence(value: unknown): ConfidenceLevel {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW' ? value : 'MEDIUM';
}

function parseExactness(value: unknown): RecommendationExactness {
  return value === 'exact' || value === 'inferred' || value === 'blocked' ? value : 'inferred';
}

function dedupeStrings(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function findSourcePath(analysis: SessionAnalysis, parameterKey?: string): string | undefined {
  if (!parameterKey) return undefined;
  return analysis.normalizedSetup.parameters.find((parameter) => parameter.parameterKey === parameterKey)?.sourcePath;
}

function validateRecommendation(
  analysis: SessionAnalysis,
  recommendation: AIRecommendationItem
): AIRecommendationItem {
  const matchedParameter = analysis.normalizedSetup.parameters.find(
    (parameter) => parameter.parameterKey === recommendation.parameterKey
  );

  if (!matchedParameter) {
    return {
      ...recommendation,
      exactness: recommendation.exactness === 'exact' ? 'blocked' : recommendation.exactness,
      assumptions: dedupeStrings(
        [
          ...recommendation.assumptions,
          `Parameter key "${recommendation.parameterKey}" was not found in the parsed setup and cannot be verified.`,
        ],
        4
      ),
      currentSourcePath: undefined,
    };
  }

  const assumptions = recommendation.currentValue !== matchedParameter.displayValue
    ? [...recommendation.assumptions, `Current value grounded to parsed setup (${matchedParameter.displayValue}) from ${matchedParameter.sourcePath}.`]
    : recommendation.assumptions;

  let exactness = recommendation.exactness;
  const mappingAssumptions = [...assumptions];
  if (matchedParameter.mappingQuality === 'ordered' && exactness === 'exact') {
    exactness = 'inferred';
    mappingAssumptions.push(`Parameter mapping used ordered fallback (${matchedParameter.sourcePath}).`);
  } else if (matchedParameter.mappingQuality === 'ambiguous') {
    exactness = exactness === 'blocked' ? 'blocked' : 'inferred';
    mappingAssumptions.push(`Parameter mapping is ambiguous; selected ${matchedParameter.sourcePath}.`);
    if (matchedParameter.candidateSourcePaths && matchedParameter.candidateSourcePaths.length > 1) {
      mappingAssumptions.push(`Candidate paths: ${matchedParameter.candidateSourcePaths.join(', ')}`);
    }
  }

  return {
    ...recommendation,
    displayName: matchedParameter.displayName,
    currentValue: matchedParameter.displayValue,
    currentSourcePath: matchedParameter.sourcePath,
    exactness: recommendation.exactness === 'blocked' ? 'blocked' : exactness,
    assumptions: dedupeStrings(mappingAssumptions, 4),
  };
}

function fallbackRecommendation(analysis: SessionAnalysis, index: number): AIRecommendationItem {
  const recommendation = analysis.recommendations[index];
  const primarySpecific = recommendation.specifics?.[0];
  return {
    parameterKey: recommendation.parameterKey || recommendation.id,
    displayName: primarySpecific?.parameter || recommendation.title,
    currentValue: primarySpecific?.current || 'Telemetry-derived',
    targetValue: primarySpecific?.target || 'Review',
    delta: primarySpecific?.delta || 'Inferred from telemetry',
    reason: recommendation.rationale,
    evidence: recommendation.evidence.slice(0, 3),
    confidence: recommendation.confidence,
    exactness: recommendation.exactness || 'inferred',
    verification: recommendation.verify || ['Validate the change over a fresh 2-3 lap run.'],
    assumptions: recommendation.blockedBy || [],
    source: 'rule-engine',
    currentSourcePath: findSourcePath(analysis, recommendation.parameterKey),
  };
}

function buildFallbackBrief(analysis: SessionAnalysis): AISetupBrief {
  const top = analysis.recommendations.slice(0, 3);
  const watchItems = [
    ...analysis.dataQuality.notes,
    ...top.flatMap((r) => r.evidence).slice(0, 3),
  ];

  return {
    summary: top.length > 0
      ? `Rule engine identified ${analysis.recommendations.length} actionable items. Prioritize critical/warning items first.`
      : 'No urgent setup risks detected from current telemetry. Validate across a longer run.',
    recommendations: top.length > 0
      ? top.map((_, index) => fallbackRecommendation(analysis, index))
      : [{
          parameterKey: 'baseline.hold',
          displayName: 'Current setup baseline',
          currentValue: 'Current setup',
          targetValue: 'Hold',
          delta: 'No urgent change',
          reason: 'No urgent setup risks detected from current telemetry.',
          evidence: ['Rule-engine fallback found no critical items.'],
          confidence: analysis.dataQuality.confidence,
          exactness: 'inferred',
          verification: ['Collect a longer stint before making setup changes.'],
          assumptions: [],
          source: 'rule-engine',
        }],
    watchItems: watchItems.length > 0
      ? watchItems
      : ['No major quality issues detected.'],
    confidenceNote: `Dataset confidence is ${analysis.dataQuality.confidence}.`,
    reasoning: top.map((r) => r.rationale).slice(0, 4),
    disagreements: [],
    source: 'rule-engine',
    modelsUsed: [],
  };
}

function buildPrompt(analysis: SessionAnalysis): string {
  const topRecs = analysis.recommendations.slice(0, 10).map((r) => ({
    id: r.id,
    category: r.category,
    severity: r.severity,
    priority: r.priority,
    title: r.title,
    action: r.action,
    rationale: r.rationale,
    evidence: r.evidence.slice(0, 3),
    specifics: r.specifics || [],
    parameterKey: r.parameterKey ?? null,
    exactness: r.exactness ?? 'inferred',
    expectedEffect: r.expectedEffect ?? null,
    expectedEffectTypes: r.expectedEffectTypes ?? [],
    hypothesis: r.hypothesis ?? null,
    successProbability: r.successProbability ?? null,
    rankScore: r.rankScore ?? null,
    sideEffectRisks: r.sideEffectRisks ?? [],
    doNotTrustIf: r.doNotTrustIf ?? [],
    verify: r.verify || [],
    blockedBy: r.blockedBy || [],
  }));

  const lastPressures = analysis.tyrePressureData[analysis.tyrePressureData.length - 1];
  const lastTemps = analysis.tyreTempData[analysis.tyreTempData.length - 1];

  const rideHeightAvg = analysis.rideHeightData.length > 0 ? {
    LF: Number((analysis.rideHeightData.reduce((s, r) => s + r.LF, 0) / analysis.rideHeightData.length).toFixed(1)),
    RF: Number((analysis.rideHeightData.reduce((s, r) => s + r.RF, 0) / analysis.rideHeightData.length).toFixed(1)),
    LR: Number((analysis.rideHeightData.reduce((s, r) => s + r.LR, 0) / analysis.rideHeightData.length).toFixed(1)),
    RR: Number((analysis.rideHeightData.reduce((s, r) => s + r.RR, 0) / analysis.rideHeightData.length).toFixed(1)),
  } : null;

  const payload = {
    session: {
      car: analysis.header.car,
      track: analysis.header.track,
      validLaps: analysis.validLaps.length,
      bestLapSeconds: Number.isFinite(analysis.bestTime) ? Number(analysis.bestTime.toFixed(2)) : null,
    },
    quality: analysis.dataQuality,
    normalizedSetup: analysis.normalizedSetup.parameters.map((parameter) => ({
      parameterKey: parameter.parameterKey,
      displayName: parameter.displayName,
      displayValue: parameter.displayValue,
      unit: parameter.unit || null,
      sourcePath: parameter.sourcePath,
      valueType: parameter.valueType,
      confidence: parameter.confidence,
      mappingQuality: parameter.mappingQuality,
      candidateSourcePaths: parameter.candidateSourcePaths || [],
    })),
    setupCoverage: {
      architecture: analysis.normalizedSetup.architecture,
      missingKeys: analysis.normalizedSetup.missingKeys,
      unsupportedKeys: analysis.normalizedSetup.unsupportedKeys,
      ambiguousKeys: analysis.normalizedSetup.ambiguousKeys,
      mappingWarnings: analysis.normalizedSetup.mappingWarnings,
    },
    telemetryReasoning: analysis.telemetryReasoning,
    segmentFeatures: analysis.segmentFeatures,
    recommendationGuardrails: analysis.recommendationGuardrails,
    topRecommendations: topRecs,
    keyMetrics: {
      cleanBottoming: analysis.bottoming.clean,
      kerbBottoming: analysis.bottoming.kerb,
      peakLatG: Number(analysis.peakLatG.toFixed(2)),
      peakBrakeG: Number(analysis.peakBrakeG.toFixed(2)),
      fuelPerLap: Number(analysis.fuel.perLap.toFixed(2)),
      tyrePressuresPSI: lastPressures ? { LF: Number(lastPressures.LF.toFixed(1)), RF: Number(lastPressures.RF.toFixed(1)), LR: Number(lastPressures.LR.toFixed(1)), RR: Number(lastPressures.RR.toFixed(1)) } : null,
      avgRideHeightsAtSpeedMM: rideHeightAvg,
      lastLapTyreTemps: lastTemps ? {
        LF: { O: Number(lastTemps.LF.O.toFixed(1)), M: Number(lastTemps.LF.M.toFixed(1)), I: Number(lastTemps.LF.I.toFixed(1)) },
        RF: { O: Number(lastTemps.RF.O.toFixed(1)), M: Number(lastTemps.RF.M.toFixed(1)), I: Number(lastTemps.RF.I.toFixed(1)) },
        LR: { O: Number(lastTemps.LR.O.toFixed(1)), M: Number(lastTemps.LR.M.toFixed(1)), I: Number(lastTemps.LR.I.toFixed(1)) },
        RR: { O: Number(lastTemps.RR.O.toFixed(1)), M: Number(lastTemps.RR.M.toFixed(1)), I: Number(lastTemps.RR.I.toFixed(1)) },
      } : null,
    },
  };

  // Build domain knowledge context
  const domainContext: string[] = [];

  // Sim constraints
  domainContext.push(`SIM CONSTRAINTS: ${JSON.stringify(SIM_CONSTRAINTS.map(c => ({ id: c.id, param: c.parameter, limit: c.limit, unit: c.unit })))}`);

  // Impact hierarchy
  domainContext.push(`IMPACT HIERARCHY (highest first): ${IMPACT_HIERARCHY.map(h => h.description).join(' > ')}`);

  // Physics version
  const physicsNote = getPhysicsVersionNote();
  if (physicsNote) domainContext.push(`PHYSICS: ${physicsNote}`);

  // Car deep knowledge
  const carId = analysis.carProfileId;
  if (carId) {
    const carDeep = getCarDeepKnowledge(carId);
    if (carDeep) {
      domainContext.push(`CAR: ${carDeep.character}. Diff sensitivity: ${carDeep.diffSensitivity}. ${carDeep.damperScaleWarning}. Weaknesses: ${carDeep.weaknesses.join(', ')}`);
    }
  }

  // Track guidance
  const trackId = analysis.trackProfileId;
  if (trackId) {
    const trackGuide = getTrackGuidance(trackId);
    if (trackGuide) {
      domainContext.push(`TRACK: ${trackGuide.surfaceType} surface, wing level ${trackGuide.wingLevel}. ${trackGuide.keyCompromise || ''}. Notes: ${trackGuide.specialNotes.slice(0, 2).join('; ')}`);
    }
  }

  return [
    'You are an elite iRacing GTP setup engineer.',
    'You are receiving structured telemetry reasoning plus the parsed current garage setup.',
    ...domainContext.map(c => `DOMAIN KNOWLEDGE: ${c}`),
    'Return setup recommendations as structured parameter diffs, not prose bullets.',
    'Prefer exact current -> target changes only when the current garage parameter exists in normalizedSetup.',
    'If a recommendation is limited by missing setup values or sim constraints, mark exactness as "blocked" or "inferred" and explain why.',
    'Respect the impact hierarchy when prioritizing recommendations.',
    'Focus on setup engineering only (no driving advice).',
    'Return STRICT JSON only with keys:',
    '{ "summary": string, "recommendations": [{ "parameterKey": string, "displayName": string, "currentValue": string, "targetValue": string, "delta": string, "unit": string|null, "reason": string, "evidence": string[], "confidence": "HIGH"|"MEDIUM"|"LOW", "exactness": "exact"|"inferred"|"blocked", "verification": string[], "assumptions": string[] }], "watchItems": string[<=5], "confidenceNote": string, "reasoning": string[<=6], "assumptions": string[<=4] }',
    'Limit recommendations to the 5 highest-impact setup changes.',
    'Each recommendation must cite telemetry evidence and identify the exact garage parameter when possible.',
    'Input telemetry summary:',
    JSON.stringify(payload),
  ].join('\n');
}

export function hasAIRecommendationConfig(): boolean {
  return Boolean(getEnv('VITE_GEMINI_API_KEY') || getEnv('VITE_ANTHROPIC_API_KEY'));
}

export function getAIRecommendationMode(): 'local' | 'single-model' | 'dual-model' {
  const hasGemini = Boolean(getEnv('VITE_GEMINI_API_KEY'));
  const hasAnthropic = Boolean(getEnv('VITE_ANTHROPIC_API_KEY'));
  if (hasGemini && hasAnthropic) return 'dual-model';
  if (hasGemini || hasAnthropic) return 'single-model';
  return 'local';
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseModelBrief(rawContent: string, analysis: SessionAnalysis): ModelBrief {
  const jsonText = extractJsonObject(rawContent);
  const parsed = JSON.parse(jsonText) as Partial<ModelBrief>;
  const recommendationsRaw = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

  return {
    summary: parsed.summary || 'Model summary unavailable.',
    recommendations: recommendationsRaw.slice(0, 5).map((recommendation, index) => {
      const record = recommendation as Partial<AIRecommendationItem>;
      return validateRecommendation(analysis, {
        parameterKey: typeof record.parameterKey === 'string' && record.parameterKey.trim()
          ? record.parameterKey.trim()
          : `model.rec.${index + 1}`,
        displayName: typeof record.displayName === 'string' && record.displayName.trim()
          ? record.displayName.trim()
          : `Recommendation ${index + 1}`,
        currentValue: typeof record.currentValue === 'string' && record.currentValue.trim()
          ? record.currentValue.trim()
          : 'Unknown',
        targetValue: typeof record.targetValue === 'string' && record.targetValue.trim()
          ? record.targetValue.trim()
          : 'Review',
        delta: typeof record.delta === 'string' && record.delta.trim()
          ? record.delta.trim()
          : 'Inferred',
        unit: typeof record.unit === 'string' && record.unit.trim() ? record.unit.trim() : undefined,
        reason: typeof record.reason === 'string' && record.reason.trim()
          ? record.reason.trim()
          : 'Model did not provide a detailed reason.',
        evidence: Array.isArray(record.evidence) ? dedupeStrings(record.evidence.filter((item): item is string => typeof item === 'string'), 4) : [],
        confidence: parseConfidence(record.confidence),
        exactness: parseExactness(record.exactness),
        verification: Array.isArray(record.verification)
          ? dedupeStrings(record.verification.filter((item): item is string => typeof item === 'string'), 4)
          : [],
        assumptions: Array.isArray(record.assumptions)
          ? dedupeStrings(record.assumptions.filter((item): item is string => typeof item === 'string'), 4)
          : [],
        source: 'ai',
        currentSourcePath: typeof record.currentSourcePath === 'string' ? record.currentSourcePath : undefined,
      });
    }),
    watchItems: Array.isArray(parsed.watchItems) ? parsed.watchItems.slice(0, 5) : [],
    confidenceNote: parsed.confidenceNote || 'Model confidence note unavailable.',
    reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning.slice(0, 6) : [],
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.slice(0, 4) : [],
  };
}

async function queryGemini(prompt: string, analysis: SessionAnalysis): Promise<ModelResult | null> {
  const apiKey = getEnv('VITE_GEMINI_API_KEY');
  if (!apiKey) return null;
  const baseUrl = (getEnv('VITE_GEMINI_BASE_URL') || DEFAULT_GEMINI_BASE_URL).replace(/\/$/, '');
  const model = getEnv('VITE_GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are a meticulous motorsport setup analyst.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}).`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? '';

  return {
    modelName: model,
    brief: parseModelBrief(content, analysis),
  };
}

async function queryOpus(prompt: string, analysis: SessionAnalysis): Promise<ModelResult | null> {
  const apiKey = getEnv('VITE_ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  const baseUrl = (getEnv('VITE_ANTHROPIC_BASE_URL') || DEFAULT_ANTHROPIC_BASE_URL).replace(/\/$/, '');
  const model = getEnv('VITE_OPUS_MODEL') || DEFAULT_OPUS_MODEL;

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1400,
      temperature: 0.2,
      system: 'You are a meticulous motorsport setup analyst.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Opus request failed (${response.status}).`);
  }

  const data = await response.json() as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === 'text')?.text ?? '';

  return {
    modelName: model,
    brief: parseModelBrief(text, analysis),
  };
}

function recommendationMergeKey(recommendation: AIRecommendationItem): string {
  return normalizeText(recommendation.parameterKey || recommendation.displayName);
}

function exactnessRank(exactness: RecommendationExactness): number {
  if (exactness === 'exact') return 2;
  if (exactness === 'inferred') return 1;
  return 0;
}

function confidenceRank(confidence: ConfidenceLevel): number {
  if (confidence === 'HIGH') return 2;
  if (confidence === 'MEDIUM') return 1;
  return 0;
}

function mergeRecommendationPair(first: AIRecommendationItem, second: AIRecommendationItem): AIRecommendationItem {
  const winner = exactnessRank(first.exactness) > exactnessRank(second.exactness)
    || (exactnessRank(first.exactness) === exactnessRank(second.exactness) && confidenceRank(first.confidence) >= confidenceRank(second.confidence))
    ? first
    : second;
  const loser = winner === first ? second : first;
  return {
    ...winner,
    evidence: dedupeStrings([...winner.evidence, ...loser.evidence], 5),
    verification: dedupeStrings([...winner.verification, ...loser.verification], 4),
    assumptions: dedupeStrings([...winner.assumptions, ...loser.assumptions], 4),
  };
}

function mergeRecommendations(results: ModelResult[]): { recommendations: AIRecommendationItem[]; disagreements: string[] } {
  const merged = new Map<string, AIRecommendationItem>();
  const disagreements: string[] = [];

  for (const result of results) {
    for (const recommendation of result.brief.recommendations) {
      const key = recommendationMergeKey(recommendation);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, recommendation);
        continue;
      }
      if (
        normalizeText(existing.targetValue) !== normalizeText(recommendation.targetValue)
        || normalizeText(existing.delta) !== normalizeText(recommendation.delta)
      ) {
        disagreements.push(`${result.modelName}: ${recommendation.displayName} targets ${recommendation.targetValue} (${recommendation.delta})`);
      }
      merged.set(key, mergeRecommendationPair(existing, recommendation));
    }
  }

  return {
    recommendations: [...merged.values()].slice(0, 5),
    disagreements: dedupeStrings(disagreements, 4),
  };
}

function buildConsensusBrief(results: ModelResult[], analysis: SessionAnalysis): AISetupBrief {
  if (results.length === 0) return buildFallbackBrief(analysis);
  if (results.length === 1) {
    const single = results[0];
    return {
      summary: single.brief.summary,
      recommendations: single.brief.recommendations.length > 0
        ? single.brief.recommendations
        : buildFallbackBrief(analysis).recommendations,
      watchItems: single.brief.watchItems,
      confidenceNote: `${single.brief.confidenceNote} Dataset confidence: ${analysis.dataQuality.confidence}.`,
      reasoning: single.brief.reasoning,
      disagreements: single.brief.assumptions,
      source: 'single-model',
      modelsUsed: [single.modelName],
    };
  }

  const [first, second] = results;
  const mergedWatch = dedupeStrings(
    [...first.brief.watchItems, ...second.brief.watchItems],
    5
  );
  const mergedReasoning = dedupeStrings(
    [...first.brief.reasoning, ...second.brief.reasoning],
    6
  );
  const mergedRecommendations = mergeRecommendations(results);
  const disagreementDetails = dedupeStrings(
    [
      ...mergedRecommendations.disagreements,
      ...first.brief.assumptions.map((item) => `${first.modelName}: ${item}`),
      ...second.brief.assumptions.map((item) => `${second.modelName}: ${item}`),
    ],
    5
  );

  return {
    summary: [
      `Consensus from ${first.modelName} + ${second.modelName}.`,
      first.brief.summary,
      second.brief.summary,
    ].join(' '),
    recommendations: mergedRecommendations.recommendations.length > 0
      ? mergedRecommendations.recommendations
      : buildFallbackBrief(analysis).recommendations,
    watchItems: mergedWatch.length > 0 ? mergedWatch : analysis.dataQuality.notes.slice(0, 4),
    confidenceNote: `Dual-model synthesis complete. ${analysis.dataQuality.confidence} telemetry confidence. Resolve disagreements before final setup lock.`,
    reasoning: mergedReasoning,
    disagreements: disagreementDetails,
    source: 'consensus',
    modelsUsed: [first.modelName, second.modelName],
  };
}

export async function generateAISetupBrief(analysis: SessionAnalysis): Promise<AISetupBrief> {
  const prompt = buildPrompt(analysis);
  if (!hasAIRecommendationConfig()) {
    return buildFallbackBrief(analysis);
  }

  try {
    const settled = await Promise.allSettled([queryGemini(prompt, analysis), queryOpus(prompt, analysis)]);
    const successful: ModelResult[] = settled
      .filter((r): r is PromiseFulfilledResult<ModelResult | null> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((v): v is ModelResult => v != null);

    return buildConsensusBrief(successful, analysis);
  } catch {
    return buildFallbackBrief(analysis);
  }
}
