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
import { GTP_SYSTEM_PROMPT } from './gtp-system-prompt';

const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-pro';
const DEFAULT_GEMINI_NATIVE_BASE_URL = '/api/google/v1beta';
const DEFAULT_ANTHROPIC_BASE_URL = '/api/anthropic/v1';
const DEFAULT_OPUS_MODEL = 'claude-opus-4-6';
const DEFAULT_OPENROUTER_BASE_URL = '/api/openrouter/api/v1';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-5.4';
const DEFAULT_OPENAI_BASE_URL = '/api/openai/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-5.4';
const geminiModelResolutionCache = new Map<string, string>();

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

export interface AIProviderDebugEntry {
  provider: string;
  configured: boolean;
  keyValid: boolean;
  model: string;
  baseUrl: string;
  status: 'success' | 'error' | 'skipped';
  durationMs: number;
  error?: string;
  recommendations?: number;
}

export interface AIProviderDebugReport {
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  providers: AIProviderDebugEntry[];
}

interface ProviderConfig {
  geminiKey?: string;
  anthropicKey?: string;
  openRouterKey?: string;
  openAIKey?: string;
}

let lastAIProviderDebugReport: AIProviderDebugReport | null = null;
const inFlightBriefByKey = new Map<string, Promise<AISetupBrief>>();

export function getLastAIProviderDebugReport(): AIProviderDebugReport | null {
  return lastAIProviderDebugReport;
}

function getEnv(name: string): string | undefined {
  const raw = (import.meta.env as Record<string, unknown>)[name];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

function getProviderConfig(): ProviderConfig {
  return {
    geminiKey: getEnv('VITE_GEMINI_API_KEY'),
    anthropicKey: getEnv('VITE_ANTHROPIC_API_KEY'),
    openRouterKey: getEnv('VITE_OPENROUTER_API_KEY'),
    openAIKey: getEnv('VITE_OPENAI_API_KEY'),
  };
}

function isAIDebugEnabled(): boolean {
  const value = getEnv('VITE_AI_DEBUG');
  if (!value) return false;
  return value === '1' || value.toLowerCase() === 'true';
}

function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined';
}

function normalizeProviderBaseUrl(baseUrl: string, provider: 'anthropic' | 'openai' | 'openrouter' | 'google-openai' | 'google-native'): string {
  const normalized = baseUrl.replace(/\/$/, '');
  if (isBrowserRuntime()) {
    if (provider === 'anthropic') return '/api/anthropic/v1';
    if (provider === 'openai') return '/api/openai/v1';
    if (provider === 'openrouter') return '/api/openrouter/api/v1';
    if (provider === 'google-openai') return '/api/google/v1beta/openai';
    if (provider === 'google-native') return '/api/google/v1beta';
  }
  if (!isBrowserRuntime()) return normalized;
  if (provider === 'anthropic' && /(^https?:\/\/)?api\.anthropic\.com\/?/i.test(normalized)) {
    return '/api/anthropic/v1';
  }
  if (provider === 'openai' && /(^https?:\/\/)?api\.openai\.com\/?/i.test(normalized)) {
    return '/api/openai/v1';
  }
  if (provider === 'openrouter' && /(^https?:\/\/)?openrouter\.ai\/?/i.test(normalized)) {
    return '/api/openrouter/api/v1';
  }
  if (provider === 'google-openai' && /(^https?:\/\/)?generativelanguage\.googleapis\.com\/?/i.test(normalized)) {
    return '/api/google/v1beta/openai';
  }
  if (provider === 'google-native' && /(^https?:\/\/)?generativelanguage\.googleapis\.com\/?/i.test(normalized)) {
    return '/api/google/v1beta';
  }
  return normalized;
}

function isLikelyGeminiApiKey(key: string): boolean {
  return /^AIza[0-9A-Za-z\-_]{20,}$/.test(key);
}

function isLikelyAnthropicApiKey(key: string): boolean {
  return /^sk-ant-/.test(key);
}

