// ═══════════════════════════════════════════════════════════════
// SESSION MEMORY — Auto-learning engine for setup recommendations
//
// Stores session snapshots, auto-validates recommendations by
// comparing before/after telemetry, and injects historical context
// into AI prompts so the system gets smarter with every session.
//
// Storage: localStorage (browser) — keyed by car+track combos.
// No server needed. All learning is local and persistent.
// ═══════════════════════════════════════════════════════════════

import type {
  SessionAnalysis,
  AISetupBrief,
  ConfidenceLevel,
} from './types';

// ── Types ────────────────────────────────────────────────────

/** Compact snapshot of a session's key metrics for comparison */
export interface SessionMetricSnapshot {
  bestLapTime: number;
  avgLapTime: number;
  cleanBottoming: number;
  kerbBottoming: number;
  peakLatG: number;
  peakBrakeG: number;
  tyreTempBalance: number; // front avg - rear avg (positive = front hotter)
  avgHotPressures: { LF: number; RF: number; LR: number; RR: number } | null;
  frontTempSpread: number; // avg across-tread spread on front axle
  rearTempSpread: number;
  tcClimbing: boolean; // was TC increasing during stint?
  brakeBiasDrift: number; // range of bias change during stint
}

/** A single stored session record */
export interface SessionRecord {
  id: string; // unique session ID
  timestamp: number;
  car: string;
  track: string;
  carProfileId: string | null;
  trackProfileId: string | null;
  validLaps: number;
  metrics: SessionMetricSnapshot;
  /** Compact representation of setup — key parameter values only */
  setupSnapshot: Record<string, string>;
  /** AI recommendations given for this session (if any) */
  aiRecommendations: StoredRecommendation[] | null;
  /** Auto-validated outcomes from comparing to NEXT session */
  outcomes: RecommendationOutcome[] | null;
  /** Overall session improvement score vs previous (-1 to +1, null if first session) */
  improvementScore: number | null;
}

/** Compact stored recommendation */
export interface StoredRecommendation {
  parameterKey: string;
  displayName: string;
  currentValue: string;
  targetValue: string;
  reason: string;
  confidence: ConfidenceLevel;
  parameterGroup: string; // from impact hierarchy mapping
}

/** Auto-validated outcome of a recommendation */
export interface RecommendationOutcome {
  parameterKey: string;
  displayName: string;
  wasApplied: boolean; // did the setup actually change in that direction?
  metricsBefore: Partial<SessionMetricSnapshot>;
  metricsAfter: Partial<SessionMetricSnapshot>;
  verdict: 'helped' | 'hurt' | 'neutral' | 'inconclusive';
  score: number; // -1 to +1
  evidence: string;
}

/** Aggregated learning for a parameter group */
export interface ParameterGroupLearning {
  parameterGroup: string;
  totalRecommendations: number;
  appliedCount: number;
  helpedCount: number;
  hurtCount: number;
  neutralCount: number;
  successRate: number; // helped / (helped + hurt), NaN if no data
  avgConfidenceWhenHelped: number;
  avgConfidenceWhenHurt: number;
}

/** Context blob ready for injection into AI prompt */
export interface MemoryContext {
  previousSessions: SessionSummaryForPrompt[];
  parameterLearnings: ParameterLearningForPrompt[];
  setupTrends: string[];
}

interface SessionSummaryForPrompt {
  sessionsAgo: number;
  bestLap: number;
  validLaps: number;
  keyIssues: string[];
  changesApplied: string[];
  outcome: string;
}

interface ParameterLearningForPrompt {
  parameter: string;
  successRate: number;
  sampleSize: number;
  note: string;
}

// ── Storage Keys ─────────────────────────────────────────────

const STORAGE_PREFIX = 'gtp_memory_';
const MAX_SESSIONS_PER_COMBO = 20;
const MAX_LEARNINGS_IN_PROMPT = 5;
const MAX_SESSIONS_IN_PROMPT = 3;

function comboKey(car: string, track: string): string {
  return `${car.toLowerCase().replace(/\s+/g, '_')}__${track.toLowerCase().replace(/\s+/g, '_')}`;
}

function storageKey(combo: string): string {
  return `${STORAGE_PREFIX}${combo}`;
}

// ── Metric Extraction ────────────────────────────────────────

