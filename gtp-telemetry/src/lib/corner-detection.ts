// ═══════════════════════════════════════════════════════════════
// CORNER DETECTION — Speed-minima based lap segmentation
// Professional approach used by MoTeC i2, Pi Toolbox, Atlas.
// Identifies individual corners from speed/acceleration traces,
// classifies them by type (tight/medium/fast, L/R), and provides
// per-corner metric aggregation points for the analysis engine.
// ═══════════════════════════════════════════════════════════════

import { filterWithPreset, SG_PRESETS } from './dsp/savitzky-golay';
import { speedToKph } from './unit-conversions';

// ─── Types ──────────────────────────────────────────────────────

export type CornerDirection = 'left' | 'right';
export type CornerRadius = 'tight' | 'medium' | 'fast';
export type CornerSpeedClass = 'low' | 'medium' | 'high';

export interface CornerSegment {
  /** Unique corner ID: "T1", "T2", ... */
  id: string;
  /** Sequential corner number (1-based) */
  number: number;
  /** Corner classification */
  direction: CornerDirection;
  radius: CornerRadius;
  speedClass: CornerSpeedClass;
  /** Sample indices */
  brakingIdx: number;
  apexIdx: number;
  exitIdx: number;
  /** Speed values in km/h */
  entrySpeedKph: number;
  apexSpeedKph: number;
  exitSpeedKph: number;
  /** G-force values */
  peakLatG: number;
  avgLatG: number;
  peakBrakeG: number;
  /** Duration in seconds */
  durationSec: number;
  /** Track position (LapDistPct range) */
  distPctStart: number;
  distPctApex: number;
  distPctEnd: number;
}

export interface StraightSegment {
  id: string;
  startIdx: number;
  endIdx: number;
  maxSpeedKph: number;
  distPctStart: number;
  distPctEnd: number;
  durationSec: number;
}

export interface LapSegmentation {
  corners: CornerSegment[];
  straights: StraightSegment[];
  /** Total corners detected */
  cornerCount: number;
  /** Track classification based on corner distribution */
  trackType: 'technical' | 'mixed' | 'high-speed' | 'oval';
}

// ─── Configuration ──────────────────────────────────────────────

/** Fraction of max speed below which a local minimum is a "corner apex" */
const APEX_SPEED_FRACTION = 0.95;

/** Minimum deceleration (positive G) to mark braking point */
const BRAKING_G_THRESHOLD = 0.3;

/** Minimum throttle % to mark corner exit */
const EXIT_THROTTLE_THRESHOLD = 0.90;

/** Exit detection: speed must return to within this fraction of entry speed */
const EXIT_SPEED_RECOVERY_FRACTION = 0.95;

/** Minimum time gap between corners before they merge into a complex (seconds) */
const MERGE_GAP_SECONDS = 0.5;

/** Minimum speed drop to qualify as a corner (km/h below straight-line speed) */
const MIN_SPEED_DROP_KPH = 15;

/** Corner radius classification thresholds */
const RADIUS_TIGHT_MAX_KPH = 80;
const RADIUS_MEDIUM_MAX_KPH = 150;

/** Corner speed classification thresholds */
const SPEED_LOW_MAX_KPH = 80;
const SPEED_MEDIUM_MAX_KPH = 150;

// ─── Main API ───────────────────────────────────────────────────

/**
 * Detect and classify corners within a single lap.
 *
 * @param speedMs      - Speed channel in m/s
 * @param latAccel     - Lateral acceleration in m/s^2
 * @param longAccel    - Longitudinal acceleration in m/s^2
 * @param throttle     - Throttle position (0-1 or 0-100, auto-detected)
 * @param lapDistPct   - Lap distance percentage (0-1)
 * @param sessionTime  - Session timestamps in seconds
 * @param lapStart     - First sample index of the lap
 * @param lapEnd       - Last sample index of the lap
 * @param tickRate     - Samples per second
 * @returns LapSegmentation with detected corners and straights
 */