function isLikelyOpenRouterApiKey(key: string): boolean {
  return /^sk-or-v1-/.test(key);
}

function isLikelyOpenAIApiKey(key: string): boolean {
  return /^sk-(proj-)?[A-Za-z0-9\-_]{20,}$/.test(key);
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

function repairLikelyJson(raw: string): string {
  return raw
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[^\t\n\r\x20-\x7E]/g, '');
}

function parseModelBriefOrFallback(rawContent: string, analysis: SessionAnalysis, provider: string): ModelBrief {
  try {
    return parseModelBrief(rawContent, analysis);
  } catch (firstError) {
    try {
      const repaired = repairLikelyJson(rawContent);
      return parseModelBrief(repaired, analysis);
    } catch (secondError) {
      const reason = stringifyError(secondError || firstError);
      const plain = rawContent
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        summary: plain.slice(0, 240) || `${provider} returned a non-JSON response.`,
        recommendations: [],
        watchItems: [`${provider} response could not be parsed as strict JSON.`],
        confidenceNote: `${provider} output parsing failed; fallback text summary used.`,
        reasoning: [],
        assumptions: [`Parser error: ${reason}`],
      };
    }
  }
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

function findMappedParameter(analysis: SessionAnalysis, parameterKey?: string) {
  if (!parameterKey) return undefined;
  return analysis.normalizedSetup.parameters.find((parameter) => parameter.parameterKey === parameterKey);
}

function validateRecommendation(
  analysis: SessionAnalysis,
  recommendation: AIRecommendationItem
): AIRecommendationItem {
  const matchedParameter = findMappedParameter(analysis, recommendation.parameterKey);

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
      mappingConfidence: undefined,
      mappingQuality: undefined,
      mappingAmbiguities: [],
    };
  }

  const assumptions = [...recommendation.assumptions];
  if (recommendation.currentValue !== matchedParameter.displayValue) {
    assumptions.push(`Current value grounded to parsed setup (${matchedParameter.displayValue}) from ${matchedParameter.sourcePath}.`);
  }
  if (matchedParameter.mappingQuality !== 'exact') {
    assumptions.push(`Mapping quality is "${matchedParameter.mappingQuality}" for ${matchedParameter.displayName}; treat exact deltas as directional.`);
  }
  if (matchedParameter.ambiguousMatches.length > 0) {
    assumptions.push(`Alternative matched garage paths: ${matchedParameter.ambiguousMatches.join(', ')}.`);
  }
  if (matchedParameter.confidence !== 'HIGH') {
    assumptions.push(`Mapping confidence is ${matchedParameter.confidence}; verify this path in the garage before applying.`);
  }

  const mappingLimited = matchedParameter.mappingQuality !== 'exact'
    || matchedParameter.ambiguousMatches.length > 0
    || matchedParameter.confidence !== 'HIGH';

  return {
    ...recommendation,
    displayName: matchedParameter.displayName,
    currentValue: matchedParameter.displayValue,
    currentSourcePath: matchedParameter.sourcePath,
    exactness: recommendation.exactness === 'blocked'
      ? 'blocked'
      : recommendation.exactness === 'exact' && mappingLimited
        ? 'inferred'
        : recommendation.exactness,
    assumptions: dedupeStrings(assumptions, 4),
    mappingConfidence: matchedParameter.confidence,
    mappingQuality: matchedParameter.mappingQuality,
    mappingAmbiguities: matchedParameter.ambiguousMatches,
  };
}

