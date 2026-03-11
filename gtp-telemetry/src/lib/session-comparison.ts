// ═══════════════════════════════════════════════════════════════
// SESSION COMPARISON — Rich delta analysis between two sessions
//
// Computes per-metric deltas with directional indicators,
// setup diffs, and an overall improvement verdict.
// ═══════════════════════════════════════════════════════════════

import type { SessionAnalysis } from './types';
import type { SessionRecord, RecommendationOutcome } from './session-memory';
import { extractMetrics } from './session-memory';
import { compareSetups } from './setup-compare';
import type { CompareResult } from './types';

// ── Types ────────────────────────────────────────────────────

export type DeltaVerdict = 'better' | 'worse' | 'same' | 'inconclusive';

export interface MetricDelta {
  label: string;
  group: string;
  valuePrev: string;
  valueCurr: string;
  delta: string;
  deltaNum: number;
  verdict: DeltaVerdict;
  /** Higher weight = more important */
  weight: number;
  icon: 'time' | 'platform' | 'tyre' | 'dynamics' | 'aids';
}

export interface SessionComparisonResult {
  /** Overall score from -1 (regression) to +1 (improvement) */
  overallScore: number;
  overallVerdict: DeltaVerdict;
  /** Human-readable summary */
  summary: string;
  /** Individual metric comparisons */
  deltas: MetricDelta[];
  /** Setup diff between sessions */
  setupDiff: CompareResult | null;
  /** Auto-validated recommendation outcomes (from session-memory) */
  outcomes: RecommendationOutcome[];
  /** Session metadata */
  prevSession: {
    car: string;
    track: string;
    bestLap: string;
    validLaps: number;
    timestamp: number;
  };
  currSession: {
    car: string;
    track: string;
    bestLap: string;
    validLaps: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────

function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(3).padStart(6, '0')}`;
}

function formatDelta(value: number, unit: string, inverted = false): { str: string; verdict: DeltaVerdict } {
  if (Math.abs(value) < 0.001) return { str: '—', verdict: 'same' };
  const sign = value > 0 ? '+' : '';
  const str = `${sign}${value.toFixed(2)}${unit}`;
  // For most metrics: negative delta = better (lower is better)
  // inverted: positive delta = better (higher is better like latG)
  const isGood = inverted ? value > 0 : value < 0;
  const verdict: DeltaVerdict = Math.abs(value) < 0.05 ? 'same' : isGood ? 'better' : 'worse';
  return { str, verdict };
}

function formatTimeDelta(seconds: number): { str: string; verdict: DeltaVerdict } {
  if (!Number.isFinite(seconds)) return { str: '--', verdict: 'inconclusive' };
  const sign = seconds > 0 ? '+' : '';
  const str = `${sign}${seconds.toFixed(3)}s`;
  const verdict: DeltaVerdict = Math.abs(seconds) < 0.05 ? 'same' : seconds < 0 ? 'better' : 'worse';
  return { str, verdict };
}

// ── Main Comparison Function ─────────────────────────────────

/**
 * Compare current analysis against a previous session record.
 * Produces a rich delta breakdown for the UI.
 */
export function compareSessionAnalyses(
  current: SessionAnalysis,
  prevRecord: SessionRecord,
): SessionComparisonResult {
  const currMetrics = extractMetrics(current);
  const prevMetrics = prevRecord.metrics;

  const deltas: MetricDelta[] = [];

  // 1. Lap time — THE most important metric
  const bestLapDelta = currMetrics.bestLapTime - prevMetrics.bestLapTime;
  const bestLapFmt = formatTimeDelta(bestLapDelta);
  deltas.push({
    label: 'Best Lap Time',
    group: 'Performance',
    valuePrev: formatLapTime(prevMetrics.bestLapTime),
    valueCurr: formatLapTime(currMetrics.bestLapTime),
    delta: bestLapFmt.str,
    deltaNum: bestLapDelta,
    verdict: bestLapFmt.verdict,
    weight: 1.0,
    icon: 'time',
  });

  // Avg lap time
  const avgLapDelta = currMetrics.avgLapTime - prevMetrics.avgLapTime;
  const avgLapFmt = formatTimeDelta(avgLapDelta);
  deltas.push({
    label: 'Avg Lap Time',
    group: 'Performance',
    valuePrev: formatLapTime(prevMetrics.avgLapTime),
    valueCurr: formatLapTime(currMetrics.avgLapTime),
    delta: avgLapFmt.str,
    deltaNum: avgLapDelta,
    verdict: avgLapFmt.verdict,
    weight: 0.6,
    icon: 'time',
  });

  // 2. Clean bottoming events — lower is better
  const bottomDelta = currMetrics.cleanBottoming - prevMetrics.cleanBottoming;
  const bottomFmt = formatDelta(bottomDelta, '');
  deltas.push({
    label: 'Clean Bottoming',
    group: 'Platform',
    valuePrev: `${prevMetrics.cleanBottoming}`,
    valueCurr: `${currMetrics.cleanBottoming}`,
    delta: bottomFmt.str,
    deltaNum: bottomDelta,
    verdict: bottomFmt.verdict,
    weight: 0.5,
    icon: 'platform',
  });

  // Kerb bottoming (informational)
  const kerbDelta = currMetrics.kerbBottoming - prevMetrics.kerbBottoming;
  const kerbFmt = formatDelta(kerbDelta, '');
  deltas.push({
    label: 'Kerb Bottoming',
    group: 'Platform',
    valuePrev: `${prevMetrics.kerbBottoming}`,
    valueCurr: `${currMetrics.kerbBottoming}`,
    delta: kerbFmt.str,
    deltaNum: kerbDelta,
    verdict: kerbFmt.verdict,
    weight: 0.15,
    icon: 'platform',
  });

  // 3. Peak lateral G — higher is better
  const latGDelta = currMetrics.peakLatG - prevMetrics.peakLatG;
  const latGFmt = formatDelta(latGDelta, 'g', true);
  deltas.push({
    label: 'Peak Lateral G',
    group: 'Dynamics',
    valuePrev: `${prevMetrics.peakLatG.toFixed(2)}g`,
    valueCurr: `${currMetrics.peakLatG.toFixed(2)}g`,
    delta: latGFmt.str,
    deltaNum: latGDelta,
    verdict: latGFmt.verdict,
    weight: 0.4,
    icon: 'dynamics',
  });

  // Peak brake G — higher = better braking
  const brakeGDelta = currMetrics.peakBrakeG - prevMetrics.peakBrakeG;
  const brakeGFmt = formatDelta(brakeGDelta, 'g', true);
  deltas.push({
    label: 'Peak Brake G',
    group: 'Dynamics',
    valuePrev: `${prevMetrics.peakBrakeG.toFixed(2)}g`,
    valueCurr: `${currMetrics.peakBrakeG.toFixed(2)}g`,
    delta: brakeGFmt.str,
    deltaNum: brakeGDelta,
    verdict: brakeGFmt.verdict,
    weight: 0.2,
    icon: 'dynamics',
  });

  // 4. Tyre temp balance — closer to zero is better
  const balPrev = Math.abs(prevMetrics.tyreTempBalance);
  const balCurr = Math.abs(currMetrics.tyreTempBalance);
  const balDelta = balCurr - balPrev; // negative = better (closer to zero)
  const balFmt = formatDelta(balDelta, '°C');
  deltas.push({
    label: 'Tyre Temp Balance',
    group: 'Tyres',
    valuePrev: `${prevMetrics.tyreTempBalance > 0 ? '+' : ''}${prevMetrics.tyreTempBalance.toFixed(1)}°C`,
    valueCurr: `${currMetrics.tyreTempBalance > 0 ? '+' : ''}${currMetrics.tyreTempBalance.toFixed(1)}°C`,
    delta: balFmt.str,
    deltaNum: balDelta,
    verdict: balFmt.verdict,
    weight: 0.3,
    icon: 'tyre',
  });

  // Front temp spread — lower is better
  const frontSpreadDelta = currMetrics.frontTempSpread - prevMetrics.frontTempSpread;
  const frontSpreadFmt = formatDelta(frontSpreadDelta, '°C');
  deltas.push({
    label: 'Front Temp Spread',
    group: 'Tyres',
    valuePrev: `${prevMetrics.frontTempSpread.toFixed(1)}°C`,
    valueCurr: `${currMetrics.frontTempSpread.toFixed(1)}°C`,
    delta: frontSpreadFmt.str,
    deltaNum: frontSpreadDelta,
    verdict: frontSpreadFmt.verdict,
    weight: 0.2,
    icon: 'tyre',
  });

  // Rear temp spread
  const rearSpreadDelta = currMetrics.rearTempSpread - prevMetrics.rearTempSpread;
  const rearSpreadFmt = formatDelta(rearSpreadDelta, '°C');
  deltas.push({
    label: 'Rear Temp Spread',
    group: 'Tyres',
    valuePrev: `${prevMetrics.rearTempSpread.toFixed(1)}°C`,
    valueCurr: `${currMetrics.rearTempSpread.toFixed(1)}°C`,
    delta: rearSpreadFmt.str,
    deltaNum: rearSpreadDelta,
    verdict: rearSpreadFmt.verdict,
    weight: 0.2,
    icon: 'tyre',
  });

  // 5. TC climbing
  const tcChanged = prevMetrics.tcClimbing !== currMetrics.tcClimbing;
  deltas.push({
    label: 'TC Climbing',
    group: 'Driver Aids',
    valuePrev: prevMetrics.tcClimbing ? 'Yes' : 'No',
    valueCurr: currMetrics.tcClimbing ? 'Yes' : 'No',
    delta: tcChanged
      ? currMetrics.tcClimbing ? 'Regressed' : 'Resolved'
      : '—',
    deltaNum: tcChanged ? (currMetrics.tcClimbing ? 1 : -1) : 0,
    verdict: tcChanged ? (currMetrics.tcClimbing ? 'worse' : 'better') : 'same',
    weight: 0.3,
    icon: 'aids',
  });

  // Brake bias drift — lower is better
  const biasDriftDelta = currMetrics.brakeBiasDrift - prevMetrics.brakeBiasDrift;
  const biasDriftFmt = formatDelta(biasDriftDelta, '%');
  deltas.push({
    label: 'Brake Bias Drift',
    group: 'Driver Aids',
    valuePrev: `${prevMetrics.brakeBiasDrift.toFixed(1)}%`,
    valueCurr: `${currMetrics.brakeBiasDrift.toFixed(1)}%`,
    delta: biasDriftFmt.str,
    deltaNum: biasDriftDelta,
    verdict: biasDriftFmt.verdict,
    weight: 0.2,
    icon: 'aids',
  });

  // ── Overall Score ──
  const scored = deltas.filter(d => d.verdict !== 'inconclusive' && d.verdict !== 'same');
  const totalWeight = scored.reduce((acc, d) => acc + d.weight, 0);
  let overallScore = 0;
  if (totalWeight > 0) {
    overallScore = scored.reduce((acc, d) => {
      const signal = d.verdict === 'better' ? 1 : d.verdict === 'worse' ? -1 : 0;
      return acc + signal * d.weight;
    }, 0) / totalWeight;
  }

  const overallVerdict: DeltaVerdict =
    overallScore > 0.15 ? 'better' : overallScore < -0.15 ? 'worse' : 'same';

  // ── Setup diff ──
  let setupDiff: CompareResult | null = null;
  if (prevRecord.setupSnapshot && current.normalizedSetup) {
    try {
      // Build a minimal NormalizedSetup from the stored snapshot for comparison
      setupDiff = compareSetups(
        current.normalizedSetup,
        current.normalizedSetup, // We'll build from snapshot below
        'Current',
        'Previous',
      );
      // Override: build diffs manually from snapshot vs current
      const manualDiffs = buildSnapshotDiff(prevRecord.setupSnapshot, current);
      if (manualDiffs) setupDiff = manualDiffs;
    } catch {
      // Setup comparison not available
    }
  }

  // ── Summary ──
  const betterCount = deltas.filter(d => d.verdict === 'better').length;
  const worseCount = deltas.filter(d => d.verdict === 'worse').length;
  const lapDeltaStr = Number.isFinite(bestLapDelta)
    ? bestLapDelta < -0.05
      ? `${Math.abs(bestLapDelta).toFixed(3)}s faster`
      : bestLapDelta > 0.05
        ? `${bestLapDelta.toFixed(3)}s slower`
        : 'same pace'
    : 'lap time inconclusive';

  const summary =
    overallVerdict === 'better'
      ? `Session improved: ${lapDeltaStr}. ${betterCount} metrics improved, ${worseCount} regressed.`
      : overallVerdict === 'worse'
        ? `Session regressed: ${lapDeltaStr}. ${worseCount} metrics worse, ${betterCount} improved.`
        : `Session neutral: ${lapDeltaStr}. ${betterCount} improved, ${worseCount} regressed — net effect minimal.`;

  return {
    overallScore,
    overallVerdict,
    summary,
    deltas,
    setupDiff,
    outcomes: prevRecord.outcomes ?? [],
    prevSession: {
      car: prevRecord.car,
      track: prevRecord.track,
      bestLap: formatLapTime(prevRecord.metrics.bestLapTime),
      validLaps: prevRecord.validLaps,
      timestamp: prevRecord.timestamp,
    },
    currSession: {
      car: current.header.car,
      track: current.header.track,
      bestLap: formatLapTime(current.bestTime),
      validLaps: current.validLaps.length,
    },
  };
}

/**
 * Build a CompareResult from a stored snapshot vs current analysis.
 * This works with the key→value snapshot stored in session-memory.
 */
function buildSnapshotDiff(
  prevSnapshot: Record<string, string>,
  current: SessionAnalysis,
): CompareResult | null {
  const diffs: CompareResult['diffs'] = [];

  for (const param of current.normalizedSetup.parameters) {
    const prevValue = prevSnapshot[param.parameterKey];
    if (prevValue === undefined) continue;
    if (prevValue === param.displayValue) continue;

    // Try to compute numeric delta
    const prevNum = parseFloat(prevValue);
    const currNum = param.numericValue;
    let deltaStr: string;
    let deltaNum = 0;

    if (!isNaN(prevNum) && currNum !== undefined) {
      deltaNum = currNum - prevNum;
      const sign = deltaNum > 0 ? '+' : '';
      const unit = param.unit || '';
      deltaStr = `${sign}${deltaNum.toFixed(2)}${unit ? ' ' + unit : ''}`;
    } else {
      deltaStr = `${prevValue} → ${param.displayValue}`;
    }

    if (!isNaN(prevNum) && currNum !== undefined && Math.abs(deltaNum) < 0.01) continue;

    diffs.push({
      parameterKey: param.parameterKey,
      displayName: param.displayName,
      group: param.group,
      setupA: { value: param.displayValue, numeric: currNum },
      setupB: { value: prevValue, numeric: isNaN(prevNum) ? undefined : prevNum },
      delta: deltaStr,
      handlingImpact: '',
      impactDirection: 'context-dependent',
      impactMagnitude: Math.abs(deltaNum) > 1 ? 'large' : Math.abs(deltaNum) > 0.1 ? 'medium' : 'small',
      hierarchyRank: 0,
    });
  }

  if (diffs.length === 0) return null;

  return {
    diffs,
    summary: `${diffs.length} setup parameter${diffs.length > 1 ? 's' : ''} changed between sessions.`,
    setupALabel: 'Current',
    setupBLabel: 'Previous',
  };
}