export function detectCorners(
  speedMs: Float64Array | null,
  latAccel: Float64Array | null,
  longAccel: Float64Array | null,
  throttle: Float64Array | null,
  lapDistPct: Float64Array | null,
  sessionTime: Float64Array | null,
  lapStart: number,
  lapEnd: number,
  tickRate: number,
): LapSegmentation {
  const empty: LapSegmentation = { corners: [], straights: [], cornerCount: 0, trackType: 'mixed' };

  if (!speedMs || !lapDistPct || !sessionTime) return empty;
  if (lapEnd - lapStart < SG_PRESETS.speedCornerDetect.windowSize) return empty;

  // ── 1. Extract lap segment and smooth speed ───────────────────
  const lapLen = lapEnd - lapStart;
  const lapSpeed = new Float64Array(lapLen);
  for (let i = 0; i < lapLen; i++) {
    lapSpeed[i] = speedMs[lapStart + i];
  }

  const smoothedSpeed = filterWithPreset(lapSpeed, SG_PRESETS.speedCornerDetect);

  // Convert to km/h for thresholding
  const speedKph = new Float64Array(lapLen);
  for (let i = 0; i < lapLen; i++) {
    speedKph[i] = speedToKph(smoothedSpeed[i]);
  }

  // ── 2. Find max speed and speed threshold ─────────────────────
  let maxSpeedKph = 0;
  for (let i = 0; i < lapLen; i++) {
    if (Number.isFinite(speedKph[i]) && speedKph[i] > maxSpeedKph) {
      maxSpeedKph = speedKph[i];
    }
  }

  const apexThreshold = maxSpeedKph * APEX_SPEED_FRACTION;
  const minApexSpeed = maxSpeedKph - MIN_SPEED_DROP_KPH; // apex must be below this to count

  // Bail for ovals or tracks with no real corners
  if (maxSpeedKph < 50) return empty;

  // ── 3. Find local speed minima (candidate apexes) ─────────────
  const candidates: number[] = []; // indices into lap-local arrays

  for (let i = 2; i < lapLen - 2; i++) {
    const v = speedKph[i];
    if (!Number.isFinite(v)) continue;
    if (v >= apexThreshold) continue; // Not slow enough to be a corner
    if (v >= minApexSpeed) continue;  // Not enough speed drop

    // Local minimum: lower than neighbors (±2 samples for robustness)
    if (v <= speedKph[i - 1] && v <= speedKph[i + 1] &&
        v <= speedKph[i - 2] && v <= speedKph[i + 2]) {
      candidates.push(i);
    }
  }

  if (candidates.length === 0) {
    return { corners: [], straights: buildStraightsOnly(lapStart, lapEnd, speedKph, lapDistPct, sessionTime), cornerCount: 0, trackType: 'oval' };
  }

  // ── 4. Merge closely-spaced minima (keep lowest) ──────────────
  const mergedApexes: number[] = [];
  const mergeGapSamples = Math.ceil(MERGE_GAP_SECONDS * tickRate);

  let groupStart = 0;
  for (let i = 1; i <= candidates.length; i++) {
    const isLast = i === candidates.length;
    const gap = isLast ? Infinity : candidates[i] - candidates[i - 1];

    if (gap > mergeGapSamples || isLast) {
      // Find minimum in this group
      let bestIdx = candidates[groupStart];
      let bestSpeed = speedKph[bestIdx];
      for (let j = groupStart + 1; j < i; j++) {
        if (speedKph[candidates[j]] < bestSpeed) {
          bestSpeed = speedKph[candidates[j]];
          bestIdx = candidates[j];
        }
      }
      mergedApexes.push(bestIdx);
      groupStart = i;
    }
  }

  // ── 5. For each apex, find braking point and exit point ───────
  const corners: CornerSegment[] = [];

  for (let c = 0; c < mergedApexes.length; c++) {
    const apexLocal = mergedApexes[c];
    const apexGlobal = lapStart + apexLocal;
    const apexSpeed = speedKph[apexLocal];

    // Walk backward to find braking point
    let brakingLocal = apexLocal;
    if (longAccel) {
      for (let i = apexLocal - 1; i >= 0; i--) {
        const g = lapStart + i;
        if (g < 0 || g >= longAccel.length) break;
        const decelG = -longAccel[g] / 9.81; // Convert to positive braking G
        if (decelG >= BRAKING_G_THRESHOLD) {
          brakingLocal = i;
          // Keep walking back to find where braking actually started
          for (let j = i - 1; j >= 0; j--) {
            const g2 = lapStart + j;
            if (g2 < 0 || g2 >= longAccel.length) break;
            const d2 = -longAccel[g2] / 9.81;
            if (d2 < BRAKING_G_THRESHOLD * 0.3) { // Below 30% of threshold = braking hasn't started yet
              brakingLocal = j + 1;
              break;
            }
            brakingLocal = j;
          }
          break;
        }
        brakingLocal = i;
      }
    }

    // Walk forward to find exit point
    let exitLocal = apexLocal;
    const entrySpeed = speedKph[brakingLocal];

    for (let i = apexLocal + 1; i < lapLen; i++) {
      // Check throttle if available
      if (throttle) {
        const g = lapStart + i;
        if (g < throttle.length) {
          const t = throttle[g];
          // Auto-detect throttle scale (0-1 vs 0-100)
          const tNorm = t > 1.5 ? t / 100 : t;
          if (tNorm >= EXIT_THROTTLE_THRESHOLD) {
            exitLocal = i;
            break;
          }
        }
      }

      // Fallback: speed recovery
      if (speedKph[i] >= entrySpeed * EXIT_SPEED_RECOVERY_FRACTION) {
        exitLocal = i;
        break;
      }

      exitLocal = i;
    }

    // Prevent overlapping with next corner's braking zone
    if (c < mergedApexes.length - 1) {
      const nextApexLocal = mergedApexes[c + 1];
      const midpoint = Math.floor((apexLocal + nextApexLocal) / 2);
      if (exitLocal > midpoint) {
        exitLocal = midpoint;
      }
    }

    // ── Compute corner metrics ────────────────────────────────────
    const brakingGlobal = lapStart + brakingLocal;
    const exitGlobal = lapStart + exitLocal;

    // Direction from lateral acceleration at apex
    let direction: CornerDirection = 'right';
    if (latAccel) {
      const latG = latAccel[apexGlobal] ?? 0;
      direction = latG >= 0 ? 'right' : 'left';
    }

    // Peak lateral G through the corner
    let peakLatG = 0;
    let sumLatG = 0;
    let latCount = 0;
    if (latAccel) {
      for (let i = brakingLocal; i <= exitLocal; i++) {
        const g = lapStart + i;
        if (g < latAccel.length && Number.isFinite(latAccel[g])) {
          const absG = Math.abs(latAccel[g]) / 9.81;
          if (absG > peakLatG) peakLatG = absG;
          sumLatG += absG;
          latCount++;
        }
      }
    }
    const avgLatG = latCount > 0 ? sumLatG / latCount : 0;

    // Peak braking G
    let peakBrakeG = 0;
    if (longAccel) {
      for (let i = brakingLocal; i <= apexLocal; i++) {
        const g = lapStart + i;
        if (g < longAccel.length && Number.isFinite(longAccel[g])) {
          const brakeG = -longAccel[g] / 9.81;
          if (brakeG > peakBrakeG) peakBrakeG = brakeG;
        }
      }
    }

    // Duration
    const t0 = sessionTime[brakingGlobal] ?? 0;
    const t1 = sessionTime[exitGlobal] ?? 0;
    const durationSec = t1 - t0;

    // LapDistPct positions
    const distPctStart = lapDistPct[brakingGlobal] ?? 0;
    const distPctApex = lapDistPct[apexGlobal] ?? 0;
    const distPctEnd = lapDistPct[exitGlobal] ?? 0;

    // Exit speed
    const exitSpeed = speedKph[exitLocal] ?? 0;

    // Classify
    const radius = classifyRadius(apexSpeed);
    const speedClass = classifySpeedClass(apexSpeed);

    corners.push({
      id: `T${c + 1}`,
      number: c + 1,
      direction,
      radius,
      speedClass,
      brakingIdx: brakingGlobal,
      apexIdx: apexGlobal,
      exitIdx: exitGlobal,
      entrySpeedKph: entrySpeed,
      apexSpeedKph: apexSpeed,
      exitSpeedKph: exitSpeed,
      peakLatG,
      avgLatG,
      peakBrakeG,
      durationSec,
      distPctStart,
      distPctApex,
      distPctEnd,
    });
  }

  // ── 6. Build straight segments between corners ────────────────
  const straights = buildStraights(corners, lapStart, lapEnd, speedKph, lapDistPct, sessionTime);

  // ── 7. Classify track type ────────────────────────────────────
  const trackType = classifyTrack(corners);

  return {
    corners,
    straights,
    cornerCount: corners.length,
    trackType,
  };
}