function buildPrompt(analysis: SessionAnalysis, driverFeedback?: string): string {
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
      ambiguousMatches: parameter.ambiguousMatches,
    })),
    setupCoverage: {
      architecture: analysis.normalizedSetup.architecture,
      missingKeys: analysis.normalizedSetup.missingKeys,
      unsupportedKeys: analysis.normalizedSetup.unsupportedKeys,
      mappingStats: analysis.normalizedSetup.mappingStats,
      mappingWarnings: analysis.normalizedSetup.mappingWarnings,
    },
    telemetryReasoning: analysis.telemetryReasoning,
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

  // Sim constraints — include enforcement type so the model knows which limits apply only in the garage
  domainContext.push(`SIM CONSTRAINTS: ${JSON.stringify(SIM_CONSTRAINTS.map(c => ({ id: c.id, param: c.parameter, limit: c.limit, unit: c.unit, enforcement: c.enforcementType })))}`);
  domainContext.push('IMPORTANT: The front-rh-floor constraint (30mm) is a GARAGE/SETUP-SCREEN minimum only. Dynamic ride height and splitter clearance WILL drop below 30mm at speed under aero load — this is normal and expected, NOT a violation. Only flag dynamic ride height if there is excessive bottoming (floor strikes), not simply because the value is below 30mm.');

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

  const driverFeedbackLines: string[] = [];
  if (driverFeedback && driverFeedback.trim().length > 0) {
    driverFeedbackLines.push(
      'DRIVER FEEDBACK (from the driver describing how the car feels — treat this as high-priority context when diagnosing issues and prioritizing recommendations):',
      driverFeedback.trim(),
    );
  }

  return [
    'You are an elite iRacing GTP setup engineer.',
    'You are receiving structured telemetry reasoning plus the parsed current garage setup.',
    ...domainContext.map(c => `DOMAIN KNOWLEDGE: ${c}`),
    ...driverFeedbackLines,
    'Return setup recommendations as structured parameter diffs, not prose bullets.',
    'Only mark exactness as "exact" when the parameter has mappingQuality "exact", confidence "HIGH", and no ambiguousMatches.',
    'If mappingQuality is not exact, confidence is not HIGH, or ambiguousMatches is non-empty, exactness must be "inferred".',
    'If a recommendation is limited by missing setup values or sim constraints, mark exactness as "blocked" or "inferred" and explain why.',
    'Respect the impact hierarchy when prioritizing recommendations.',
    'If driver feedback is provided, correlate it with telemetry evidence and prioritize recommendations that address the reported symptoms.',
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
  const {
    geminiKey,
    anthropicKey,
    openRouterKey,
    openAIKey,
  } = getProviderConfig();
  return Boolean(
    (geminiKey && isLikelyGeminiApiKey(geminiKey))
    || (anthropicKey && isLikelyAnthropicApiKey(anthropicKey))
    || (openRouterKey && isLikelyOpenRouterApiKey(openRouterKey))
    || (openAIKey && isLikelyOpenAIApiKey(openAIKey))
  );
}

export function getAIRecommendationMode(): 'unconfigured' | 'single-model' | 'dual-model' {
  const {
    geminiKey,
    anthropicKey,
    openRouterKey,
    openAIKey,
  } = getProviderConfig();
  const enabledCount = [
    geminiKey && isLikelyGeminiApiKey(geminiKey),
    anthropicKey && isLikelyAnthropicApiKey(anthropicKey),
    openRouterKey && isLikelyOpenRouterApiKey(openRouterKey),
    openAIKey && isLikelyOpenAIApiKey(openAIKey),
  ].filter(Boolean).length;
  if (enabledCount >= 2) return 'dual-model';
  if (enabledCount === 1) return 'single-model';
  return 'unconfigured';
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalModelIdentity(modelName: string): string {
  let normalized = modelName.trim();

  const resolvedMatch = normalized.match(/\(resolved as ([^)]+)\)/i);
  if (resolvedMatch?.[1]) normalized = resolvedMatch[1].trim();
  const viaMatch = normalized.match(/\(via ([^)]+)\)/i);
  if (viaMatch?.[1]) normalized = viaMatch[1].trim();

  if (normalized.startsWith('openrouter:')) normalized = normalized.replace(/^openrouter:/, '');
  if (normalized.startsWith('openai:')) normalized = normalized.replace(/^openai:/, 'openai/');
  if (normalized.startsWith('anthropic:')) normalized = normalized.replace(/^anthropic:/, 'anthropic/');
  if (normalized.startsWith('google:')) normalized = normalized.replace(/^google:/, 'google/');

  return normalizeText(normalized);
}