export function extractMetrics(analysis: SessionAnalysis): SessionMetricSnapshot {
  const lapTimes = analysis.lapTimes
    .filter(lt => analysis.validLaps.includes(lt.lap))
    .map(lt => lt.time);

  const avgLap = lapTimes.length > 0
    ? lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length
    : Infinity;

  // Tyre temp balance (front - rear average)
  const lastTemps = analysis.tyreTempData[analysis.tyreTempData.length - 1];
  let tyreTempBalance = 0;
  let frontSpread = 0;
  let rearSpread = 0;
  if (lastTemps) {
    const frontAvg = ((lastTemps.LF.O + lastTemps.LF.M + lastTemps.LF.I) / 3
      + (lastTemps.RF.O + lastTemps.RF.M + lastTemps.RF.I) / 3) / 2;
    const rearAvg = ((lastTemps.LR.O + lastTemps.LR.M + lastTemps.LR.I) / 3
      + (lastTemps.RR.O + lastTemps.RR.M + lastTemps.RR.I) / 3) / 2;
    tyreTempBalance = frontAvg - rearAvg;

    frontSpread = (Math.abs(lastTemps.LF.O - lastTemps.LF.I) + Math.abs(lastTemps.RF.O - lastTemps.RF.I)) / 2;
    rearSpread = (Math.abs(lastTemps.LR.O - lastTemps.LR.I) + Math.abs(lastTemps.RR.O - lastTemps.RR.I)) / 2;
  }

  // Hot pressures
  const lastPressures = analysis.tyrePressureData[analysis.tyrePressureData.length - 1];

  // TC climbing detection
  const tc = analysis.aids['dcTractionControl'];
  const tcClimbing = tc ? !tc.constant && (tc.max - tc.min) >= 2 : false;

  // Brake bias drift
  const bias = analysis.aids['dcBrakeBias'];
  const biasDrift = bias ? bias.max - bias.min : 0;

  return {
    bestLapTime: analysis.bestTime,
    avgLapTime: avgLap,
    cleanBottoming: analysis.bottoming.clean,
    kerbBottoming: analysis.bottoming.kerb,
    peakLatG: analysis.peakLatG,
    peakBrakeG: analysis.peakBrakeG,
    tyreTempBalance,
    avgHotPressures: lastPressures ? {
      LF: lastPressures.LF,
      RF: lastPressures.RF,
      LR: lastPressures.LR,
      RR: lastPressures.RR,
    } : null,
    frontTempSpread: frontSpread,
    rearTempSpread: rearSpread,
    tcClimbing,
    brakeBiasDrift: biasDrift,
  };
}

function extractSetupSnapshot(analysis: SessionAnalysis): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const param of analysis.normalizedSetup.parameters) {
    snapshot[param.parameterKey] = param.displayValue;
  }
  return snapshot;
}

// ── Auto-Validation Engine ───────────────────────────────────

/**
 * Compare two consecutive sessions and score whether recommendations helped.
 * This is the core auto-learning logic — no user input needed.
 */
function autoValidate(
  prevSession: SessionRecord,
  currentMetrics: SessionMetricSnapshot,
  currentSetup: Record<string, string>,
): RecommendationOutcome[] {
  if (!prevSession.aiRecommendations || prevSession.aiRecommendations.length === 0) {
    return [];
  }

  const outcomes: RecommendationOutcome[] = [];

  for (const rec of prevSession.aiRecommendations) {
    const prevValue = prevSession.setupSnapshot[rec.parameterKey];
    const currValue = currentSetup[rec.parameterKey];

    // Detect if the change was actually applied
    const wasApplied = prevValue !== undefined && currValue !== undefined && prevValue !== currValue;

    if (!wasApplied) {
      outcomes.push({
        parameterKey: rec.parameterKey,
        displayName: rec.displayName,
        wasApplied: false,
        metricsBefore: {},
        metricsAfter: {},
        verdict: 'inconclusive',
        score: 0,
        evidence: `Parameter ${rec.displayName} was not changed between sessions.`,
      });
      continue;
    }

    // Score the outcome based on what the recommendation was trying to fix
    const { verdict, score, evidence } = scoreRecommendationOutcome(
      rec,
      prevSession.metrics,
      currentMetrics,
    );

    outcomes.push({
      parameterKey: rec.parameterKey,
      displayName: rec.displayName,
      wasApplied: true,
      metricsBefore: relevantMetrics(rec, prevSession.metrics),
      metricsAfter: relevantMetrics(rec, currentMetrics),
      verdict,
      score,
      evidence,
    });
  }

  return outcomes;
}