// ─── Classification helpers ─────────────────────────────────────

function classifyRadius(apexSpeedKph: number): CornerRadius {
  if (apexSpeedKph < RADIUS_TIGHT_MAX_KPH) return 'tight';
  if (apexSpeedKph < RADIUS_MEDIUM_MAX_KPH) return 'medium';
  return 'fast';
}

function classifySpeedClass(apexSpeedKph: number): CornerSpeedClass {
  if (apexSpeedKph < SPEED_LOW_MAX_KPH) return 'low';
  if (apexSpeedKph < SPEED_MEDIUM_MAX_KPH) return 'medium';
  return 'high';
}

function classifyTrack(
  corners: CornerSegment[],
): 'technical' | 'mixed' | 'high-speed' | 'oval' {
  if (corners.length === 0) return 'oval';
  if (corners.length <= 4) return 'high-speed'; // Few corners = fast track

  const tightCount = corners.filter(c => c.radius === 'tight').length;
  const fastCount = corners.filter(c => c.radius === 'fast').length;
  const ratio = tightCount / corners.length;

  if (ratio > 0.5) return 'technical';
  if (fastCount / corners.length > 0.5) return 'high-speed';
  return 'mixed';
}

function buildStraights(
  corners: CornerSegment[],
  lapStart: number,
  lapEnd: number,
  speedKph: Float64Array,
  lapDistPct: Float64Array,
  sessionTime: Float64Array,
): StraightSegment[] {
  const straights: StraightSegment[] = [];
  let prevEnd = lapStart;

  for (let i = 0; i < corners.length; i++) {
    const cornerStart = corners[i].brakingIdx;
    if (cornerStart > prevEnd + 10) {
      const s = buildStraightSegment(
        `S${i + 1}`, prevEnd, cornerStart,
        speedKph, lapDistPct, sessionTime, lapStart,
      );
      if (s) straights.push(s);
    }
    prevEnd = corners[i].exitIdx;
  }

  // Final straight (after last corner to lap end)
  if (lapEnd > prevEnd + 10) {
    const s = buildStraightSegment(
      `S${corners.length + 1}`, prevEnd, lapEnd,
      speedKph, lapDistPct, sessionTime, lapStart,
    );
    if (s) straights.push(s);
  }

  return straights;
}

