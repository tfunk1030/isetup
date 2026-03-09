import type { AISetupBrief, SessionAnalysis } from './types';

const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-pro';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const DEFAULT_OPUS_MODEL = 'claude-opus-4-6';

interface ModelBrief {
  summary: string;
  priorityActions: string[];
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

function buildFallbackBrief(analysis: SessionAnalysis): AISetupBrief {
  const top = analysis.recommendations.slice(0, 3);
  const priorityActions = top.map((r) => {
    const specs = r.specifics?.map((s) => `${s.parameter}: ${s.current} → ${s.target} (${s.delta})`).join('; ');
    return specs ? `${r.title}: ${r.action} [${specs}]` : `${r.title}: ${r.action}`;
  });
  const watchItems = [
    ...analysis.dataQuality.notes,
    ...top.flatMap((r) => r.evidence).slice(0, 3),
  ];

  return {
    summary: top.length > 0
      ? `Rule engine identified ${analysis.recommendations.length} actionable items. Prioritize critical/warning items first.`
      : 'No urgent setup risks detected from current telemetry. Validate across a longer run.',
    priorityActions: priorityActions.length > 0
      ? priorityActions
      : ['Maintain current setup baseline and collect a longer stint for trend confidence.'],
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
    category: r.category,
    severity: r.severity,
    priority: r.priority,
    title: r.title,
    action: r.action,
    rationale: r.rationale,
    evidence: r.evidence.slice(0, 3),
    specifics: r.specifics || [],
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

  return [
    'You are an elite iRacing GTP setup engineer.',
    'Provide EXACT numeric setup changes — specify current values, target values, and deltas.',
    'Every priority action MUST include a specific parameter, its current measured value, and what to change it to.',
    'Example: "Reduce LF cold pressure by 1.0 PSI (currently 26.2 PSI hot, target 25.2 PSI hot)."',
    'Do NOT give vague advice like "adjust pressure" or "review settings" — always include exact numbers.',
    'Focus on setup engineering only (no driving advice).',
    'Return STRICT JSON only with keys:',
    '{ "summary": string, "priorityActions": string[<=5], "watchItems": string[<=5], "confidenceNote": string, "reasoning": string[<=6], "assumptions": string[<=4] }',
    'Reasoning must explain WHY each specific numeric change is expected to improve performance.',
    'Input telemetry summary:',
    JSON.stringify(payload),
  ].join('\n');
}

export function hasAIRecommendationConfig(): boolean {
  return Boolean(getEnv('VITE_GEMINI_API_KEY') || getEnv('VITE_ANTHROPIC_API_KEY'));
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickTopUnique(values: string[], limit: number): string[] {
  const counts = new Map<string, { count: number; text: string }>();
  for (const text of values) {
    const normalized = normalizeText(text);
    if (!normalized) continue;
    const existing = counts.get(normalized);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(normalized, { count: 1, text });
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((x) => x.text);
}

function parseModelBrief(rawContent: string): ModelBrief {
  const jsonText = extractJsonObject(rawContent);
  const parsed = JSON.parse(jsonText) as Partial<ModelBrief>;

  return {
    summary: parsed.summary || 'Model summary unavailable.',
    priorityActions: Array.isArray(parsed.priorityActions) ? parsed.priorityActions.slice(0, 5) : [],
    watchItems: Array.isArray(parsed.watchItems) ? parsed.watchItems.slice(0, 5) : [],
    confidenceNote: parsed.confidenceNote || 'Model confidence note unavailable.',
    reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning.slice(0, 6) : [],
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.slice(0, 4) : [],
  };
}

async function queryGemini(prompt: string): Promise<ModelResult | null> {
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
    brief: parseModelBrief(content),
  };
}

async function queryOpus(prompt: string): Promise<ModelResult | null> {
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
    brief: parseModelBrief(text),
  };
}

function buildConsensusBrief(results: ModelResult[], analysis: SessionAnalysis): AISetupBrief {
  if (results.length === 0) return buildFallbackBrief(analysis);
  if (results.length === 1) {
    const single = results[0];
    return {
      summary: single.brief.summary,
      priorityActions: single.brief.priorityActions,
      watchItems: single.brief.watchItems,
      confidenceNote: `${single.brief.confidenceNote} Dataset confidence: ${analysis.dataQuality.confidence}.`,
      reasoning: single.brief.reasoning,
      disagreements: single.brief.assumptions,
      source: 'single-model',
      modelsUsed: [single.modelName],
    };
  }

  const [first, second] = results;
  const mergedActions = pickTopUnique(
    [...first.brief.priorityActions, ...second.brief.priorityActions],
    5
  );
  const mergedWatch = pickTopUnique(
    [...first.brief.watchItems, ...second.brief.watchItems],
    5
  );
  const mergedReasoning = pickTopUnique(
    [...first.brief.reasoning, ...second.brief.reasoning],
    6
  );

  const firstNormActions = new Set(first.brief.priorityActions.map(normalizeText));
  const secondNormActions = new Set(second.brief.priorityActions.map(normalizeText));
  const onlyFirst = first.brief.priorityActions.filter((a) => !secondNormActions.has(normalizeText(a)));
  const onlySecond = second.brief.priorityActions.filter((a) => !firstNormActions.has(normalizeText(a)));
  const disagreements = [
    ...onlyFirst.slice(0, 2).map((x) => `${first.modelName}: ${x}`),
    ...onlySecond.slice(0, 2).map((x) => `${second.modelName}: ${x}`),
  ];

  return {
    summary: [
      `Consensus from ${first.modelName} + ${second.modelName}.`,
      first.brief.summary,
      second.brief.summary,
    ].join(' '),
    priorityActions: mergedActions.length > 0 ? mergedActions : analysis.recommendations.slice(0, 3).map((r) => r.action),
    watchItems: mergedWatch.length > 0 ? mergedWatch : analysis.dataQuality.notes.slice(0, 4),
    confidenceNote: `Dual-model synthesis complete. ${analysis.dataQuality.confidence} telemetry confidence. Resolve disagreements before final setup lock.`,
    reasoning: mergedReasoning,
    disagreements,
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
    const settled = await Promise.allSettled([queryGemini(prompt), queryOpus(prompt)]);
    const successful: ModelResult[] = settled
      .filter((r): r is PromiseFulfilledResult<ModelResult | null> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((v): v is ModelResult => v != null);

    return buildConsensusBrief(successful, analysis);
  } catch {
    return buildFallbackBrief(analysis);
  }
}