function relevantMetrics(
  rec: StoredRecommendation,
  metrics: SessionMetricSnapshot,
): Partial<SessionMetricSnapshot> {
  const group = rec.parameterGroup;
  switch (group) {
    case 'heave':
    case 'aero':
      return { cleanBottoming: metrics.cleanBottoming, peakLatG: metrics.peakLatG };
    case 'springs':
    case 'arb':
      return { tyreTempBalance: metrics.tyreTempBalance, peakLatG: metrics.peakLatG };
    case 'dampers':
      return { cleanBottoming: metrics.cleanBottoming, bestLapTime: metrics.bestLapTime };
    case 'diff':
      return { tcClimbing: metrics.tcClimbing, bestLapTime: metrics.bestLapTime };
    case 'brakes':
      return { brakeBiasDrift: metrics.brakeBiasDrift, peakBrakeG: metrics.peakBrakeG };
    case 'pressures':
      return { avgHotPressures: metrics.avgHotPressures };
    case 'alignment':
      return { frontTempSpread: metrics.frontTempSpread, rearTempSpread: metrics.rearTempSpread };
    default:
      return { bestLapTime: metrics.bestLapTime };
  }
}

function scoreRecommendationOutcome(
  rec: StoredRecommendation,
  before: SessionMetricSnapshot,
  after: SessionMetricSnapshot,
): { verdict: 'helped' | 'hurt' | 'neutral' | 'inconclusive'; score: number; evidence: string } {
  const group = rec.parameterGroup;
  const signals: { delta: number; weight: number; label: string }[] = [];

  // Lap time improvement (universal positive signal)
  if (Number.isFinite(before.bestLapTime) && Number.isFinite(after.bestLapTime)) {
    const lapDelta = before.bestLapTime - after.bestLapTime; // positive = faster
    if (Math.abs(lapDelta) > 0.1) {
      signals.push({
        delta: Math.min(Math.max(lapDelta / 1.0, -1), 1), // normalize: 1s improvement = +1
        weight: 0.4,
        label: `Lap time ${lapDelta > 0 ? 'improved' : 'worsened'} by ${Math.abs(lapDelta).toFixed(2)}s`,
      });
    }
  }

  // Group-specific signals
  if (group === 'heave' || group === 'aero') {
    const bottomDelta = before.cleanBottoming - after.cleanBottoming;
    if (Math.abs(bottomDelta) >= 2) {
      signals.push({
        delta: Math.min(Math.max(bottomDelta / 10, -1), 1),
        weight: 0.5,
        label: `Clean bottoming ${bottomDelta > 0 ? 'reduced' : 'increased'} by ${Math.abs(bottomDelta)}`,
      });
    }
  }

  if (group === 'arb' || group === 'springs') {
    // Temperature balance moving toward zero is good
    const balBefore = Math.abs(before.tyreTempBalance);
    const balAfter = Math.abs(after.tyreTempBalance);
    const balDelta = balBefore - balAfter;
    if (Math.abs(balDelta) > 1) {
      signals.push({
        delta: Math.min(Math.max(balDelta / 5, -1), 1),
        weight: 0.3,
        label: `Tyre temp balance ${balDelta > 0 ? 'improved' : 'worsened'} (|delta| ${Math.abs(balDelta).toFixed(1)}°C)`,
      });
    }
  }

  if (group === 'diff') {
    // TC stopped climbing = good
    if (before.tcClimbing && !after.tcClimbing) {
      signals.push({ delta: 0.7, weight: 0.4, label: 'TC no longer climbing during stint' });
    } else if (!before.tcClimbing && after.tcClimbing) {
      signals.push({ delta: -0.7, weight: 0.4, label: 'TC now climbing during stint' });
    }
  }

  if (group === 'brakes') {
    const biasDelta = before.brakeBiasDrift - after.brakeBiasDrift;
    if (Math.abs(biasDelta) > 0.5) {
      signals.push({
        delta: Math.min(Math.max(biasDelta / 2, -1), 1),
        weight: 0.4,
        label: `Brake bias drift ${biasDelta > 0 ? 'reduced' : 'increased'} by ${Math.abs(biasDelta).toFixed(1)}%`,
      });
    }
  }

  if (group === 'alignment') {
    const spreadBefore = (before.frontTempSpread + before.rearTempSpread) / 2;
    const spreadAfter = (after.frontTempSpread + after.rearTempSpread) / 2;
    const spreadDelta = spreadBefore - spreadAfter;
    if (Math.abs(spreadDelta) > 1) {
      signals.push({
        delta: Math.min(Math.max(spreadDelta / 4, -1), 1),
        weight: 0.3,
        label: `Tyre temp spread ${spreadDelta > 0 ? 'reduced' : 'increased'} by ${Math.abs(spreadDelta).toFixed(1)}°C`,
      });
    }
  }

  // Lat G improvement (universal — more lat G = more grip = good)
  const latDelta = after.peakLatG - before.peakLatG;
  if (Math.abs(latDelta) > 0.05) {
    signals.push({
      delta: Math.min(Math.max(latDelta / 0.3, -1), 1),
      weight: 0.2,
      label: `Peak lateral G ${latDelta > 0 ? 'increased' : 'decreased'} by ${Math.abs(latDelta).toFixed(2)}g`,
    });
  }

  if (signals.length === 0) {
    return { verdict: 'inconclusive', score: 0, evidence: 'No measurable metric changes detected.' };
  }

  // Weighted score
  const totalWeight = signals.reduce((s, sig) => s + sig.weight, 0);
  const weightedScore = signals.reduce((s, sig) => s + sig.delta * sig.weight, 0) / totalWeight;
  const evidence = signals.map(s => s.label).join('; ');

  if (weightedScore > 0.15) return { verdict: 'helped', score: weightedScore, evidence };
  if (weightedScore < -0.15) return { verdict: 'hurt', score: weightedScore, evidence };
  return { verdict: 'neutral', score: weightedScore, evidence };
}