function areConfiguredModelsEquivalent(first: string, second: string): boolean {
  return canonicalModelIdentity(first) === canonicalModelIdentity(second);
}

function buildAnalysisRunKey(analysis: SessionAnalysis): string {
  return [
    analysis.header.car,
    analysis.header.track,
    analysis.header.samples,
    analysis.validLaps.length,
    Number.isFinite(analysis.bestTime) ? analysis.bestTime.toFixed(4) : 'na',
  ].join('|');
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

function finishProviderDebugReport(report: AIProviderDebugReport): AIProviderDebugReport {
  const completedAt = new Date();
  return {
    ...report,
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - new Date(report.startedAt).getTime(),
  };
}

function pushDebugEntry(
  report: AIProviderDebugReport,
  entry: AIProviderDebugEntry
): void {
  report.providers.push(entry);
  if (isAIDebugEnabled()) {
    console.info('[AI Debug]', entry);
  }
}

async function runProviderWithDebug(
  report: AIProviderDebugReport,
  context: Omit<AIProviderDebugEntry, 'status' | 'durationMs'>,
  run: () => Promise<ModelResult | null>
): Promise<ModelResult | null> {
  const startedAt = performance.now();
  try {
    const result = await run();
    const durationMs = Math.round(performance.now() - startedAt);
    if (!result) {
      pushDebugEntry(report, {
        ...context,
        status: 'skipped',
        durationMs,
      });
      return null;
    }
    pushDebugEntry(report, {
      ...context,
      status: 'success',
      durationMs,
      recommendations: result.brief.recommendations.length,
    });
    return result;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    pushDebugEntry(report, {
      ...context,
      status: 'error',
      durationMs,
      error: stringifyError(error),
    });
    throw error;
  }
}

async function readResponseBodySnippet(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return '';
    return text.slice(0, 280);
  } catch {
    return '';
  }
}