function buildStraightsOnly(
  lapStart: number,
  lapEnd: number,
  speedKph: Float64Array,
  lapDistPct: Float64Array,
  sessionTime: Float64Array,
): StraightSegment[] {
  const s = buildStraightSegment('S1', lapStart, lapEnd, speedKph, lapDistPct, sessionTime, lapStart);
  return s ? [s] : [];
}

function buildStraightSegment(
  id: string,
  startIdx: number,
  endIdx: number,
  speedKph: Float64Array,
  lapDistPct: Float64Array,
  sessionTime: Float64Array,
  lapStart: number,
): StraightSegment | null {
  let maxSpeed = 0;
  for (let i = startIdx - lapStart; i < endIdx - lapStart && i < speedKph.length; i++) {
    if (Number.isFinite(speedKph[i]) && speedKph[i] > maxSpeed) {
      maxSpeed = speedKph[i];
    }
  }

  const t0 = sessionTime[startIdx] ?? 0;
  const t1 = sessionTime[endIdx] ?? 0;

  return {
    id,
    startIdx,
    endIdx,
    maxSpeedKph: maxSpeed,
    distPctStart: lapDistPct[startIdx] ?? 0,
    distPctEnd: lapDistPct[endIdx] ?? 0,
    durationSec: t1 - t0,
  };
}