function computeImprovementScore(
  prevMetrics: SessionMetricSnapshot,
  currentMetrics: SessionMetricSnapshot,
): number {
  let score = 0;
  let factors = 0;

  // Lap time
  if (Number.isFinite(prevMetrics.bestLapTime) && Number.isFinite(currentMetrics.bestLapTime)) {
    const lapDelta = prevMetrics.bestLapTime - currentMetrics.bestLapTime;
    score += Math.min(Math.max(lapDelta / 2.0, -1), 1) * 0.5;
    factors += 0.5;
  }

  // Bottoming
  const bottomDelta = prevMetrics.cleanBottoming - currentMetrics.cleanBottoming;
  if (prevMetrics.cleanBottoming > 0 || currentMetrics.cleanBottoming > 0) {
    score += Math.min(Math.max(bottomDelta / 15, -1), 1) * 0.2;
    factors += 0.2;
  }

  // Balance
  const balDelta = Math.abs(prevMetrics.tyreTempBalance) - Math.abs(currentMetrics.tyreTempBalance);
  score += Math.min(Math.max(balDelta / 6, -1), 1) * 0.15;
  factors += 0.15;

  // Lat G
  const latDelta = currentMetrics.peakLatG - prevMetrics.peakLatG;
  score += Math.min(Math.max(latDelta / 0.3, -1), 1) * 0.15;
  factors += 0.15;

  return factors > 0 ? score / factors : 0;
}

// ── Parameter Group Mapping ──────────────────────────────────

const PARAM_GROUP_MAP: Record<string, string> = {
  frontHeaveSpring: 'heave', rearThirdSpring: 'heave', frontHeavePerch: 'heave', rearThirdPerch: 'heave',
  rearWingAngle: 'aero', frontPushrod: 'aero', rearPushrod: 'aero', frontRideHeight: 'aero', rearRideHeight: 'aero',
  frontTorsionBarOD: 'springs', rearSpringRate: 'springs', rearSpringPerch: 'springs',
  frontArbSize: 'arb', rearArbSize: 'arb', frontArbBlades: 'arb', rearArbBlades: 'arb',
  frontCamber: 'alignment', rearCamber: 'alignment', frontToe: 'alignment', rearToe: 'alignment',
  frontLSComp: 'dampers', rearLSComp: 'dampers', frontHSComp: 'dampers', rearHSComp: 'dampers',
  frontHSCompSlope: 'dampers', rearHSCompSlope: 'dampers', frontLSRbd: 'dampers', rearLSRbd: 'dampers',
  frontHSRbd: 'dampers', rearHSRbd: 'dampers',
  rearDiffPreload: 'diff', frontDiffPreload: 'diff', diffClutchPlates: 'diff', diffRampAngles: 'diff',
  brakeBias: 'brakes', brakeMigration: 'brakes', brakePads: 'brakes',
  LFcoldPressure: 'pressures', RFcoldPressure: 'pressures', LRcoldPressure: 'pressures', RRcoldPressure: 'pressures',
};