async function resolveGeminiModel(
  requestedModel: string,
  nativeBaseUrl: string,
  apiKey: string
): Promise<string> {
  const cacheKey = `${nativeBaseUrl}::${requestedModel}`;
  const cached = geminiModelResolutionCache.get(cacheKey);
  if (cached) return cached;

  const modelCandidates = [
    requestedModel,
    `${requestedModel}-preview`,
    requestedModel.endsWith('-pro') ? `${requestedModel}-preview` : '',
    requestedModel.endsWith('-flash') ? `${requestedModel}-preview` : '',
  ].filter(Boolean);

  try {
    const response = await fetch(
      `${nativeBaseUrl}/models?key=${encodeURIComponent(apiKey)}`,
      { method: 'GET' }
    );
    if (!response.ok) {
      geminiModelResolutionCache.set(cacheKey, requestedModel);
      return requestedModel;
    }
    const data = await response.json() as { models?: Array<{ name?: string }> };
    const availableModels = new Set(
      (data.models || [])
        .map((model) => (typeof model.name === 'string' ? model.name.replace(/^models\//, '') : ''))
        .filter(Boolean)
    );

    for (const candidate of modelCandidates) {
      if (availableModels.has(candidate)) {
        geminiModelResolutionCache.set(cacheKey, candidate);
        return candidate;
      }
    }

    const previewMatch = [...availableModels]
      .find((name) => name.startsWith(`${requestedModel}-`) && name.includes('preview'));
    if (previewMatch) {
      geminiModelResolutionCache.set(cacheKey, previewMatch);
      return previewMatch;
    }
  } catch {
    // Fall through to configured model when discovery is unavailable.
  }

  geminiModelResolutionCache.set(cacheKey, requestedModel);
  return requestedModel;
}

async function queryGemini(prompt: string, analysis: SessionAnalysis): Promise<ModelResult | null> {
  const apiKey = getEnv('VITE_GEMINI_API_KEY');
  if (!apiKey) return null;
  if (!isLikelyGeminiApiKey(apiKey)) {
    return null;
  }
  const baseUrl = normalizeProviderBaseUrl(getEnv('VITE_GEMINI_BASE_URL') || DEFAULT_GEMINI_BASE_URL, 'google-openai');
  const nativeBaseUrl = normalizeProviderBaseUrl(getEnv('VITE_GEMINI_NATIVE_BASE_URL') || DEFAULT_GEMINI_NATIVE_BASE_URL, 'google-native');
  const requestedModel = getEnv('VITE_GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
  const model = await resolveGeminiModel(requestedModel, nativeBaseUrl, apiKey);
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
        { role: 'system', content: GTP_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (response.ok) {
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    return {
      modelName: model === requestedModel ? model : `${requestedModel} (resolved as ${model})`,
      brief: parseModelBriefOrFallback(content, analysis, 'Gemini'),
    };
  }

  if (response.status !== 404) {
    const responseBodySnippet = await readResponseBodySnippet(response);
    const detail = responseBodySnippet ? ` ${responseBodySnippet}` : '';
    throw new Error(`Gemini request failed (${response.status}).${detail}`);
  }

  const nativeResponse = await fetch(
    `${nativeBaseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: GTP_SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      }),
    }
  );

  if (!nativeResponse.ok) {
    const responseBodySnippet = await readResponseBodySnippet(nativeResponse);
    const detail = responseBodySnippet ? ` ${responseBodySnippet}` : '';
    throw new Error(`Gemini native request failed (${nativeResponse.status}).${detail}`);
  }

  const nativeData = await nativeResponse.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const content = nativeData.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('') ?? '';
  return {
    modelName: model === requestedModel ? model : `${requestedModel} (resolved as ${model})`,
    brief: parseModelBriefOrFallback(content, analysis, 'Gemini'),
  };
}

async function queryOpus(prompt: string, analysis: SessionAnalysis): Promise<ModelResult | null> {
  const apiKey = getEnv('VITE_ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  if (!isLikelyAnthropicApiKey(apiKey)) {
    return null;
  }
  const baseUrl = normalizeProviderBaseUrl(getEnv('VITE_ANTHROPIC_BASE_URL') || DEFAULT_ANTHROPIC_BASE_URL, 'anthropic');
  const model = getEnv('VITE_OPUS_MODEL') || DEFAULT_OPUS_MODEL;
  const isBrowser = isBrowserRuntime();
  const directAnthropicEndpoint = /(^https?:\/\/)?api\.anthropic\.com\/?/i.test(baseUrl);
  if (isBrowser && directAnthropicEndpoint) {
    // Direct browser calls to Anthropic are blocked by CORS unless routed through a proxy.
    return null;
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0.2,
        system: GTP_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (error) {
    const reason = stringifyError(error);
    throw new Error(
      `Opus network request failed (${reason}). This usually means the browser cannot reach Anthropic directly (CORS/network). Use a backend proxy for Anthropic, or remove VITE_ANTHROPIC_API_KEY to run Gemini-only mode.`
    );
  }

  if (!response.ok) {
    const responseBodySnippet = await readResponseBodySnippet(response);
    const detail = responseBodySnippet ? ` ${responseBodySnippet}` : '';
    throw new Error(`Opus request failed (${response.status}).${detail}`);
  }

  const data = await response.json() as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === 'text')?.text ?? '';

  return {
    modelName: model,
    brief: parseModelBriefOrFallback(text, analysis, 'Opus'),
  };
}

async function queryOpenRouter(
  prompt: string,
  analysis: SessionAnalysis,
  preferredModel?: string
): Promise<ModelResult | null> {
  const apiKey = getEnv('VITE_OPENROUTER_API_KEY');
  if (!apiKey) return null;
  if (!isLikelyOpenRouterApiKey(apiKey)) return null;
  const baseUrl = normalizeProviderBaseUrl(getEnv('VITE_OPENROUTER_BASE_URL') || DEFAULT_OPENROUTER_BASE_URL, 'openrouter');
  const configuredModel = getEnv('VITE_OPENROUTER_MODEL') || DEFAULT_OPENROUTER_MODEL;
  const selectedModel = preferredModel || configuredModel;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: selectedModel,
      temperature: 0.2,
      messages: [
        { role: 'system', content: GTP_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const responseBodySnippet = await readResponseBodySnippet(response);
    const detail = responseBodySnippet ? ` ${responseBodySnippet}` : '';
    throw new Error(`OpenRouter request failed (${response.status}).${detail}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? '';

  return {
    modelName: `openrouter:${selectedModel}`,
    brief: parseModelBriefOrFallback(content, analysis, 'OpenRouter'),
  };
}

async function queryOpenAI(
  prompt: string,
  analysis: SessionAnalysis,
  allowOpenRouterFallback: boolean
): Promise<ModelResult | null> {
  const apiKey = getEnv('VITE_OPENAI_API_KEY');
  if (!apiKey) return null;
  if (!isLikelyOpenAIApiKey(apiKey)) return null;
  const baseUrl = normalizeProviderBaseUrl(getEnv('VITE_OPENAI_BASE_URL') || DEFAULT_OPENAI_BASE_URL, 'openai');
  const model = getEnv('VITE_OPENAI_MODEL') || DEFAULT_OPENAI_MODEL;

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
        { role: 'system', content: GTP_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (allowOpenRouterFallback && (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 429)) {
    const openRouterFallback = await queryOpenRouter(
      prompt,
      analysis,
      model.startsWith('openai/') ? model : `openai/${model}`
    );
    if (openRouterFallback) {
      return {
        ...openRouterFallback,
        modelName: `openai:${model} (via ${openRouterFallback.modelName})`,
      };
    }
  }

  if (!response.ok) {
    const responseBodySnippet = await readResponseBodySnippet(response);
    const detail = responseBodySnippet ? ` ${responseBodySnippet}` : '';
    throw new Error(`OpenAI request failed (${response.status}).${detail}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? '';

  return {
    modelName: `openai:${model}`,
    brief: parseModelBriefOrFallback(content, analysis, 'OpenAI'),
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

function dedupeModelResults(results: ModelResult[]): ModelResult[] {
  const seen = new Set<string>();
  const deduped: ModelResult[] = [];

  for (const result of results) {
    const identity = canonicalModelIdentity(result.modelName);
    if (seen.has(identity)) continue;
    seen.add(identity);
    deduped.push(result);
  }

  return deduped;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim().length > 0) return error.trim();
  return 'Unknown provider error.';
}

function buildNoResultError(
  settled: PromiseSettledResult<ModelResult | null>[],
  providers: string[]
): Error {
  const failureMessages = settled
    .map((result, index) => {
      if (result.status !== 'rejected') return null;
      return `${providers[index]}: ${stringifyError(result.reason)}`;
    })
    .filter((message): message is string => Boolean(message));

  if (failureMessages.length === 0) {
    return new Error('Configured AI provider did not return a recommendation payload.');
  }

  return new Error(`AI analysis failed for all configured providers: ${failureMessages.join(' | ')}`);
}

function buildConsensusBrief(results: ModelResult[], analysis: SessionAnalysis): AISetupBrief {
  const uniqueResults = dedupeModelResults(results);
  const mappingSummary = analysis.normalizedSetup.mappingStats;
  const mappingSummaryNote = `Mapping quality: ${mappingSummary.exact} exact, ${mappingSummary.ordered} ordered, ${mappingSummary.ambiguous} ambiguous.`;
  if (uniqueResults.length === 0) {
    throw new Error('No successful AI model responses were received.');
  }

  const baseWatchItems = dedupeStrings(
    [...analysis.dataQuality.notes.slice(0, 3), ...analysis.normalizedSetup.mappingWarnings.slice(0, 3)],
    5,
  );

  if (uniqueResults.length === 1) {
    const single = uniqueResults[0];
    return {
      summary: single.brief.summary,
      recommendations: single.brief.recommendations,
      watchItems: dedupeStrings(
        [...single.brief.watchItems, ...baseWatchItems],
        5,
      ),
      confidenceNote: `${single.brief.confidenceNote} Dataset confidence: ${analysis.dataQuality.confidence}. ${mappingSummaryNote}`,
      reasoning: single.brief.reasoning,
      disagreements: single.brief.assumptions,
      source: 'single-model',
      modelsUsed: [single.modelName],
    };
  }

  const [first, second] = uniqueResults;
  const mergedWatch = dedupeStrings(
    [...first.brief.watchItems, ...second.brief.watchItems],
    5
  );
  const mergedReasoning = dedupeStrings(
    [...first.brief.reasoning, ...second.brief.reasoning],
    6
  );
  const mergedRecommendations = mergeRecommendations(uniqueResults);
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
    recommendations: mergedRecommendations.recommendations,
    watchItems: mergedWatch.length > 0
      ? dedupeStrings([...mergedWatch, ...baseWatchItems], 5)
      : baseWatchItems,
    confidenceNote: `Dual-model synthesis complete. ${analysis.dataQuality.confidence} telemetry confidence. ${mappingSummaryNote} Resolve disagreements before final setup lock.`,
    reasoning: mergedReasoning,
    disagreements: disagreementDetails,
    source: 'consensus',
    modelsUsed: uniqueResults.map((result) => result.modelName),
  };
}

export async function generateAISetupBrief(analysis: SessionAnalysis, driverFeedback?: string): Promise<AISetupBrief> {
  const feedbackSuffix = driverFeedback?.trim() ? `|fb:${driverFeedback.trim().slice(0, 80)}` : '';
  const runKey = buildAnalysisRunKey(analysis) + feedbackSuffix;
  const inFlight = inFlightBriefByKey.get(runKey);
  if (inFlight) return inFlight;

  const task = (async (): Promise<AISetupBrief> => {
  const report: AIProviderDebugReport = {
    startedAt: new Date().toISOString(),
    providers: [],
  };
  lastAIProviderDebugReport = report;
  const prompt = buildPrompt(analysis, driverFeedback);
  const {
    geminiKey,
    anthropicKey,
    openRouterKey,
    openAIKey,
  } = getProviderConfig();
  const hasGemini = Boolean(geminiKey && isLikelyGeminiApiKey(geminiKey));
  const hasAnthropic = Boolean(anthropicKey && isLikelyAnthropicApiKey(anthropicKey));
  const hasOpenRouter = Boolean(openRouterKey && isLikelyOpenRouterApiKey(openRouterKey));
  const hasOpenAI = Boolean(openAIKey && isLikelyOpenAIApiKey(openAIKey));
  if (!hasGemini && !hasAnthropic && !hasOpenRouter && !hasOpenAI) {
    const invalidNotes: string[] = [];
    if (geminiKey && !isLikelyGeminiApiKey(geminiKey)) {
      invalidNotes.push('VITE_GEMINI_API_KEY must be a Google AI key that starts with "AIza".');
    }
    if (anthropicKey && !isLikelyAnthropicApiKey(anthropicKey)) {
      invalidNotes.push('VITE_ANTHROPIC_API_KEY must start with "sk-ant-".');
    }
    if (openRouterKey && !isLikelyOpenRouterApiKey(openRouterKey)) {
      invalidNotes.push('VITE_OPENROUTER_API_KEY must start with "sk-or-v1-".');
    }
    if (openAIKey && !isLikelyOpenAIApiKey(openAIKey)) {
      invalidNotes.push('VITE_OPENAI_API_KEY must start with "sk-".');
    }
    const suffix = invalidNotes.length > 0 ? ` ${invalidNotes.join(' ')}` : '';
    lastAIProviderDebugReport = finishProviderDebugReport(report);
    throw new Error(`AI analysis is not configured with a valid provider key.${suffix}`);
  }

  const geminiBaseUrl = normalizeProviderBaseUrl(getEnv('VITE_GEMINI_BASE_URL') || DEFAULT_GEMINI_BASE_URL, 'google-openai');
  const geminiModel = getEnv('VITE_GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
  const anthropicBaseUrl = normalizeProviderBaseUrl(getEnv('VITE_ANTHROPIC_BASE_URL') || DEFAULT_ANTHROPIC_BASE_URL, 'anthropic');
  const opusModel = getEnv('VITE_OPUS_MODEL') || DEFAULT_OPUS_MODEL;
  const openRouterBaseUrl = normalizeProviderBaseUrl(getEnv('VITE_OPENROUTER_BASE_URL') || DEFAULT_OPENROUTER_BASE_URL, 'openrouter');
  const openRouterModel = getEnv('VITE_OPENROUTER_MODEL') || DEFAULT_OPENROUTER_MODEL;
  const openAIBaseUrl = normalizeProviderBaseUrl(getEnv('VITE_OPENAI_BASE_URL') || DEFAULT_OPENAI_BASE_URL, 'openai');
  const openAIModel = getEnv('VITE_OPENAI_MODEL') || DEFAULT_OPENAI_MODEL;
  const sameOpenAIAndOpenRouterModel = hasOpenAI
    && hasOpenRouter
    && areConfiguredModelsEquivalent(openAIModel, openRouterModel);
  const skipStandaloneOpenRouter = false;
  const skipStandaloneOpenAI = sameOpenAIAndOpenRouterModel;
  const allowOpenRouterFallbackForOpenAI = !hasOpenRouter && !skipStandaloneOpenAI;

  const providerRuns = [
    {
      name: 'Gemini',
      run: runProviderWithDebug(
        report,
        {
          provider: 'Gemini',
          configured: Boolean(geminiKey),
          keyValid: hasGemini,
          model: geminiModel,
          baseUrl: geminiBaseUrl,
        },
        () => queryGemini(prompt, analysis)
      ),
    },
    {
      name: 'Opus',
      run: runProviderWithDebug(
        report,
        {
          provider: 'Opus',
          configured: Boolean(anthropicKey),
          keyValid: hasAnthropic,
          model: opusModel,
          baseUrl: anthropicBaseUrl,
        },
        () => queryOpus(prompt, analysis)
      ),
    },
    {
      name: 'OpenRouter',
      run: runProviderWithDebug(
        report,
        {
          provider: 'OpenRouter',
          configured: Boolean(openRouterKey),
          keyValid: hasOpenRouter,
          model: openRouterModel,
          baseUrl: openRouterBaseUrl,
        },
        () => {
          if (skipStandaloneOpenRouter) return Promise.resolve(null);
          return queryOpenRouter(prompt, analysis);
        }
      ),
    },
    {
      name: 'OpenAI',
      run: runProviderWithDebug(
        report,
        {
          provider: 'OpenAI',
          configured: Boolean(openAIKey),
          keyValid: hasOpenAI,
          model: openAIModel,
          baseUrl: openAIBaseUrl,
        },
        () => {
          if (skipStandaloneOpenAI) return Promise.resolve(null);
          return queryOpenAI(prompt, analysis, allowOpenRouterFallbackForOpenAI);
        }
      ),
    },
  ];
  const settled = await Promise.allSettled(providerRuns.map((provider) => provider.run));
  const successful: ModelResult[] = settled
    .filter((r): r is PromiseFulfilledResult<ModelResult | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is ModelResult => v != null);

  if (successful.length === 0) {
    lastAIProviderDebugReport = finishProviderDebugReport(report);
    throw buildNoResultError(settled, providerRuns.map((provider) => provider.name));
  }

  const brief = buildConsensusBrief(successful, analysis);
  lastAIProviderDebugReport = finishProviderDebugReport(report);
  return brief;
  })();

  inFlightBriefByKey.set(runKey, task);
  try {
    return await task;
  } finally {
    inFlightBriefByKey.delete(runKey);
  }
}