function getParamGroup(parameterKey: string): string {
  // Try direct match
  if (PARAM_GROUP_MAP[parameterKey]) return PARAM_GROUP_MAP[parameterKey];
  // Try leaf key (for nested keys like 'platform.frontHeaveSpring')
  const leaf = parameterKey.split('.').pop() || parameterKey;
  if (PARAM_GROUP_MAP[leaf]) return PARAM_GROUP_MAP[leaf];
  return 'other';
}

// ── Storage Operations ───────────────────────────────────────

function loadSessions(combo: string): SessionRecord[] {
  try {
    const raw = localStorage.getItem(storageKey(combo));
    if (!raw) return [];
    return JSON.parse(raw) as SessionRecord[];
  } catch {
    return [];
  }
}

function saveSessions(combo: string, sessions: SessionRecord[]): void {
  try {
    // Keep only the most recent N sessions
    const trimmed = sessions.slice(-MAX_SESSIONS_PER_COMBO);
    localStorage.setItem(storageKey(combo), JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable — degrade gracefully
    console.warn('[SessionMemory] Failed to save session history.');
  }
}

// ── Public API ───────────────────────────────────────────────

/**
 * Save a session analysis to memory. Call this after every IBT analysis completes.
 * Automatically validates the PREVIOUS session's recommendations if applicable.
 */
export function saveSession(analysis: SessionAnalysis, aiBrief?: AISetupBrief | null): SessionRecord {
  const car = analysis.header.car;
  const track = analysis.header.track;
  const combo = comboKey(car, track);
  const sessions = loadSessions(combo);

  const metrics = extractMetrics(analysis);
  const setupSnapshot = extractSetupSnapshot(analysis);

  // Auto-validate previous session's recommendations
  const prevSession = sessions[sessions.length - 1] || null;
  if (prevSession && prevSession.aiRecommendations && prevSession.aiRecommendations.length > 0) {
    prevSession.outcomes = autoValidate(prevSession, metrics, setupSnapshot);
    prevSession.improvementScore = computeImprovementScore(prevSession.metrics, metrics);
  }

  // Store AI recommendations compactly
  const storedRecs: StoredRecommendation[] | null = aiBrief
    ? aiBrief.recommendations.map(rec => ({
        parameterKey: rec.parameterKey,
        displayName: rec.displayName,
        currentValue: rec.currentValue,
        targetValue: rec.targetValue,
        reason: rec.reason,
        confidence: rec.confidence,
        parameterGroup: getParamGroup(rec.parameterKey),
      }))
    : null;

  const record: SessionRecord = {
    id: `${combo}_${Date.now()}`,
    timestamp: Date.now(),
    car,
    track,
    carProfileId: analysis.carProfileId,
    trackProfileId: analysis.trackProfileId,
    validLaps: analysis.validLaps.length,
    metrics,
    setupSnapshot,
    aiRecommendations: storedRecs,
    outcomes: null, // validated when NEXT session is loaded
    improvementScore: null,
  };

  sessions.push(record);
  saveSessions(combo, sessions);

  return record;
}

/**
 * Store AI recommendations after they arrive (they may come after initial analysis save).
 */
export function attachRecommendations(
  sessionId: string,
  car: string,
  track: string,
  aiBrief: AISetupBrief,
): void {
  const combo = comboKey(car, track);
  const sessions = loadSessions(combo);
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return;

  session.aiRecommendations = aiBrief.recommendations.map(rec => ({
    parameterKey: rec.parameterKey,
    displayName: rec.displayName,
    currentValue: rec.currentValue,
    targetValue: rec.targetValue,
    reason: rec.reason,
    confidence: rec.confidence,
    parameterGroup: getParamGroup(rec.parameterKey),
  }));

  saveSessions(combo, sessions);
}

/**
 * Get aggregated learning stats for parameter groups across a car+track combo.
 */
export function getParameterLearnings(car: string, track: string): ParameterGroupLearning[] {
  const combo = comboKey(car, track);
  const sessions = loadSessions(combo);

  const groupStats = new Map<string, {
    total: number; applied: number; helped: number; hurt: number; neutral: number;
    confHelped: number[]; confHurt: number[];
  }>();

  for (const session of sessions) {
    if (!session.outcomes) continue;
    for (const outcome of session.outcomes) {
      const rec = session.aiRecommendations?.find(r => r.parameterKey === outcome.parameterKey);
      const group = rec?.parameterGroup || getParamGroup(outcome.parameterKey);
      const stats = groupStats.get(group) || { total: 0, applied: 0, helped: 0, hurt: 0, neutral: 0, confHelped: [], confHurt: [] };

      stats.total++;
      if (outcome.wasApplied) {
        stats.applied++;
        const confNum = rec?.confidence === 'HIGH' ? 3 : rec?.confidence === 'MEDIUM' ? 2 : 1;
        if (outcome.verdict === 'helped') { stats.helped++; stats.confHelped.push(confNum); }
        else if (outcome.verdict === 'hurt') { stats.hurt++; stats.confHurt.push(confNum); }
        else { stats.neutral++; }
      }
      groupStats.set(group, stats);
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return [...groupStats.entries()].map(([group, stats]) => ({
    parameterGroup: group,
    totalRecommendations: stats.total,
    appliedCount: stats.applied,
    helpedCount: stats.helped,
    hurtCount: stats.hurt,
    neutralCount: stats.neutral,
    successRate: stats.helped + stats.hurt > 0 ? stats.helped / (stats.helped + stats.hurt) : NaN,
    avgConfidenceWhenHelped: avg(stats.confHelped),
    avgConfidenceWhenHurt: avg(stats.confHurt),
  }));
}

/**
 * Build context for injection into the AI prompt.
 * This is what makes the AI "remember" past sessions and learn from outcomes.
 */
export function buildMemoryContext(car: string, track: string): MemoryContext | null {
  const combo = comboKey(car, track);
  const sessions = loadSessions(combo);

  if (sessions.length === 0) return null;

  // Recent session summaries (most recent first, up to MAX_SESSIONS_IN_PROMPT)
  const recentSessions = sessions.slice(-MAX_SESSIONS_IN_PROMPT).reverse();
  const previousSessions: SessionSummaryForPrompt[] = recentSessions.map((session, i) => {
    const keyIssues: string[] = [];
    if (session.metrics.cleanBottoming > 5) keyIssues.push(`${session.metrics.cleanBottoming} clean bottoming events`);
    if (Math.abs(session.metrics.tyreTempBalance) > 6) keyIssues.push(`Tyre balance off by ${Math.abs(session.metrics.tyreTempBalance).toFixed(1)}°C`);
    if (session.metrics.tcClimbing) keyIssues.push('TC climbing during stint');
    if (session.metrics.brakeBiasDrift > 1.5) keyIssues.push(`Brake bias drifted ${session.metrics.brakeBiasDrift.toFixed(1)}%`);

    const changesApplied: string[] = [];
    if (session.outcomes) {
      for (const outcome of session.outcomes) {
        if (outcome.wasApplied) {
          changesApplied.push(`${outcome.displayName}: ${outcome.verdict} (${outcome.evidence})`);
        }
      }
    }

    let outcome = 'No comparison available';
    if (session.improvementScore !== null) {
      if (session.improvementScore > 0.15) outcome = `Improved (score: ${session.improvementScore.toFixed(2)})`;
      else if (session.improvementScore < -0.15) outcome = `Regressed (score: ${session.improvementScore.toFixed(2)})`;
      else outcome = `Neutral (score: ${session.improvementScore.toFixed(2)})`;
    }

    return {
      sessionsAgo: i + 1,
      bestLap: session.metrics.bestLapTime,
      validLaps: session.validLaps,
      keyIssues,
      changesApplied,
      outcome,
    };
  });

  // Parameter learnings
  const learnings = getParameterLearnings(car, track);
  const parameterLearnings: ParameterLearningForPrompt[] = learnings
    .filter(l => l.appliedCount >= 2) // need at least 2 data points
    .sort((a, b) => b.appliedCount - a.appliedCount)
    .slice(0, MAX_LEARNINGS_IN_PROMPT)
    .map(l => {
      let note = '';
      if (!isNaN(l.successRate)) {
        if (l.successRate >= 0.7) note = `Historically effective (${(l.successRate * 100).toFixed(0)}% success rate)`;
        else if (l.successRate <= 0.3) note = `Historically unreliable (${(l.successRate * 100).toFixed(0)}% success rate) — consider alternative approaches`;
        else note = `Mixed results (${(l.successRate * 100).toFixed(0)}% success rate)`;
      }
      return {
        parameter: l.parameterGroup,
        successRate: l.successRate,
        sampleSize: l.appliedCount,
        note,
      };
    });

  // Setup trends — detect repeated patterns
  const setupTrends: string[] = [];
  if (sessions.length >= 3) {
    const last3 = sessions.slice(-3);
    // Check if lap times are trending
    const lapTrend = last3.map(s => s.metrics.bestLapTime).filter(Number.isFinite);
    if (lapTrend.length === 3) {
      if (lapTrend[0] > lapTrend[1] && lapTrend[1] > lapTrend[2]) {
        setupTrends.push(`Lap times improving across last 3 sessions (${lapTrend.map(t => t.toFixed(2)).join(' → ')})`);
      } else if (lapTrend[0] < lapTrend[1] && lapTrend[1] < lapTrend[2]) {
        setupTrends.push(`Lap times regressing across last 3 sessions — consider reverting recent changes`);
      }
    }

    // Check if bottoming is persistent
    const bottoming = last3.map(s => s.metrics.cleanBottoming);
    if (bottoming.every(b => b > 5)) {
      setupTrends.push(`Persistent bottoming across 3 sessions (${bottoming.join(', ')} events) — heave spring changes so far have not resolved it`);
    }
  }

  return { previousSessions, parameterLearnings, setupTrends };
}

/**
 * Format memory context as text for injection into buildPrompt().
 */
export function formatMemoryForPrompt(ctx: MemoryContext): string {
  const lines: string[] = [];

  lines.push('=== SESSION MEMORY (auto-learned from previous sessions at this car+track) ===');

  if (ctx.previousSessions.length > 0) {
    lines.push('');
    lines.push('RECENT SESSION HISTORY:');
    for (const s of ctx.previousSessions) {
      lines.push(`  ${s.sessionsAgo} session(s) ago: ${s.bestLap.toFixed(2)}s best (${s.validLaps} laps). ${s.outcome}.`);
      if (s.keyIssues.length > 0) lines.push(`    Issues: ${s.keyIssues.join(', ')}`);
      if (s.changesApplied.length > 0) {
        for (const change of s.changesApplied.slice(0, 3)) {
          lines.push(`    Change applied: ${change}`);
        }
      }
    }
  }

  if (ctx.parameterLearnings.length > 0) {
    lines.push('');
    lines.push('PARAMETER GROUP LEARNINGS (from auto-validated outcomes):');
    for (const l of ctx.parameterLearnings) {
      lines.push(`  ${l.parameter}: ${l.note} (${l.sampleSize} samples)`);
    }
    lines.push('  Use these learnings to weight recommendation confidence — prefer parameter groups with higher historical success.');
  }

  if (ctx.setupTrends.length > 0) {
    lines.push('');
    lines.push('SETUP TRENDS:');
    for (const t of ctx.setupTrends) {
      lines.push(`  ${t}`);
    }
  }

  lines.push('=== END SESSION MEMORY ===');
  return lines.join('\n');
}

/**
 * Get all stored sessions for a car+track combo (for UI display).
 */
export function getSessionHistory(car: string, track: string): SessionRecord[] {
  return loadSessions(comboKey(car, track));
}

/**
 * Get total sessions stored across all combos.
 */
export function getMemoryStats(): { combos: number; totalSessions: number; totalOutcomes: number } {
  let combos = 0;
  let totalSessions = 0;
  let totalOutcomes = 0;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      combos++;
      try {
        const sessions = JSON.parse(localStorage.getItem(key) || '[]') as SessionRecord[];
        totalSessions += sessions.length;
        for (const s of sessions) {
          if (s.outcomes) totalOutcomes += s.outcomes.filter(o => o.wasApplied).length;
        }
      } catch { /* ignore */ }
    }
  }

  return { combos, totalSessions, totalOutcomes };
}

/**
 * Clear all memory (for testing or reset).
 */
export function clearAllMemory(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) keysToRemove.push(key);
  }
  for (const key of keysToRemove) localStorage.removeItem(key);
}
