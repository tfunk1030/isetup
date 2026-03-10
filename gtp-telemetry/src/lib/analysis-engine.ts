// ═══════════════════════════════════════════════════════════════
// ANALYSIS ENGINE — 14-item engineering checklist
// Port of sebring_analysis_v4.py logic + new analyses
// ═══════════════════════════════════════════════════════════════

import { speedToKph, accelToG, pressureToPSI, heightToMM } from './unit-conversions';
import { ANALYSIS, CHANNEL_UNITS, ENGINE_TEMP, RECOMMENDATION, SHOCK_VELOCITY, TYRE_TEMP } from './constants';
import type {
  IBTParsed,
  SessionAnalysis,
  SessionHeader,
  LapTime,
  LapData,
  TyreTempLap,
  TyrePressureLap,
  TyreWearLap,
  RideHeightSample,
  BottomingResult,
  BottomingEvent,
  ShockVelCorner,
  GForceSample,
  FuelData,
  DriverAid,
  ConditioningCorner,
  EngineTempsLap,
  RARBAnalysis,
  RARBSpeedBand,
  RARBLapChange,
  RARBChangeEvent,
  SplitterData,
  CarProfile,
  TrackProfile,
  Driver,
  ConfidenceLevel,
  ConstraintViolation,
  DataQualityReport,
  NormalizedSetup,
  SetupRecommendation,
  RecommendationSpecific,
  RecommendationSeverity,
  TelemetryReasoningSignal,
  TyreCornerTemp,
} from './types';
import { ANALYSIS_CHANNELS } from './types';
import { flattenSetup, getNormalizedParameter, normalizeSetup } from './setup-normalization';
import {
  SIM_CONSTRAINTS,
  getImpactRank,
  getTrackGuidance,
  getCarDeepKnowledge,
  getPhysicsVersionNote,
  isVisionTreadActive,
  getDamperSlopeRecommendation,
} from './domain-knowledge';

type Channels = Record<string, Float64Array | null>;

function loadChannels(parsed: IBTParsed): Channels {
  const ch: Channels = {};
  for (const name of ANALYSIS_CHANNELS) {
    ch[name] = parsed.readChannel(name);
  }
  return ch;
}

function findDriver(parsed: IBTParsed): Driver | null {
  const di = parsed.sessionInfo?.DriverInfo;
  const drivers = di?.Drivers || [];
  const carIdx = di?.DriverCarIdx;

  // First try: match by DriverCarIdx, excluding pace car
  for (const d of drivers) {
    if (d.CarIdx === carIdx && !d.CarIsPaceCar) return d;
  }
  // Fallback: first non-pace-car driver
  for (const d of drivers) {
    if (!d.CarIsPaceCar) return d;
  }
  return null;
}

function extractSessionHeader(parsed: IBTParsed, driver: Driver | null): SessionHeader {
  const wi = parsed.sessionInfo?.WeekendInfo || {};
  const carName = driver?.CarScreenName || '';
  const hasBrakeMig =
    carName.includes('Cadillac') || carName.includes('Porsche') || carName.includes('Ferrari');

  return {
    track: `${wi.TrackDisplayName || '?'} — ${wi.TrackConfigName || ''}`,
    car: carName || 'Unknown',
    driver: driver?.UserName || 'Unknown',
    airTemp: (wi.TrackAirTemp as string) || '?',
    trackTemp: (wi.TrackSurfaceTemp as string) || '?',
    duration: `${(parsed.recordCount / parsed.tickRate / 60).toFixed(1)} min`,
    samples: parsed.recordCount,
    hz: parsed.tickRate,
    channels: Object.keys(parsed.vars).length,
    hasBrakeMig,
    isBMW: carName.includes('BMW'),
    isFerrari: carName.includes('Ferrari'),
  };
}

function detectLaps(
  ch: Channels,
  recordCount: number,
  trackProfile?: TrackProfile,
  fallbackTrackLength?: string
): { laps: Record<number, LapData>; validLaps: number[] } {
  if (!ch.Lap || !ch.SessionTime || !ch.Speed) {
    return { laps: {}, validLaps: [] };
  }

  const spd = ch.Speed;
  const sessionTime = ch.SessionTime;
  const lapChannel = ch.Lap;
  const laps: Record<number, LapData> = {};

  for (let i = 0; i < recordCount; i++) {
    const lapRaw = lapChannel![i];
    if (!Number.isFinite(lapRaw)) continue;
    const l = Math.floor(lapRaw);
    if (l < 0) continue;

    const rawSpeed = speedToKph(spd![i]);
    const spdKph = Number.isFinite(rawSpeed) ? rawSpeed : 0;
    const lap = laps[l];
    if (!lap) {
      laps[l] = { start: i, end: i, duration: 0, maxSpeed: spdKph, count: 1 };
    } else {
      lap.end = i;
      lap.count++;
      if (spdKph > lap.maxSpeed) lap.maxSpeed = spdKph;
    }
  }

  for (const l in laps) {
    const lap = laps[l];
    const startT = sessionTime![lap.start];
    const endT = sessionTime![lap.end];
    lap.duration = Number.isFinite(startT) && Number.isFinite(endT) ? endT - startT : 0;
  }

  // Valid lap window
  let minLap: number, maxLap: number;
  if (trackProfile?.validLapWindow) {
    [minLap, maxLap] = trackProfile.validLapWindow;
  } else {
    const parsedTrackLen = parseFloat(fallbackTrackLength || '5.8');
    const trackLen = Number.isFinite(parsedTrackLen) ? parsedTrackLen : 5.8;
    minLap = trackLen > 10 ? 150 : trackLen > 3 ? 80 : 40;
    maxLap = trackLen > 10 ? 300 : trackLen > 3 ? 160 : 90;
  }

  const validLaps: number[] = [];
  for (const lapNumStr of Object.keys(laps)) {
    const lapNum = Number(lapNumStr);
    const lap = laps[lapNum];
    if (lap.duration > minLap && lap.duration < maxLap && lap.count > 100) {
      validLaps.push(lapNum);
    }
  }
  validLaps.sort((a, b) => a - b);

  return { laps, validLaps };
}

function firstFiniteInRange(arr: Float64Array, start: number, end: number): number | null {
  for (let i = start; i <= end; i++) {
    if (Number.isFinite(arr[i])) return arr[i];
  }
  return null;
}

function lastFiniteInRange(arr: Float64Array, start: number, end: number): number | null {
  for (let i = end; i >= start; i--) {
    if (Number.isFinite(arr[i])) return arr[i];
  }
  return null;
}

function avgInRange(arr: Float64Array, start: number, end: number): number {
  if (end < start) return 0;
  let sum = 0;
  let count = 0;
  for (let i = start; i <= end; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) continue;
    sum += v;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

function analyzeTyreTemps(
  ch: Channels,
  laps: Record<number, LapData>,
  validLaps: number[]
): TyreTempLap[] {
  return validLaps.map((l) => {
    const lap = laps[l];
    const lateStart = lap.start + Math.floor(lap.count / 2); // Last 50% for stability

    // CRITICAL: L/M/R to O/M/I mapping differs by side
    // Left tyres (LF, LR): tempL = Outer, tempM = Middle, tempR = Inner
    // Right tyres (RF, RR): tempR = Outer, tempM = Middle, tempL = Inner
    return {
      lap: l,
      LF: {
        O: ch.LFtempL ? avgInRange(ch.LFtempL, lateStart, lap.end) : 0,
        M: ch.LFtempM ? avgInRange(ch.LFtempM, lateStart, lap.end) : 0,
        I: ch.LFtempR ? avgInRange(ch.LFtempR, lateStart, lap.end) : 0,
      },
      RF: {
        O: ch.RFtempR ? avgInRange(ch.RFtempR, lateStart, lap.end) : 0,
        M: ch.RFtempM ? avgInRange(ch.RFtempM, lateStart, lap.end) : 0,
        I: ch.RFtempL ? avgInRange(ch.RFtempL, lateStart, lap.end) : 0,
      },
      LR: {
        O: ch.LRtempL ? avgInRange(ch.LRtempL, lateStart, lap.end) : 0,
        M: ch.LRtempM ? avgInRange(ch.LRtempM, lateStart, lap.end) : 0,
        I: ch.LRtempR ? avgInRange(ch.LRtempR, lateStart, lap.end) : 0,
      },
      RR: {
        O: ch.RRtempR ? avgInRange(ch.RRtempR, lateStart, lap.end) : 0,
        M: ch.RRtempM ? avgInRange(ch.RRtempM, lateStart, lap.end) : 0,
        I: ch.RRtempL ? avgInRange(ch.RRtempL, lateStart, lap.end) : 0,
      },
    };
  });
}

function analyzeTyrePressures(
  ch: Channels,
  laps: Record<number, LapData>,
  validLaps: number[]
): TyrePressureLap[] {
  return validLaps.map((l) => {
    const lap = laps[l];
    return {
      lap: l,
      LF: ch.LFpressure ? pressureToPSI(avgInRange(ch.LFpressure, lap.start, lap.end)) : 0,
      RF: ch.RFpressure ? pressureToPSI(avgInRange(ch.RFpressure, lap.start, lap.end)) : 0,
      LR: ch.LRpressure ? pressureToPSI(avgInRange(ch.LRpressure, lap.start, lap.end)) : 0,
      RR: ch.RRpressure ? pressureToPSI(avgInRange(ch.RRpressure, lap.start, lap.end)) : 0,
    };
  });
}

function analyzeTyreWear(
  ch: Channels,
  laps: Record<number, LapData>,
  validLaps: number[]
): TyreWearLap[] {
  const wearChannels = ['LFwearL', 'LFwearM', 'LFwearR', 'RFwearL', 'RFwearM', 'RFwearR',
    'LRwearL', 'LRwearM', 'LRwearR', 'RRwearL', 'RRwearM', 'RRwearR'];

  const hasWear = wearChannels.some((name) => ch[name] != null);
  if (!hasWear) return [];

  return validLaps.map((l) => {
    const lastIdx = laps[l].end;

    const getWear = (name: string) => ch[name] ? ch[name]![lastIdx] * 100 : 100;

    const corners = {
      LF: { L: getWear('LFwearL'), M: getWear('LFwearM'), R: getWear('LFwearR'), avg: 0 },
      RF: { L: getWear('RFwearL'), M: getWear('RFwearM'), R: getWear('RFwearR'), avg: 0 },
      LR: { L: getWear('LRwearL'), M: getWear('LRwearM'), R: getWear('LRwearR'), avg: 0 },
      RR: { L: getWear('RRwearL'), M: getWear('RRwearM'), R: getWear('RRwearR'), avg: 0 },
    };

    for (const corner of Object.values(corners)) {
      corner.avg = (corner.L + corner.M + corner.R) / 3;
    }

    return { lap: l, ...corners };
  });
}

function analyzeRideHeights(
  ch: Channels,
  recordCount: number,
  hiSpeedMask: Uint8Array
): RideHeightSample[] {
  if (!ch.LFrideHeight || !ch.RFrideHeight || !ch.LRrideHeight || !ch.RRrideHeight || !ch.LapDistPct) {
    return [];
  }

  const data: RideHeightSample[] = [];
  for (let i = 0; i < recordCount; i++) {
    if (hiSpeedMask[i] && i % 3 === 0) {
      const pct = ch.LapDistPct![i] * 100;
      const lf = heightToMM(ch.LFrideHeight![i]);
      const rf = heightToMM(ch.RFrideHeight![i]);
      const lr = heightToMM(ch.LRrideHeight![i]);
      const rr = heightToMM(ch.RRrideHeight![i]);
      const speed = speedToKph(ch.Speed![i]);
      if (![pct, lf, rf, lr, rr, speed].every(Number.isFinite)) continue;
      data.push({
        pct,
        LF: lf,
        RF: rf,
        LR: lr,
        RR: rr,
        speed,
      });
    }
  }
  return data;
}

function analyzeBottoming(
  ch: Channels,
  recordCount: number,
  hiSpeedMask: Uint8Array,
  trackProfile?: TrackProfile
): BottomingResult {
  let clean = 0;
  let kerb = 0;
  const byLocation: BottomingEvent[] = [];

  // Use track-specific kerb zones or empty array
  const kerbZones: [number, number][] = trackProfile?.kerbZones || [];

  if (!ch.LFrideHeight || !ch.RFrideHeight || !ch.LRrideHeight || !ch.RRrideHeight || !ch.LapDistPct) {
    return { clean: 0, kerb: 0, byLocation: [] };
  }

  for (let i = 0; i < recordCount; i++) {
    if (!hiSpeedMask[i]) continue;

    const lf = ch.LFrideHeight![i];
    const rf = ch.RFrideHeight![i];
    const lr = ch.LRrideHeight![i];
    const rr = ch.RRrideHeight![i];
    if (![lf, rf, lr, rr].every(Number.isFinite)) continue;

    let worstCorner = 'LF';
    let minRH = lf;
    if (rf < minRH) {
      minRH = rf;
      worstCorner = 'RF';
    }
    if (lr < minRH) {
      minRH = lr;
      worstCorner = 'LR';
    }
    if (rr < minRH) {
      minRH = rr;
      worstCorner = 'RR';
    }

    const minRHmm = minRH * 1000;
    if (minRHmm <= ANALYSIS.BOTTOMING_THRESHOLD_MM) {
      const pct = ch.LapDistPct![i] * 100;
      if (!Number.isFinite(pct)) continue;
      const isKerb = kerbZones.some(([a, b]) => pct >= a && pct <= b);

      if (isKerb) kerb++;
      else clean++;

      // Track first 100 events for location display
      if (byLocation.length < 100) {
        byLocation.push({ pct, corner: worstCorner, rideHeight: minRHmm });
      }
    }
  }

  return { clean, kerb, byLocation };
}

function analyzeShockVelocities(
  ch: Channels,
  recordCount: number,
  hiSpeedMask: Uint8Array,
  tickRate: number
): Record<string, ShockVelCorner> {
  const dt = 1 / tickRate;
  const stats: Record<string, ShockVelCorner> = {};

  for (const corner of ['LF', 'RF', 'LR', 'RR']) {
    const chName = `${corner}shockDefl`;
    if (!ch[chName]) continue;

    const vels: number[] = [];
    for (let i = 1; i < recordCount; i++) {
      if (!hiSpeedMask[i]) continue;
      const now = ch[chName]![i];
      const prev = ch[chName]![i - 1];
      if (!Number.isFinite(now) || !Number.isFinite(prev)) continue;
      vels.push(Math.abs((now - prev) * 1000 / dt));
    }

    vels.sort((a, b) => a - b);
    stats[corner] = {
      p95: vels[Math.floor(vels.length * 0.95)] || 0,
      p99: vels[Math.floor(vels.length * 0.99)] || 0,
      peak: vels[vels.length - 1] || 0,
    };
  }

  return stats;
}

function analyzeGForce(
  ch: Channels,
  recordCount: number,
  validMask: Uint8Array
): { data: GForceSample[]; peakLat: number; peakBrake: number; peakAccel: number } {
  if (!ch.LatAccel || !ch.LongAccel) {
    return { data: [], peakLat: 0, peakBrake: 0, peakAccel: 0 };
  }

  const data: GForceSample[] = [];
  let peakLat = 0;
  let peakBrake = 0;
  let peakAccel = 0;

  for (let i = 0; i < recordCount; i += 6) {
    if (!validMask[i]) continue;
    const rawLat = ch.LatAccel![i];
    const rawLong = ch.LongAccel![i];
    if (!Number.isFinite(rawLat) || !Number.isFinite(rawLong)) continue;
    const lat = accelToG(rawLat);
    const long = accelToG(rawLong);
    if (!Number.isFinite(lat) || !Number.isFinite(long)) continue;
    data.push({ lat, long });

    const absLat = Math.abs(lat);
    if (absLat > peakLat) peakLat = absLat;
    if (long < peakBrake) peakBrake = long;
    if (long > peakAccel) peakAccel = long;
  }

  return { data, peakLat, peakBrake, peakAccel };
}

function analyzeFuel(
  ch: Channels,
  laps: Record<number, LapData>,
  validLaps: number[]
): FuelData {
  if (!ch.FuelLevel || validLaps.length === 0) {
    return { start: 0, end: 0, perLap: 0, range: 0 };
  }

  const firstLap = laps[validLaps[0]];
  const lastLap = laps[validLaps[validLaps.length - 1]];
  const start = firstFiniteInRange(ch.FuelLevel, firstLap.start, firstLap.end);
  const end = lastFiniteInRange(ch.FuelLevel, lastLap.start, lastLap.end);
  if (start == null || end == null) {
    return { start: 0, end: 0, perLap: 0, range: 0 };
  }
  const perLap = validLaps.length > 0 ? (start - end) / validLaps.length : 0;

  return {
    start,
    end,
    perLap,
    range: perLap > 0 ? end / perLap : 0,
  };
}

function analyzeDriverAids(
  ch: Channels,
  recordCount: number,
  validMask: Uint8Array
): Record<string, DriverAid> {
  const aids: Record<string, DriverAid> = {};
  const aidChannels: [string, string][] = [
    ['Brake Bias', 'dcBrakeBias'],
    ['TC1', 'dcTractionControl'],
    ['TC2', 'dcTractionControl2'],
    ['ABS', 'dcABS'],
    ['FARB', 'dcAntiRollFront'],
    ['RARB', 'dcAntiRollRear'],
  ];

  const stats = aidChannels
    .filter(([, key]) => !!ch[key])
    .map(([name, key]) => ({
      name,
      key,
      min: Infinity,
      max: -Infinity,
      sum: 0,
      cnt: 0,
    }));

  for (let i = 0; i < recordCount; i++) {
    if (!validMask[i]) continue;
    for (const s of stats) {
      const v = ch[s.key]![i];
      if (!Number.isFinite(v)) continue;
      if (v < s.min) s.min = v;
      if (v > s.max) s.max = v;
      s.sum += v;
      s.cnt++;
    }
  }

  for (const s of stats) {
    if (s.cnt > 0) {
      aids[s.name] = {
        avg: s.sum / s.cnt,
        min: s.min,
        max: s.max,
        constant: s.max - s.min < ANALYSIS.CONDITIONING_CONSTANT_THRESHOLD,
      };
    }
  }

  return aids;
}

function analyzeConditioning(
  ch: Channels,
  laps: Record<number, LapData>,
  validLaps: number[]
): Record<string, ConditioningCorner> | null {
  if (validLaps.length < 2) return null;

  const fl = validLaps[0];
  const ll = validLaps[validLaps.length - 1];
  const corners: Record<string, ConditioningCorner> = {};

  // Same L/M/R to O/M/I mapping as tyre temps
  const cornerChannels: [string, string, string, string][] = [
    ['LF', 'LFtempL', 'LFtempM', 'LFtempR'],
    ['RF', 'RFtempR', 'RFtempM', 'RFtempL'],
    ['LR', 'LRtempL', 'LRtempM', 'LRtempR'],
    ['RR', 'RRtempR', 'RRtempM', 'RRtempL'],
  ];

  const firstLapData = laps[fl];
  const lastLapData = laps[ll];
  const firstLateStart = firstLapData.start + Math.floor(firstLapData.count / 2);
  const lastLateStart = lastLapData.start + Math.floor(lastLapData.count / 2);

  for (const [corner, tempO, tempM, tempI] of cornerChannels) {
    const channels = [tempO, tempM, tempI];
    let avgF = 0;
    let avgL = 0;
    let validChannels = 0;

    for (const c of channels) {
      if (!ch[c]) continue;
      avgF += avgInRange(ch[c]!, firstLateStart, firstLapData.end);
      avgL += avgInRange(ch[c]!, lastLateStart, lastLapData.end);
      validChannels++;
    }

    if (validChannels > 0) {
      avgF /= validChannels;
      avgL /= validChannels;
    }

    const rate = (avgL - avgF) / (validLaps.length - 1);
    corners[corner] = {
      first: avgF,
      last: avgL,
      rate,
      lapsTo85: rate > 0 ? Math.max(0, Math.ceil((ANALYSIS.CONDITIONING_TARGET_TEMP - avgL) / rate)) : 99,
    };
  }

  return corners;
}

function analyzeEngineTemps(
  ch: Channels,
  laps: Record<number, LapData>,
  validLaps: number[]
): EngineTempsLap[] {
  if (!ch.WaterTemp && !ch.OilTemp) return [];

  return validLaps.map((l) => {
    const lap = laps[l];
    return {
      lap: l,
      waterTemp: ch.WaterTemp ? avgInRange(ch.WaterTemp, lap.start, lap.end) : 0,
      oilTemp: ch.OilTemp ? avgInRange(ch.OilTemp, lap.start, lap.end) : 0,
    };
  });
}

function analyzeRARB(
  ch: Channels,
  laps: Record<number, LapData>,
  validLaps: number[],
  recordCount: number,
  validMask: Uint8Array,
  bestLapIdx: number
): RARBAnalysis | null {
  if (!ch.dcAntiRollRear || !ch.Speed) return null;

  // Speed-band correlation
  const bands: { range: string; min: number; max: number }[] = [
    { range: '0-80 km/h', min: 0, max: 80 },
    { range: '80-150 km/h', min: 80, max: 150 },
    { range: '150-220 km/h', min: 150, max: 220 },
    { range: '220-300 km/h', min: 220, max: 300 },
  ];

  const bandStats = bands.map(() => ({ sum: 0, min: Infinity, max: -Infinity, count: 0 }));
  for (let i = 0; i < recordCount; i++) {
    if (!validMask[i]) continue;
    const spdKph = speedToKph(ch.Speed![i]);
    const value = ch.dcAntiRollRear![i];
    if (!Number.isFinite(spdKph) || !Number.isFinite(value)) continue;

    let bandIdx = -1;
    for (let b = 0; b < bands.length; b++) {
      if (spdKph >= bands[b].min && spdKph < bands[b].max) {
        bandIdx = b;
        break;
      }
    }
    if (bandIdx === -1) continue;

    const s = bandStats[bandIdx];
    s.sum += value;
    s.count++;
    if (value < s.min) s.min = value;
    if (value > s.max) s.max = value;
  }

  const speedBands: RARBSpeedBand[] = bands.map(({ range }, idx) => {
    const s = bandStats[idx];
    if (s.count === 0) {
      return { range, avgValue: 0, minValue: 0, maxValue: 0, sampleCount: 0 };
    }
    return {
      range,
      avgValue: s.sum / s.count,
      minValue: s.min,
      maxValue: s.max,
      sampleCount: s.count,
    };
  });

  // Per-lap change counting
  const perLapChanges: RARBLapChange[] = validLaps.map((l) => {
    let changes = 0;
    const lap = laps[l];
    for (let i = lap.start + 1; i <= lap.end; i++) {
      const now = ch.dcAntiRollRear![i];
      const prev = ch.dcAntiRollRear![i - 1];
      if (!Number.isFinite(now) || !Number.isFinite(prev)) continue;
      if (Math.abs(now - prev) > ANALYSIS.RARB_CHANGE_DELTA) {
        changes++;
      }
    }
    return { lap: l, changeCount: changes };
  });

  // Best-lap RARB change log
  const bestLapLog: RARBChangeEvent[] = [];
  if (laps[bestLapIdx]) {
    const lap = laps[bestLapIdx];
    for (let i = lap.start + 1; i <= lap.end; i++) {
      const from = ch.dcAntiRollRear![i - 1];
      const to = ch.dcAntiRollRear![i];
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
      if (Math.abs(to - from) > ANALYSIS.RARB_CHANGE_DELTA) {
        const pct = ch.LapDistPct ? ch.LapDistPct[i] * 100 : 0;
        const speed = speedToKph(ch.Speed![i]);
        if (!Number.isFinite(pct) || !Number.isFinite(speed)) continue;
        bestLapLog.push({
          pct,
          speed,
          fromValue: from,
          toValue: to,
        });
      }
    }
  }

  return { speedBands, perLapChanges, bestLapLog, available: true };
}

function analyzeSplitter(
  ch: Channels,
  recordCount: number,
  hiSpeedMask: Uint8Array
): SplitterData | null {
  if (!ch.CFSRrideHeight || !ch.LapDistPct) return null;

  const samples: { pct: number; height: number; speed: number }[] = [];
  let minHeight = Infinity;
  let sumHeight = 0;
  let count = 0;
  let bottomingCount = 0;

  for (let i = 0; i < recordCount; i++) {
    if (!hiSpeedMask[i]) continue;
    const h = heightToMM(ch.CFSRrideHeight![i]);
    if (!Number.isFinite(h)) continue;

    if (h < minHeight) minHeight = h;
    sumHeight += h;
    count++;
    if (h <= 0) bottomingCount++;

    if (i % 3 === 0) {
      const pct = ch.LapDistPct![i] * 100;
      const speed = speedToKph(ch.Speed![i]);
      if (!Number.isFinite(pct) || !Number.isFinite(speed)) continue;
      samples.push({
        pct,
        height: h,
        speed,
      });
    }
  }

  return {
    samples,
    minHeight: count > 0 ? minHeight : 0,
    avgHeight: count > 0 ? sumHeight / count : 0,
    bottomingCount,
  };
}

const CRITICAL_CHANNELS: readonly string[] = ['SessionTime', 'Lap', 'LapDistPct', 'Speed'];

function pickSeverity(warn: boolean, critical: boolean): RecommendationSeverity {
  if (critical) return 'CRITICAL';
  if (warn) return 'WARNING';
  return 'INFO';
}

function toConfidence(score: number): ConfidenceLevel {
  if (score >= 80) return 'HIGH';
  if (score >= 55) return 'MEDIUM';
  return 'LOW';
}

function buildDataQualityReport(
  parsed: IBTParsed,
  validLaps: number[],
  parserWarnings: string[]
): DataQualityReport {
  const criticalMissingChannels = CRITICAL_CHANNELS.filter((name) => !parsed.vars[name]);
  const optionalMissingChannels = ANALYSIS_CHANNELS.filter((name) => !parsed.vars[name] && !CRITICAL_CHANNELS.includes(name));
  const unitMismatches: string[] = [];

  for (const [channel, expectedUnit] of Object.entries(CHANNEL_UNITS)) {
    const actual = parsed.vars[channel]?.unit;
    if (!actual) continue;
    const normalizedActual = actual.toLowerCase();
    const normalizedExpected = expectedUnit.toLowerCase();
    if (!normalizedActual.includes(normalizedExpected)) {
      unitMismatches.push(`${channel}: expected "${expectedUnit}", got "${actual}"`);
    }
  }

  let score = 100;
  score -= criticalMissingChannels.length * 35;
  score -= optionalMissingChannels.length * 2;
  score -= unitMismatches.length * 5;
  score -= parserWarnings.length * 4;

  if (validLaps.length <= RECOMMENDATION.LOW_VALID_LAP_CRITICAL) score -= 30;
  else if (validLaps.length <= RECOMMENDATION.LOW_VALID_LAP_WARN) score -= 12;

  const confidence = toConfidence(Math.max(0, Math.min(100, score)));
  const sectionConfidence: Record<string, ConfidenceLevel> = {
    tyres: confidence,
    platform: confidence,
    dynamics: confidence,
    setup: confidence,
  };

  if (optionalMissingChannels.some((c) => c.includes('temp') || c.includes('pressure') || c.includes('wear'))) {
    sectionConfidence.tyres = 'LOW';
  }
  if (optionalMissingChannels.some((c) => c.includes('rideHeight') || c.includes('shock'))) {
    sectionConfidence.platform = 'LOW';
  }
  if (optionalMissingChannels.some((c) => c.includes('Accel') || c.includes('Steering'))) {
    sectionConfidence.dynamics = 'LOW';
  }
  if (optionalMissingChannels.some((c) => c.startsWith('dc'))) {
    sectionConfidence.setup = 'LOW';
  }

  const notes: string[] = [];
  if (validLaps.length <= RECOMMENDATION.LOW_VALID_LAP_WARN) {
    notes.push(`Limited sample size (${validLaps.length} valid laps).`);
  }
  if (optionalMissingChannels.length >= RECOMMENDATION.OPTIONAL_CHANNEL_MISSING_WARN) {
    notes.push(`Telemetry coverage reduced (${optionalMissingChannels.length} optional channels unavailable).`);
  }
  if (unitMismatches.length > 0) {
    notes.push('Detected channel unit mismatches. Conversion assumptions may be degraded.');
  }

  return {
    criticalMissingChannels,
    optionalMissingChannels,
    parserWarnings,
    unitMismatches,
    validLapCount: validLaps.length,
    confidence,
    sectionConfidence,
    notes,
  };
}

function averageTyreCorner(temp: TyreCornerTemp): number {
  return (temp.O + temp.M + temp.I) / 3;
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function formatNumeric(value: number, unit?: string, digits = 1): string {
  return `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}

function buildNumericSpecific(
  parameter: string,
  currentValue: number,
  targetValue: number,
  unit: string,
  digits = 1
): RecommendationSpecific {
  const deltaValue = targetValue - currentValue;
  return {
    parameter,
    current: formatNumeric(currentValue, unit, digits),
    target: formatNumeric(targetValue, unit, digits),
    delta: `${deltaValue > 0 ? '+' : ''}${deltaValue.toFixed(digits)} ${unit}`.trim(),
  };
}

function buildTelemetryReasoning(args: {
  carProfile?: CarProfile;
  tyreTempData: TyreTempLap[];
  tyreWearData: TyreWearLap[];
  bottoming: BottomingResult;
  shockVelStats: Record<string, ShockVelCorner>;
  aids: Record<string, DriverAid>;
  splitter: SplitterData | null;
  rideHeightData: RideHeightSample[];
  dataQuality: DataQualityReport;
}): TelemetryReasoningSignal[] {
  const {
    carProfile,
    tyreTempData,
    tyreWearData,
    bottoming,
    shockVelStats,
    aids,
    splitter,
    rideHeightData,
    dataQuality,
  } = args;
  const signals: TelemetryReasoningSignal[] = [];
  const lastTemps = tyreTempData[tyreTempData.length - 1];
  const lastWear = tyreWearData[tyreWearData.length - 1];

  if (lastTemps) {
    const frontAvg = (averageTyreCorner(lastTemps.LF) + averageTyreCorner(lastTemps.RF)) / 2;
    const rearAvg = (averageTyreCorner(lastTemps.LR) + averageTyreCorner(lastTemps.RR)) / 2;
    const axleDelta = frontAvg - rearAvg;
    const midDirection = axleDelta >= 6
      ? 'understeer-risk'
      : axleDelta <= -6
        ? 'oversteer-risk'
        : 'stable';
    const midSummary = midDirection === 'understeer-risk'
      ? 'Front axle is carrying materially more tyre load than the rear, pointing to mid-corner understeer risk.'
      : midDirection === 'oversteer-risk'
        ? 'Rear axle is carrying materially more tyre load than the front, pointing to mid-corner oversteer risk.'
        : 'Front/rear tyre loading is broadly balanced through the lap.';
    signals.push({
      id: 'mid-corner-balance',
      phase: 'mid',
      summary: midSummary,
      direction: midDirection,
      confidence: dataQuality.sectionConfidence.tyres,
      evidence: [
        `Front axle avg surface temp: ${frontAvg.toFixed(1)}°C`,
        `Rear axle avg surface temp: ${rearAvg.toFixed(1)}°C`,
        `Front-rear delta: ${axleDelta > 0 ? '+' : ''}${axleDelta.toFixed(1)}°C`,
      ],
      candidateParameterKeys: ['suspension.frontArbBlades', 'suspension.rearArbBlades', 'diff.rearPreload'],
    });

    const brakeBias = aids['Brake Bias'];
    if (brakeBias && carProfile) {
      const biasDelta = brakeBias.avg - carProfile.defaultBrakeBias;
      const entryDirection = biasDelta >= 1.0 && axleDelta >= 4
        ? 'understeer-risk'
        : biasDelta <= -1.0 && axleDelta <= -4
          ? 'oversteer-risk'
          : 'stable';
      const entrySummary = entryDirection === 'understeer-risk'
        ? 'Entry balance is front-limited: brake bias is forward of baseline while the fronts are working hotter than the rears.'
        : entryDirection === 'oversteer-risk'
          ? 'Entry balance is rear-limited: brake bias is rearward of baseline while the rear axle is running hotter.'
          : 'Brake-balance evidence does not show a strong entry-phase imbalance.';
      signals.push({
        id: 'entry-balance',
        phase: 'entry',
        summary: entrySummary,
        direction: entryDirection,
        confidence: dataQuality.sectionConfidence.setup,
        evidence: [
          `Observed brake bias: ${brakeBias.avg.toFixed(1)}%`,
          `Car baseline brake bias: ${carProfile.defaultBrakeBias.toFixed(1)}%`,
          `Bias delta: ${biasDelta > 0 ? '+' : ''}${biasDelta.toFixed(1)}%`,
        ],
        candidateParameterKeys: ['brakes.bias', 'suspension.frontArbBlades', 'platform.frontHeavePerch'],
      });
    }
  }

  const tc1 = aids.TC1;
  const tc2 = aids.TC2;
  if (lastWear) {
    const frontWear = (lastWear.LF.avg + lastWear.RF.avg) / 2;
    const rearWear = (lastWear.LR.avg + lastWear.RR.avg) / 2;
    const rearWearLoss = frontWear - rearWear;
    const activeTc = (tc1 && !tc1.constant) || (tc2 && !tc2.constant);
    const exitDirection = rearWearLoss >= 3 || activeTc ? 'traction-risk' : 'stable';
    signals.push({
      id: 'exit-traction',
      phase: 'exit',
      summary: exitDirection === 'traction-risk'
        ? 'Rear tyres are doing disproportionate work on exit, with either TC activity or accelerated rear wear indicating traction-limited balance.'
        : 'Rear tyre wear and TC activity do not show a strong exit-traction issue.',
      direction: exitDirection,
      confidence: dataQuality.sectionConfidence.tyres,
      evidence: [
        `Front tread remaining avg: ${frontWear.toFixed(1)}%`,
        `Rear tread remaining avg: ${rearWear.toFixed(1)}%`,
        ...(tc1 ? [`TC1 range: ${tc1.min.toFixed(1)}-${tc1.max.toFixed(1)}`] : []),
        ...(tc2 ? [`TC2 range: ${tc2.min.toFixed(1)}-${tc2.max.toFixed(1)}`] : []),
      ],
      candidateParameterKeys: ['diff.rearPreload', 'suspension.rearArbBlades', 'alignment.rearCamber'],
    });
  }

  const rideHeightSigma = rideHeightData.length > 0
    ? stdDev(rideHeightData.map((sample) => (sample.LF + sample.RF) / 2))
    : 0;
  const maxShockPeak = Object.values(shockVelStats).reduce((peak, stats) => Math.max(peak, stats.peak), 0);
  const platformRisk = bottoming.clean >= RECOMMENDATION.PLATFORM_CLEAN_BOTTOMING_WARN
    || (splitter?.minHeight ?? 999) <= RECOMMENDATION.SPLITTER_MIN_HEIGHT_WARN_MM
    || maxShockPeak >= RECOMMENDATION.SHOCK_PEAK_WARN_MM_S
    || rideHeightSigma >= 4.5;
  signals.push({
    id: 'platform-stability',
    phase: 'platform',
    summary: platformRisk
      ? 'High-speed platform support is marginal: the floor is getting too close to the track or the dampers are seeing large spikes.'
      : 'High-speed ride-height control looks stable in the available dataset.',
    direction: platformRisk ? 'bottoming-risk' : 'stable',
    confidence: dataQuality.sectionConfidence.platform,
    evidence: [
      `Clean bottoming events: ${bottoming.clean}`,
      ...(splitter ? [`Min splitter height: ${splitter.minHeight.toFixed(1)} mm`] : []),
      `Front ride-height sigma at speed: ${rideHeightSigma.toFixed(1)} mm`,
      `Peak shock velocity: ${maxShockPeak.toFixed(0)} mm/s`,
    ],
    candidateParameterKeys: ['platform.frontHeavePerch', 'platform.frontPushrod', 'dampers.RF.hsComp'],
  });

  if (lastTemps) {
    for (const corner of ['LF', 'RF', 'LR', 'RR'] as const) {
      const temp = lastTemps[corner];
      const spread = Math.abs(temp.I - temp.O);
      const crownDelta = temp.M - (temp.O + temp.I) / 2;
      if (spread < RECOMMENDATION.TYRE_TEMP_SPREAD_WARN_C && Math.abs(crownDelta) < RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C) {
        continue;
      }
      signals.push({
        id: `tyre-shape-${corner.toLowerCase()}`,
        phase: 'tyres',
        summary: `${corner} contact patch is imbalanced, so pressure/camber recommendations should be treated as tyre-shape corrections rather than pure temperature management.`,
        direction: 'temperature-risk',
        confidence: dataQuality.sectionConfidence.tyres,
        evidence: [
          `${corner} outer/mid/inner: ${temp.O.toFixed(1)} / ${temp.M.toFixed(1)} / ${temp.I.toFixed(1)}°C`,
          `${corner} inner-outer spread: ${spread.toFixed(1)}°C`,
          `${corner} center delta: ${crownDelta > 0 ? '+' : ''}${crownDelta.toFixed(1)}°C`,
        ],
        candidateParameterKeys: [`tyres.${corner}.startingPressure`, corner.includes('F') ? 'alignment.frontCamber' : 'alignment.rearCamber'],
      });
    }
  }

  return signals;
}

function buildParameterSpecific(
  parameter: ReturnType<typeof getNormalizedParameter>,
  targetValue: number,
  digits = 1
): RecommendationSpecific[] {
  if (!parameter || parameter.valueType !== 'number' || parameter.numericValue == null || !parameter.unit) {
    return [];
  }
  return [buildNumericSpecific(parameter.displayName, parameter.numericValue, targetValue, parameter.unit, digits)];
}

function formatAidsContext(carProfile?: CarProfile): string {
  if (!carProfile) return 'Aids';
  return carProfile.arbValueType === 'indexed'
    ? 'Aids (indexed scale)'
    : 'Aids (descriptive scale)';
}

type DraftRecommendation = Omit<SetupRecommendation, 'priority'>;

function severityWeight(severity: RecommendationSeverity): number {
  if (severity === 'CRITICAL') return 0;
  if (severity === 'WARNING') return 1;
  return 2;
}

function recommendationPriority(rec: DraftRecommendation): number {
  // Use impact hierarchy if we have a parameterKey
  if (rec.parameterKey) {
    const rank = getImpactRank(rec.parameterKey);
    if (rank < 99) return rank;
  }
  // Fallback to category-based priority
  const byCategory: Record<DraftRecommendation['category'], number> = {
    AERO: 2,
    PLATFORM: 1,
    DYNAMICS: 4,
    TYRES: 7,
    BRAKES: 5,
    AIDS: 5,
    POWERTRAIN: 8,
    TRACK: 9,
  };
  const bySeverity: Record<DraftRecommendation['severity'], number> = {
    CRITICAL: 1,
    WARNING: 3,
    INFO: 6,
  };

  return Math.min(byCategory[rec.category], bySeverity[rec.severity]);
}

function finalizeRecommendations(recommendations: DraftRecommendation[]): SetupRecommendation[] {
  if (recommendations.length === 0) {
    return [{
      id: 'all-clear',
      category: 'TRACK',
      priority: 10,
      title: 'No major setup risks detected',
      action: 'Current telemetry appears stable. Continue validating across longer stints and changing track conditions.',
      rationale: 'No high-priority anomalies were detected in the available dataset.',
      confidence: 'MEDIUM',
      severity: 'INFO',
      evidence: ['Recommendation engine found no actionable high-risk triggers.'],
    }];
  }

  const withPriority = recommendations.map((rec) => ({
    ...rec,
    priority: recommendationPriority(rec),
  }));

  withPriority.sort((a, b) => {
    const bySeverity = severityWeight(a.severity) - severityWeight(b.severity);
    if (bySeverity !== 0) return bySeverity;
    const byPriority = a.priority - b.priority;
    if (byPriority !== 0) return byPriority;
    return a.title.localeCompare(b.title);
  });

  return withPriority.slice(0, 15);
}

// ── Constraint Validation (domain knowledge) ──────────────────

function validateConstraints(
  normalizedSetup: NormalizedSetup,
  carProfile?: CarProfile,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const constraint of SIM_CONSTRAINTS) {
    if (constraint.affectedCars !== 'all' && carProfile && !constraint.affectedCars.includes(carProfile.id)) {
      continue;
    }

    if (constraint.id === 'front-rh-floor') {
      // Check if any recommendation would suggest raising front RH (impossible)
      // This is more of an awareness constraint — the violation is informational
      const frontRH = getNormalizedParameter(normalizedSetup, 'platform.frontPushrod');
      if (frontRH) {
        // Front RH at 30mm is the baseline — no violation per se, but note it
        // Only generate violation if setup somehow has front RH below 30mm
      }
    }

    if (constraint.id === 'min-cold-pressure') {
      for (const corner of ['LF', 'RF', 'LR', 'RR'] as const) {
        const pressure = getNormalizedParameter(normalizedSetup, `tyres.${corner}.startingPressure`);
        if (pressure?.valueType === 'number' && pressure.numericValue != null) {
          if (pressure.numericValue <= constraint.limit) {
            // At or below minimum — note this as a constraint awareness (not a violation since they can't go lower)
            violations.push({
              constraintId: constraint.id,
              description: `${corner} cold pressure at sim minimum (${constraint.limit} kPa). Hot pressures will overshoot 20-24 PSI target.`,
              parameter: `${corner} starting pressure`,
              currentValue: pressure.numericValue,
              limit: constraint.limit,
              unit: constraint.unit,
              severity: 'INFO',
              workaround: constraint.workaround,
            });
            break; // Only warn once for pressure constraint
          }
        }
      }
    }
  }

  return violations;
}

function buildRecommendations(args: {
  carProfile?: CarProfile;
  trackProfile?: TrackProfile;
  normalizedSetup: NormalizedSetup;
  telemetryReasoning: TelemetryReasoningSignal[];
  tyreTempData: TyreTempLap[];
  tyrePressureData: TyrePressureLap[];
  tyreWearData: TyreWearLap[];
  engineTemps: EngineTempsLap[];
  bottoming: BottomingResult;
  shockVelStats: Record<string, ShockVelCorner>;
  aids: Record<string, DriverAid>;
  splitter: SplitterData | null;
  rarb: RARBAnalysis | null;
  rideHeightData: RideHeightSample[];
  dataQuality: DataQualityReport;
  validLapCount: number;
  conditioning: Record<string, ConditioningCorner> | null;
}): SetupRecommendation[] {
  const recommendations: DraftRecommendation[] = [];
  const {
    carProfile,
    trackProfile,
    normalizedSetup,
    telemetryReasoning,
    tyreTempData,
    tyrePressureData,
    tyreWearData,
    engineTemps,
    bottoming,
    shockVelStats,
    aids,
    splitter,
    rarb,
    rideHeightData,
    dataQuality,
    validLapCount,
    conditioning,
  } = args;

  const cleanBottoming = bottoming.clean;
  if (cleanBottoming >= RECOMMENDATION.PLATFORM_CLEAN_BOTTOMING_WARN) {
    const critical = cleanBottoming >= RECOMMENDATION.PLATFORM_CLEAN_BOTTOMING_CRITICAL;
    const avgFrontRH = rideHeightData.length > 0
      ? rideHeightData.reduce((s, r) => s + (r.LF + r.RF) / 2, 0) / rideHeightData.length
      : null;
    const frontHeavePerch = getNormalizedParameter(normalizedSetup, 'platform.frontHeavePerch');
    const deltaRH = critical ? 2 : 1.5;
    const targetRH = avgFrontRH != null ? avgFrontRH + deltaRH : null;
    const exactHeaveTarget = frontHeavePerch?.valueType === 'number' && frontHeavePerch.numericValue != null
      ? frontHeavePerch.numericValue - deltaRH
      : null;
    const specifics: RecommendationSpecific[] = exactHeaveTarget != null
      ? buildParameterSpecific(frontHeavePerch, exactHeaveTarget)
      : avgFrontRH != null
        ? [{ parameter: 'Front ride height at speed', current: `${avgFrontRH.toFixed(1)} mm`, target: `~${targetRH!.toFixed(1)} mm`, delta: `+${deltaRH.toFixed(1)} mm` }]
        : [];
    recommendations.push({
      id: 'platform-bottoming',
      category: 'PLATFORM',
      title: 'Reduce clean-track bottoming',
      action: exactHeaveTarget != null && frontHeavePerch
        ? `Reduce ${frontHeavePerch.displayName} from ${frontHeavePerch.displayValue} to ${formatNumeric(exactHeaveTarget, frontHeavePerch.unit)} to add front platform preload without blindly chasing static ride height.`
        : avgFrontRH != null
          ? `Add front platform support to move front ride height at speed from ${avgFrontRH.toFixed(1)} mm toward ~${targetRH!.toFixed(1)} mm.`
          : 'Add front heave preload and/or high-speed compression support to protect the platform.',
      rationale: 'Frequent clean-track strikes indicate aerodynamic platform collapse away from kerbs.',
      confidence: dataQuality.sectionConfidence.platform,
      severity: pickSeverity(true, critical),
      evidence: [
        `Clean bottoming events: ${cleanBottoming}`,
        `Kerb bottoming events: ${bottoming.kerb}`,
        ...(avgFrontRH != null ? [`Avg front ride height at speed: ${avgFrontRH.toFixed(1)} mm`] : []),
      ],
      specifics,
      parameterKey: frontHeavePerch?.parameterKey,
      exactness: exactHeaveTarget != null ? 'exact' : 'inferred',
      verify: ['Re-check clean bottoming count on the next 2-3 push laps.', 'Confirm front ride height sigma stays under control at >200 km/h.'],
      blockedBy: exactHeaveTarget == null ? ['Front heave perch value was not found in the parsed setup.'] : undefined,
      source: 'rule-engine',
    });
  }

  if (splitter) {
    const warn = splitter.minHeight <= RECOMMENDATION.SPLITTER_MIN_HEIGHT_WARN_MM;
    const critical = splitter.minHeight <= RECOMMENDATION.SPLITTER_MIN_HEIGHT_CRITICAL_MM;
    if (warn) {
      const neededLift = Math.max(0, RECOMMENDATION.SPLITTER_MIN_HEIGHT_WARN_MM - splitter.minHeight);
      const frontPushrod = getNormalizedParameter(normalizedSetup, 'platform.frontPushrod');
      const targetPushrod = frontPushrod?.valueType === 'number' && frontPushrod.numericValue != null
        ? frontPushrod.numericValue + neededLift
        : null;
      recommendations.push({
        id: 'platform-splitter',
        category: 'AERO',
        title: 'Protect splitter at speed',
        action: targetPushrod != null && frontPushrod
          ? `Raise ${frontPushrod.displayName} from ${frontPushrod.displayValue} to ${formatNumeric(targetPushrod, frontPushrod.unit)} to recover ~${neededLift.toFixed(1)} mm of splitter clearance.`
          : `Increase front platform support by ~${neededLift.toFixed(1)} mm. Min splitter clearance is ${splitter.minHeight.toFixed(1)} mm — target ≥${RECOMMENDATION.SPLITTER_MIN_HEIGHT_WARN_MM} mm.`,
        rationale: 'Very low front-center ride height at high speed increases aero inconsistency and floor strike risk.',
        confidence: dataQuality.sectionConfidence.platform,
        severity: pickSeverity(warn, critical),
        evidence: [
          `Min splitter height: ${splitter.minHeight.toFixed(1)} mm`,
          `Avg splitter height: ${splitter.avgHeight.toFixed(1)} mm`,
          `Splitter bottoming count: ${splitter.bottomingCount}`,
        ],
        specifics: [{
          parameter: targetPushrod != null && frontPushrod ? frontPushrod.displayName : 'Splitter min clearance',
          current: targetPushrod != null && frontPushrod ? frontPushrod.displayValue : `${splitter.minHeight.toFixed(1)} mm`,
          target: targetPushrod != null && frontPushrod ? formatNumeric(targetPushrod, frontPushrod.unit) : `≥${RECOMMENDATION.SPLITTER_MIN_HEIGHT_WARN_MM} mm`,
          delta: targetPushrod != null ? `+${neededLift.toFixed(1)} mm support` : `+${neededLift.toFixed(1)} mm ride height`,
        }],
        parameterKey: frontPushrod?.parameterKey,
        exactness: targetPushrod != null ? 'exact' : 'inferred',
        verify: ['Check minimum splitter clearance on the next high-speed run.', 'Confirm floor strikes reduce without introducing excessive understeer.'],
        blockedBy: targetPushrod == null ? ['Front pushrod offset was not found in the parsed setup.'] : undefined,
        source: 'rule-engine',
      });
    }
  }

  for (const [corner, stats] of Object.entries(shockVelStats)) {
    if (stats.peak >= RECOMMENDATION.SHOCK_PEAK_WARN_MM_S) {
      const critical = stats.peak >= RECOMMENDATION.SHOCK_PEAK_CRITICAL_MM_S;
      const overshoot = Math.round(stats.peak - SHOCK_VELOCITY.EXTREME);
      const hsComp = getNormalizedParameter(normalizedSetup, `dampers.${corner}.hsComp`);
      const hsSlope = getNormalizedParameter(normalizedSetup, `dampers.${corner}.hsSlope`);
      const hsCompTarget = hsComp?.valueType === 'number' && hsComp.numericValue != null && !critical
        ? hsComp.numericValue + 1
        : null;
      const hsSlopeTarget = hsSlope?.valueType === 'number' && hsSlope.numericValue != null && critical
        ? hsSlope.numericValue - 1
        : null;
      const chosenParameter = hsSlopeTarget != null ? hsSlope : hsComp;
      const chosenTarget = hsSlopeTarget ?? hsCompTarget;
      recommendations.push({
        id: `shock-${corner.toLowerCase()}`,
        category: 'DYNAMICS',
        title: `${corner} damper high-speed event control`,
        action: hsSlopeTarget != null && hsSlope
          ? `Lower ${hsSlope.displayName} from ${hsSlope.displayValue} to ${formatNumeric(hsSlopeTarget, hsSlope.unit)} to make the damper more digressive at extreme shaft velocities.`
          : hsCompTarget != null && hsComp
            ? `Increase ${hsComp.displayName} from ${hsComp.displayValue} to ${formatNumeric(hsCompTarget, hsComp.unit)} to calm ${corner} peak shaft velocity spikes.`
          : critical
            ? `${corner} peak shaft velocity ${stats.peak.toFixed(0)} mm/s exceeds ${SHOCK_VELOCITY.EXTREME} mm/s by ${overshoot} mm/s. Use a more digressive high-speed slope before adding more compression force.`
            : `${corner} peak shaft velocity ${stats.peak.toFixed(0)} mm/s is approaching the extreme threshold (${SHOCK_VELOCITY.EXTREME} mm/s). Add a small amount of high-speed compression damping.`,
        rationale: 'High peak shaft velocities suggest harsh platform transients and can reduce mechanical confidence.',
        confidence: dataQuality.sectionConfidence.platform,
        severity: pickSeverity(true, critical),
        evidence: [
          `${corner} p95: ${stats.p95.toFixed(0)} mm/s`,
          `${corner} p99: ${stats.p99.toFixed(0)} mm/s`,
          `${corner} peak: ${stats.peak.toFixed(0)} mm/s (extreme>${SHOCK_VELOCITY.EXTREME})`,
        ],
        specifics: chosenTarget != null
          ? buildParameterSpecific(chosenParameter, chosenTarget, 0)
          : [{
              parameter: `${corner} peak shaft velocity`,
              current: `${stats.peak.toFixed(0)} mm/s`,
              target: `<${SHOCK_VELOCITY.EXTREME} mm/s`,
              delta: critical ? `-${overshoot} mm/s` : 'monitor',
            }],
        parameterKey: chosenParameter?.parameterKey,
        exactness: chosenTarget != null ? 'exact' : 'inferred',
        verify: [`Re-check ${corner} peak shaft velocity on the next high-speed run.`, 'Confirm the car is not skipping over bumps after the damper change.'],
        blockedBy: chosenTarget == null ? [`${corner} high-speed damper control was not found in the parsed setup.`] : undefined,
        source: 'rule-engine',
      });
    }
  }

  const lastTemps = tyreTempData[tyreTempData.length - 1];
  const lastPressures = tyrePressureData[tyrePressureData.length - 1];
  if (lastTemps) {
    for (const corner of ['LF', 'RF', 'LR', 'RR'] as const) {
      const d = lastTemps[corner];
      const avg = (d.O + d.M + d.I) / 3;
      const spread = Math.abs(d.I - d.O);
      const crownDelta = d.M - (d.O + d.I) / 2;
      const severity = pickSeverity(
        spread >= RECOMMENDATION.TYRE_TEMP_SPREAD_WARN_C || Math.abs(crownDelta) >= RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C,
        spread >= RECOMMENDATION.TYRE_TEMP_SPREAD_CRITICAL_C
      );
      if (severity !== 'INFO') {
        const currentPSI = lastPressures ? lastPressures[corner] : null;
        const isCrowning = crownDelta >= RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C;
        const isCupping = crownDelta <= -RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C;
        const startPressure = getNormalizedParameter(normalizedSetup, `tyres.${corner}.startingPressure`);
        // Rule of thumb: ~1 PSI adjustment per 3°C crown delta
        const pressureDelta = currentPSI != null && (isCrowning || isCupping)
          ? -(crownDelta / 3)
          : null;
        const targetPSI = currentPSI != null && pressureDelta != null
          ? currentPSI + pressureDelta
          : null;
        const currentColdKpa = startPressure?.valueType === 'number' && startPressure.numericValue != null
          ? startPressure.numericValue
          : null;
        const targetColdKpa = currentColdKpa != null && pressureDelta != null
          ? currentColdKpa + pressureDelta * 6.895
          : null;
        const pressureBlocked = targetColdKpa != null && targetColdKpa < 152;

        const crownHint = isCrowning
          ? 'center too hot (over-pressure)'
          : isCupping
            ? 'shoulders too hot (under-pressure/camber mismatch)'
            : 'shape near target';

        let actionText: string;
        if (isCrowning && currentPSI != null && targetPSI != null && currentColdKpa != null && targetColdKpa != null && !pressureBlocked) {
          actionText = `Reduce ${corner} starting pressure from ${currentColdKpa.toFixed(0)} kPa to ${targetColdKpa.toFixed(0)} kPa. Current hot pressure is ${currentPSI.toFixed(1)} PSI, target ~${targetPSI.toFixed(1)} PSI.`;
        } else if (isCrowning && pressureBlocked) {
          actionText = `${corner} is over-pressured by shape, but the setup is already at or near the 152 kPa minimum. Leave pressure at the floor and correct the contact patch with camber/ARB/load changes instead.`;
        } else if (isCupping && currentPSI != null && targetPSI != null) {
          actionText = currentColdKpa != null && targetColdKpa != null
            ? `Increase ${corner} starting pressure from ${currentColdKpa.toFixed(0)} kPa to ${targetColdKpa.toFixed(0)} kPa (current hot ${currentPSI.toFixed(1)} PSI, target ~${targetPSI.toFixed(1)} PSI) and re-check camber if the shoulders still run hot.`
            : `Increase ${corner} cold pressure by ~${Math.abs(pressureDelta!).toFixed(1)} PSI (current hot ${currentPSI.toFixed(1)} PSI, target ~${targetPSI.toFixed(1)} PSI) and re-check camber.`;
        } else if (currentPSI != null) {
          actionText = `${corner} I-O spread is ${spread.toFixed(1)}°C with hot pressure at ${currentPSI.toFixed(1)} PSI. Adjust pressure and camber to reduce spread below ${RECOMMENDATION.TYRE_TEMP_SPREAD_WARN_C}°C.`;
        } else {
          actionText = 'Adjust pressure/camber to reduce inner-outer spread and improve contact patch consistency.';
        }

        const specifics: RecommendationSpecific[] = [];
        if (currentColdKpa != null && targetColdKpa != null && !pressureBlocked && (isCrowning || isCupping)) {
          specifics.push({
            parameter: `${corner} starting pressure`,
            current: `${currentColdKpa.toFixed(0)} kPa`,
            target: `~${targetColdKpa.toFixed(0)} kPa`,
            delta: `${targetColdKpa - currentColdKpa > 0 ? '+' : ''}${(targetColdKpa - currentColdKpa).toFixed(0)} kPa`,
          });
        } else if (pressureBlocked && currentColdKpa != null) {
          specifics.push({
            parameter: `${corner} starting pressure`,
            current: `${currentColdKpa.toFixed(0)} kPa`,
            target: '152 kPa minimum',
            delta: 'blocked by sim minimum',
          });
        }
        if (spread >= RECOMMENDATION.TYRE_TEMP_SPREAD_WARN_C) {
          specifics.push({
            parameter: `${corner} I-O temp spread`,
            current: `${spread.toFixed(1)}°C`,
            target: `<${RECOMMENDATION.TYRE_TEMP_SPREAD_WARN_C}°C`,
            delta: `-${(spread - RECOMMENDATION.TYRE_TEMP_SPREAD_WARN_C).toFixed(1)}°C`,
          });
        }

        recommendations.push({
          id: `tyre-shape-${corner.toLowerCase()}`,
          category: 'TYRES',
          title: `${corner} contact patch balance`,
          action: actionText,
          rationale: 'Large surface gradients indicate load distribution imbalance and reduced peak grip window.',
          confidence: dataQuality.sectionConfidence.tyres,
          severity,
          evidence: [
            `${corner} avg temp: ${avg.toFixed(1)}°C (target ${TYRE_TEMP.OPERATING_TARGET}°C)`,
            `${corner} I-O spread: ${spread.toFixed(1)}°C`,
            `${corner} shape: ${crownHint}`,
            ...(currentPSI != null ? [`${corner} hot pressure: ${currentPSI.toFixed(1)} PSI`] : []),
          ],
          specifics,
          parameterKey: startPressure?.parameterKey,
          exactness: currentColdKpa != null ? (pressureBlocked ? 'blocked' : 'exact') : 'inferred',
          verify: [`Review ${corner} surface shape after the next stabilized lap.`, `Confirm ${corner} hot pressure trends toward ${targetPSI != null ? `~${targetPSI.toFixed(1)} PSI` : 'the target window'}.`],
          blockedBy: pressureBlocked ? [`${corner} starting pressure would need to go below the 152 kPa sim minimum.`] : undefined,
          source: 'rule-engine',
        });
      }
    }
  }

  const lastWear = tyreWearData[tyreWearData.length - 1];
  if (lastWear) {
    for (const corner of ['LF', 'RF', 'LR', 'RR'] as const) {
      if (lastWear[corner].avg < ANALYSIS.TYRE_WEAR_RISK_THRESHOLD) {
        const wearRate = validLapCount > 0 ? (100 - lastWear[corner].avg) / validLapCount : 0;
        const lapsTo80 = wearRate > 0 ? Math.floor((lastWear[corner].avg - 80) / wearRate) : 0;
        const rearAxle = corner === 'LR' || corner === 'RR';
        const preload = getNormalizedParameter(normalizedSetup, 'diff.rearPreload');
        const rearArb = getNormalizedParameter(normalizedSetup, 'suspension.rearArbBlades');
        const frontArb = getNormalizedParameter(normalizedSetup, 'suspension.frontArbBlades');
        const chosenParameter = rearAxle ? preload ?? rearArb : frontArb;
        const targetValue = chosenParameter?.valueType === 'number' && chosenParameter.numericValue != null
          ? chosenParameter.numericValue + (rearAxle ? -2 : -1)
          : null;
        recommendations.push({
          id: `wear-${corner.toLowerCase()}`,
          category: 'TYRES',
          title: `${corner} wear management`,
          action: targetValue != null && chosenParameter
            ? `${corner} is wearing at ${wearRate.toFixed(2)}%/lap. Move ${chosenParameter.displayName} from ${chosenParameter.displayValue} to ${formatNumeric(targetValue, chosenParameter.unit)} before chasing more aggressive tyre settings.`
            : `${corner} at ${lastWear[corner].avg.toFixed(1)}% tread after ${validLapCount} laps (${wearRate.toFixed(2)}%/lap).${lapsTo80 > 0 ? ` Projected to reach 80% in ~${lapsTo80} more laps.` : ''} Reduce sustained load via diff preload, ARB balance, or camber adjustment.`,
          rationale: 'Accelerated wear suggests the current setup is overworking this tyre over race stint conditions.',
          confidence: dataQuality.sectionConfidence.tyres,
          severity: 'WARNING',
          evidence: [
            `${corner} tread remaining: ${lastWear[corner].avg.toFixed(1)}%`,
            `Wear rate: ${wearRate.toFixed(2)}%/lap`,
            `Wear threshold: ${ANALYSIS.TYRE_WEAR_RISK_THRESHOLD}%`,
          ],
          specifics: targetValue != null && chosenParameter
            ? buildParameterSpecific(chosenParameter, targetValue, 0)
            : [{
                parameter: `${corner} wear rate`,
                current: `${wearRate.toFixed(2)}%/lap`,
                target: '<1.0%/lap',
                delta: lapsTo80 > 0 ? `~${lapsTo80} laps to 80%` : 'at risk',
              }],
          parameterKey: chosenParameter?.parameterKey,
          exactness: targetValue != null ? 'exact' : 'inferred',
          verify: [`Check ${corner} wear rate over the next long run.`, 'Confirm the balance change does not create exit instability.'],
          blockedBy: targetValue == null ? ['No direct diff/ARB control was found in the parsed setup for this wear issue.'] : undefined,
          source: 'rule-engine',
        });
      }
    }
  }

  const lastEngine = engineTemps[engineTemps.length - 1];
  if (lastEngine && (lastEngine.waterTemp >= ENGINE_TEMP.WATER_WARNING || lastEngine.oilTemp >= ENGINE_TEMP.OIL_WARNING)) {
    const waterExcess = lastEngine.waterTemp - ENGINE_TEMP.WATER_WARNING;
    const oilExcess = lastEngine.oilTemp - ENGINE_TEMP.OIL_WARNING;
    const waterOver = waterExcess > 0;
    const oilOver = oilExcess > 0;
    const specifics: RecommendationSpecific[] = [];
    if (waterOver) {
      specifics.push({
        parameter: 'Water temp',
        current: `${lastEngine.waterTemp.toFixed(1)}°C`,
        target: `<${ENGINE_TEMP.WATER_WARNING}°C`,
        delta: `-${waterExcess.toFixed(1)}°C`,
      });
    }
    if (oilOver) {
      specifics.push({
        parameter: 'Oil temp',
        current: `${lastEngine.oilTemp.toFixed(1)}°C`,
        target: `<${ENGINE_TEMP.OIL_WARNING}°C`,
        delta: `-${oilExcess.toFixed(1)}°C`,
      });
    }
    recommendations.push({
      id: 'engine-temperature-control',
      category: 'POWERTRAIN',
      title: 'Engine thermal headroom',
      action: `Water temp ${lastEngine.waterTemp.toFixed(1)}°C${waterOver ? ` (+${waterExcess.toFixed(1)}°C over ${ENGINE_TEMP.WATER_WARNING}°C limit)` : ''}, oil temp ${lastEngine.oilTemp.toFixed(1)}°C${oilOver ? ` (+${oilExcess.toFixed(1)}°C over ${ENGINE_TEMP.OIL_WARNING}°C limit)` : ''}. Increase radiator/duct opening to bring temps within limits.`,
      rationale: 'High coolant/oil temperatures can force protection behavior and compromise performance consistency.',
      confidence: dataQuality.sectionConfidence.dynamics,
      severity: waterExcess >= 5 || oilExcess >= 5 ? 'CRITICAL' : 'WARNING',
      evidence: [
        `Water temp (last lap): ${lastEngine.waterTemp.toFixed(1)}°C`,
        `Oil temp (last lap): ${lastEngine.oilTemp.toFixed(1)}°C`,
        `Warning thresholds: water>${ENGINE_TEMP.WATER_WARNING}°C, oil>${ENGINE_TEMP.OIL_WARNING}°C`,
      ],
      specifics,
      exactness: 'inferred',
      verify: ['Check water and oil temps on the next representative lap.', 'Confirm added cooling does not cost unnecessary straight-line speed.'],
      source: 'rule-engine',
    });
  }

  if (rarb?.available && rarb.perLapChanges.length > 0) {
    const avgChanges = rarb.perLapChanges.reduce((acc, p) => acc + p.changeCount, 0) / rarb.perLapChanges.length;
    const farbAvg = aids.FARB?.avg;
    const rarbAvg = aids.RARB?.avg;
    if (avgChanges >= RECOMMENDATION.DRIVER_AID_ACTIVE_RANGE_WARN) {
      const rearArbBlades = getNormalizedParameter(normalizedSetup, 'suspension.rearArbBlades');
      // Find the dominant RARB value from speed bands
      const dominantBand = rarb.speedBands.length > 0
        ? rarb.speedBands.reduce((best, b) => b.sampleCount > best.sampleCount ? b : best, rarb.speedBands[0])
        : null;
      const dominantValue = dominantBand ? dominantBand.avgValue : rarbAvg;
      const rarbStr = Number.isFinite(rarbAvg) ? rarbAvg!.toFixed(1) : 'n/a';
      const targetStr = Number.isFinite(dominantValue) ? Math.round(dominantValue!).toString() : rarbStr;
      recommendations.push({
        id: 'rarb-usage',
        category: 'AIDS',
        title: 'Stabilize ARB map usage',
        action: rearArbBlades?.valueType === 'number' && rearArbBlades.numericValue != null
          ? `Set ${rearArbBlades.displayName} from ${rearArbBlades.displayValue} to ${targetStr} so the garage baseline matches the most-used in-car value.`
          : `Set RARB baseline to ${targetStr} (most-used value across speed bands). Currently averaging ${avgChanges.toFixed(1)} changes/lap — target <${RECOMMENDATION.DRIVER_AID_ACTIVE_RANGE_WARN} changes/lap.`,
        rationale: 'Frequent ARB changes can indicate setup baseline mismatch across speed phases.',
        confidence: dataQuality.sectionConfidence.setup,
        severity: 'WARNING',
        evidence: [
          `Average RARB changes/lap: ${avgChanges.toFixed(1)}`,
          `FARB avg: ${Number.isFinite(farbAvg) ? farbAvg?.toFixed(1) : 'n/a'}, RARB avg: ${rarbStr}`,
          formatAidsContext(carProfile),
        ],
        specifics: [{
          parameter: rearArbBlades?.displayName || 'RARB baseline',
          current: rearArbBlades?.displayValue || rarbStr,
          target: targetStr,
          delta: `${avgChanges.toFixed(1)}/lap → <${RECOMMENDATION.DRIVER_AID_ACTIVE_RANGE_WARN}/lap`,
        }],
        parameterKey: rearArbBlades?.parameterKey,
        exactness: rearArbBlades?.valueType === 'number' ? 'exact' : 'inferred',
        verify: ['Check that in-car RARB changes/lap drop on the next stint.', 'Confirm the chosen baseline still covers both slow and fast corners.'],
        blockedBy: rearArbBlades == null ? ['Rear ARB blade baseline was not found in the parsed setup.'] : undefined,
        source: 'rule-engine',
      });
    }
  }

  const brakeBias = aids['Brake Bias'];
  if (brakeBias && carProfile) {
    const biasOffset = Math.abs(brakeBias.avg - carProfile.defaultBrakeBias);
    if (biasOffset > 1.0) {
      const sign = brakeBias.avg > carProfile.defaultBrakeBias ? '+' : '-';
      const setupBrakeBias = getNormalizedParameter(normalizedSetup, 'brakes.bias');
      recommendations.push({
        id: 'brake-bias-calibration',
        category: 'BRAKES',
        title: 'Re-check brake balance baseline',
        action: setupBrakeBias?.valueType === 'number' && setupBrakeBias.numericValue != null
          ? `Move ${setupBrakeBias.displayName} from ${setupBrakeBias.displayValue} back toward ${carProfile.defaultBrakeBias.toFixed(1)}% unless the current entry balance is intentional.`
          : `Brake bias currently ${brakeBias.avg.toFixed(1)}%, offset ${sign}${biasOffset.toFixed(1)}% from ${carProfile.name} baseline of ${carProfile.defaultBrakeBias.toFixed(1)}%. Return to baseline unless entry stability specifically requires the current offset.`,
        rationale: 'Large drift from known baseline can indicate setup-compensation rather than root-cause fix.',
        confidence: dataQuality.sectionConfidence.setup,
        severity: biasOffset > 2.0 ? 'CRITICAL' : 'WARNING',
        evidence: [
          `Observed avg brake bias: ${brakeBias.avg.toFixed(1)}%`,
          `Car baseline brake bias: ${carProfile.defaultBrakeBias.toFixed(1)}%`,
          `Offset: ${sign}${biasOffset.toFixed(1)}%`,
        ],
        specifics: setupBrakeBias?.valueType === 'number' && setupBrakeBias.numericValue != null
          ? buildParameterSpecific(setupBrakeBias, carProfile.defaultBrakeBias)
          : [{
              parameter: 'Brake bias',
              current: `${brakeBias.avg.toFixed(1)}%`,
              target: `${carProfile.defaultBrakeBias.toFixed(1)}%`,
              delta: `${sign}${biasOffset.toFixed(1)}%`,
            }],
        parameterKey: setupBrakeBias?.parameterKey,
        exactness: setupBrakeBias?.valueType === 'number' ? 'exact' : 'inferred',
        verify: ['Check brake bias stays closer to the car baseline over a full fuel window.', 'Confirm entry rotation/stability improves without front locking.'],
        blockedBy: setupBrakeBias == null ? ['Brake bias was available in telemetry but not in the parsed garage setup.'] : undefined,
        source: 'rule-engine',
      });
    }
  }

  // ── Enhanced track guidance (domain knowledge) ─────────────
  const trackGuidance = trackProfile ? getTrackGuidance(trackProfile.id) : null;
  if (trackGuidance) {
    const notes = [
      `Surface: ${trackGuidance.surfaceType}`,
      `Wing level: ${trackGuidance.wingLevel}`,
      `HS comp slope: ${trackGuidance.hsCompSlopeGuidance || 'moderate'}`,
      ...(trackGuidance.bestCar ? [`Best suited: ${trackGuidance.bestCar}`] : []),
      ...trackGuidance.specialNotes.slice(0, 3),
    ];
    const trackAction = trackGuidance.keyCompromise
      ? `${trackGuidance.keyCompromise}. ${trackGuidance.specialNotes[0] || ''}`
      : trackGuidance.specialNotes.join('. ');
    recommendations.push({
      id: 'track-guidance',
      category: 'TRACK',
      title: `${trackProfile!.name} setup guidance`,
      action: trackAction,
      rationale: 'Track-specific engineering knowledge from verified setup data and domain expertise.',
      confidence: dataQuality.confidence,
      severity: 'INFO',
      evidence: notes,
      exactness: 'inferred',
      source: 'rule-engine',
    });

    // Track-specific heave spring check (e.g., Sebring front heave >= 65 N/mm)
    if (trackGuidance.heaveSpringGuidance?.frontMin_Nmm) {
      const frontHeave = getNormalizedParameter(normalizedSetup, 'platform.frontHeaveSpring');
      if (frontHeave?.valueType === 'number' && frontHeave.numericValue != null) {
        if (frontHeave.numericValue < trackGuidance.heaveSpringGuidance.frontMin_Nmm) {
          recommendations.push({
            id: 'track-heave-spring',
            category: 'PLATFORM',
            title: `Front heave spring too soft for ${trackProfile!.name}`,
            action: `Increase ${frontHeave.displayName} from ${frontHeave.displayValue} to at least ${trackGuidance.heaveSpringGuidance.frontMin_Nmm} N/mm. ${trackGuidance.heaveSpringGuidance.rearNotes || ''}`,
            rationale: `${trackProfile!.name}'s surface requires stiffer front heave springs to prevent platform collapse. Verified from real setup data.`,
            confidence: 'HIGH',
            severity: 'CRITICAL',
            evidence: [
              `Current front heave: ${frontHeave.displayValue}`,
              `Track minimum: ${trackGuidance.heaveSpringGuidance.frontMin_Nmm} N/mm`,
              `Surface type: ${trackGuidance.surfaceType}`,
            ],
            specifics: [{
              parameter: frontHeave.displayName,
              current: frontHeave.displayValue,
              target: `≥${trackGuidance.heaveSpringGuidance.frontMin_Nmm} N/mm`,
              delta: `+${(trackGuidance.heaveSpringGuidance.frontMin_Nmm - frontHeave.numericValue).toFixed(0)} N/mm`,
            }],
            parameterKey: frontHeave.parameterKey,
            exactness: 'exact',
            verify: ['Check front ride height variance at >200 km/h', 'Confirm clean bottoming events decrease'],
            source: 'rule-engine',
          });
        }
      }
    }
  } else if (trackProfile?.setupFocus) {
    recommendations.push({
      id: 'track-focus',
      category: 'TRACK',
      title: 'Track-priority setup focus',
      action: trackProfile.setupFocus,
      rationale: 'Prioritize setup work that aligns with this track profile before fine-tuning secondary areas.',
      confidence: dataQuality.confidence,
      severity: 'INFO',
      evidence: [
        `Track profile: ${trackProfile.name}`,
        `Mandatory gear stack: ${trackProfile.mandatoryGearStack || 'none'}`,
      ],
      exactness: 'inferred',
      source: 'rule-engine',
    });
  }

  // ── Enhanced car knowledge (domain knowledge) ──────────────
  const carDeep = carProfile ? getCarDeepKnowledge(carProfile.id) : null;
  if (carDeep) {
    const keySignals = telemetryReasoning.slice(0, 2).map((signal) => signal.summary);
    recommendations.push({
      id: 'car-deep-knowledge',
      category: 'TRACK',
      title: `${carProfile!.name} engineering profile`,
      action: `${carDeep.character}. ${carDeep.weaknesses[0] || ''}`,
      rationale: 'Car-specific architecture and handling DNA inform how setup changes translate on track.',
      confidence: dataQuality.confidence,
      severity: 'INFO',
      evidence: [
        `Rotation rank: ${carDeep.naturalRotationRank}/5`,
        `Aero sensitivity: ${carDeep.aeroPlatformSensitivityRank}/5`,
        `Diff sensitivity: ${carDeep.diffSensitivity}`,
        carDeep.damperScaleWarning,
        ...keySignals,
      ].slice(0, 5),
      exactness: 'inferred',
      source: 'rule-engine',
    });
  } else if (carProfile?.knownQuirks.length) {
    const keySignals = telemetryReasoning.slice(0, 2).map((signal) => signal.summary);
    recommendations.push({
      id: 'car-quirks',
      category: 'TRACK',
      title: `${carProfile.name} known quirks`,
      action: 'Cross-check recommendations against known platform quirks before finalizing setup changes.',
      rationale: 'Car-specific architecture can change how generic setup deltas translate on track.',
      confidence: dataQuality.confidence,
      severity: 'INFO',
      evidence: [...carProfile.knownQuirks.slice(0, 2), ...keySignals].slice(0, 3),
      exactness: 'inferred',
      source: 'rule-engine',
    });
  }

  // ── In-car adjustment interpretation (domain knowledge) ────
  const brakeBiasAid = aids['Brake Bias'];
  if (brakeBiasAid && !brakeBiasAid.constant && (brakeBiasAid.max - brakeBiasAid.min) > 1.0) {
    recommendations.push({
      id: 'incar-bias-drift',
      category: 'BRAKES',
      title: 'Brake bias drifting during stint',
      action: `Brake bias moved from ${brakeBiasAid.min.toFixed(1)}% to ${brakeBiasAid.max.toFixed(1)}% during the stint (${(brakeBiasAid.max - brakeBiasAid.min).toFixed(1)}% range). This suggests the base setup bias is wrong for the fuel window. Adjust base bias by ~${((brakeBiasAid.max - brakeBiasAid.min) / 2).toFixed(1)}% toward the average.`,
      rationale: 'In-car bias drift indicates driver compensating for a base setup mismatch.',
      confidence: 'MEDIUM',
      severity: 'WARNING',
      evidence: [
        `Bias range: ${brakeBiasAid.min.toFixed(1)}% - ${brakeBiasAid.max.toFixed(1)}%`,
        `Bias avg: ${brakeBiasAid.avg.toFixed(1)}%`,
      ],
      exactness: 'inferred',
      source: 'rule-engine',
    });
  }

  const tcAid = aids['TC1'] || aids['TCLON'];
  if (tcAid && !tcAid.constant && (tcAid.max - tcAid.min) >= 2) {
    recommendations.push({
      id: 'incar-tc-climbing',
      category: 'AIDS',
      title: 'TC increasing during stint',
      action: `TC moved from ${tcAid.min.toFixed(0)} to ${tcAid.max.toFixed(0)} during the stint. This indicates rear tyres are overheating. Reduce diff preload, soften rear ARB, or reduce rear camber to address rear tyre thermal management.`,
      rationale: 'Increasing TC during a stint is a classic signal of rear tyre degradation.',
      confidence: 'MEDIUM',
      severity: 'WARNING',
      evidence: [
        `TC range: ${tcAid.min.toFixed(0)} - ${tcAid.max.toFixed(0)}`,
        `TC avg: ${tcAid.avg.toFixed(1)}`,
      ],
      exactness: 'inferred',
      source: 'rule-engine',
    });
  }

  // ── ARB blade maxed-out detection (domain knowledge) ───────
  const farbAid = aids['FARB'];
  const rarbAid = aids['RARB'];
  if (farbAid && (farbAid.min <= 1 || farbAid.max >= 5)) {
    const maxed = farbAid.max >= 5 ? 'maximum' : 'minimum';
    recommendations.push({
      id: 'incar-farb-maxed',
      category: 'AIDS',
      title: `Front ARB blades maxed at ${maxed}`,
      action: `FARB blades reached ${maxed} (${maxed === 'maximum' ? farbAid.max.toFixed(0) : farbAid.min.toFixed(0)}). Step ${maxed === 'maximum' ? 'up' : 'down'} front ARB diameter and set blades to 2-3 for tuning room in both directions.`,
      rationale: 'Running out of blade range means the ARB diameter is wrong for this track/conditions.',
      confidence: 'HIGH',
      severity: 'WARNING',
      evidence: [`FARB range: ${farbAid.min.toFixed(0)} - ${farbAid.max.toFixed(0)}`],
      exactness: 'inferred',
      source: 'rule-engine',
    });
  }
  if (rarbAid && (rarbAid.min <= 1 || rarbAid.max >= 5)) {
    const maxed = rarbAid.max >= 5 ? 'maximum' : 'minimum';
    recommendations.push({
      id: 'incar-rarb-maxed',
      category: 'AIDS',
      title: `Rear ARB blades maxed at ${maxed}`,
      action: `RARB blades reached ${maxed} (${maxed === 'maximum' ? rarbAid.max.toFixed(0) : rarbAid.min.toFixed(0)}). Step ${maxed === 'maximum' ? 'up' : 'down'} rear ARB diameter and set blades to 2-3 for tuning room in both directions.`,
      rationale: 'Running out of blade range means the ARB diameter is wrong for this track/conditions.',
      confidence: 'HIGH',
      severity: 'WARNING',
      evidence: [`RARB range: ${rarbAid.min.toFixed(0)} - ${rarbAid.max.toFixed(0)}`],
      exactness: 'inferred',
      source: 'rule-engine',
    });
  }

  // ── Damper slope guidance (domain knowledge) ───────────────
  const surfaceType = trackGuidance?.surfaceType;
  for (const [corner, stats] of Object.entries(shockVelStats)) {
    const slopeRec = getDamperSlopeRecommendation(stats.peak, surfaceType);
    if (slopeRec) {
      const hsSlope = getNormalizedParameter(normalizedSetup, `dampers.${corner}.hsSlope`);
      // Only add if we haven't already added a shock recommendation for this corner
      const alreadyHasShockRec = recommendations.some(r => r.id === `shock-${corner.toLowerCase()}`);
      if (!alreadyHasShockRec && hsSlope) {
        recommendations.push({
          id: `damper-slope-${corner.toLowerCase()}`,
          category: 'DYNAMICS',
          title: `${corner} damper slope optimization`,
          action: `${slopeRec.slopeRecommendation}. ${slopeRec.rationale}`,
          rationale: `Peak velocity ${stats.peak.toFixed(0)} mm/s on ${surfaceType || 'mixed'} surface.`,
          confidence: 'MEDIUM',
          severity: 'INFO',
          evidence: [
            `${corner} peak: ${stats.peak.toFixed(0)} mm/s`,
            `Surface: ${surfaceType || 'unknown'}`,
            `Current slope: ${hsSlope.displayValue}`,
          ],
          parameterKey: hsSlope.parameterKey,
          exactness: 'inferred',
          source: 'rule-engine',
        });
      }
    }
  }

  // ── Vision tread conditioning awareness ─────────────────────
  if (isVisionTreadActive() && conditioning) {
    const condEntries = Object.entries(conditioning) as [string, ConditioningCorner][];
    const coldCorners = condEntries.filter(
      ([, c]) => c.last < TYRE_TEMP.OPERATING_TARGET && c.lapsTo85 > validLapCount
    );
    if (coldCorners.length > 0 && validLapCount <= 8) {
      recommendations.push({
        id: 'vision-tread-conditioning',
        category: 'TYRES',
        title: 'Vision tread conditioning in progress',
        action: `Tyres haven't reached 85°C window after ${validLapCount} laps. This is NORMAL for S1 2026 Vision tread tires — fronts need 13-15 laps, rears need 8-9 laps. Do NOT adjust setup to fix cold tyres in short stints.`,
        rationale: 'Vision tread tires (S1 2026+) build temperature progressively. A 5-8 lap stint may not reach operating window — this is expected conditioning behavior, not a setup failure.',
        confidence: 'HIGH',
        severity: 'INFO',
        evidence: [
          `Physics: S1 2026 Vision tread`,
          `Valid laps: ${validLapCount}`,
          ...coldCorners.slice(0, 2).map(([corner, data]) => `${corner}: ${data.last.toFixed(1)}°C (needs ~${data.lapsTo85} laps to reach 85°C)`),
        ],
        exactness: 'inferred',
        source: 'rule-engine',
      });
    }
  }

  if (dataQuality.confidence === 'LOW') {
    recommendations.unshift({
      id: 'low-confidence',
      category: 'TRACK',
      title: 'Low-confidence dataset',
      action: 'Capture a cleaner reference run (more valid laps and broader channel coverage) before locking setup decisions.',
      rationale: 'Recommendation confidence is reduced due to telemetry coverage/quality constraints.',
      confidence: 'LOW',
      severity: 'CRITICAL',
      evidence: [
        `Quality confidence: ${dataQuality.confidence}`,
        ...dataQuality.notes,
      ],
      exactness: 'blocked',
      blockedBy: dataQuality.notes,
      source: 'rule-engine',
    });
  }

  return finalizeRecommendations(recommendations);
}

// ═══════════════════════════════════════════════════════════════
// MAIN ANALYSIS ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

export function analyzeSession(
  parsed: IBTParsed,
  carProfile?: CarProfile,
  trackProfile?: TrackProfile,
  parserWarnings: string[] = []
): SessionAnalysis | { error: string } {
  const ch = loadChannels(parsed);
  const driver = findDriver(parsed);

  const wi = parsed.sessionInfo?.WeekendInfo || {};
  const fallbackTrackLength = (wi.TrackLength as string) || '5.8';

  const header = extractSessionHeader(parsed, driver);

  if (!ch.Speed || !ch.Lap || !ch.LapDistPct) {
    return { error: 'Missing critical channels (Speed, Lap, LapDistPct)' };
  }

  const { laps, validLaps } = detectLaps(ch, parsed.recordCount, trackProfile, fallbackTrackLength);

  if (validLaps.length === 0) {
    return { error: 'No valid laps detected. Session may be too short or lap times outside expected range.' };
  }

  // Build masks
  const validMask = new Uint8Array(parsed.recordCount);
  for (const l of validLaps) {
    const lap = laps[l];
    for (let i = lap.start; i <= lap.end; i++) validMask[i] = 1;
  }

  const hiSpeedMask = new Uint8Array(parsed.recordCount);
  for (let i = 0; i < parsed.recordCount; i++) {
    const speed = speedToKph(ch.Speed![i]);
    if (validMask[i] && Number.isFinite(speed) && speed > ANALYSIS.HIGH_SPEED_KPH) {
      hiSpeedMask[i] = 1;
    }
  }

  // Find best lap
  const lapTimes: LapTime[] = [];
  let bestTime = Infinity;
  let bestLapIdx = validLaps[0];
  for (const l of validLaps) {
    const lap = laps[l];
    if (!Number.isFinite(lap.duration)) continue;
    const maxSpeed = Number.isFinite(lap.maxSpeed) ? lap.maxSpeed : 0;
    const time = lap.duration;
    lapTimes.push({
      lap: l,
      time,
      maxSpeed,
      timeStr: `${Math.floor(time / 60)}:${(time % 60).toFixed(2).padStart(5, '0')}`,
    });
    if (time < bestTime) {
      bestTime = time;
      bestLapIdx = l;
    }
  }

  if (lapTimes.length === 0 || !Number.isFinite(bestTime)) {
    return { error: 'No valid lap times available after telemetry quality filtering.' };
  }

  // Run all analyses
  const tyreTempData = analyzeTyreTemps(ch, laps, validLaps);
  const tyrePressureData = analyzeTyrePressures(ch, laps, validLaps);
  const tyreWearData = analyzeTyreWear(ch, laps, validLaps);
  const rideHeightData = analyzeRideHeights(ch, parsed.recordCount, hiSpeedMask);
  const bottoming = analyzeBottoming(ch, parsed.recordCount, hiSpeedMask, trackProfile);
  const shockVelStats = analyzeShockVelocities(ch, parsed.recordCount, hiSpeedMask, parsed.tickRate);
  const gForce = analyzeGForce(ch, parsed.recordCount, validMask);
  const fuel = analyzeFuel(ch, laps, validLaps);
  const aids = analyzeDriverAids(ch, parsed.recordCount, validMask);
  const conditioning = analyzeConditioning(ch, laps, validLaps);
  const engineTemps = analyzeEngineTemps(ch, laps, validLaps);
  const rarb = analyzeRARB(ch, laps, validLaps, parsed.recordCount, validMask, bestLapIdx);
  const splitter = analyzeSplitter(ch, parsed.recordCount, hiSpeedMask);
  const dataQuality = buildDataQualityReport(parsed, validLaps, parserWarnings);
  const cs = parsed.sessionInfo?.CarSetup || {};
  const normalizedSetup = normalizeSetup(cs as Record<string, unknown>, carProfile);
  const telemetryReasoning = buildTelemetryReasoning({
    carProfile,
    tyreTempData,
    tyreWearData,
    bottoming,
    shockVelStats,
    aids,
    splitter,
    rideHeightData,
    dataQuality,
  });
  const recommendations = buildRecommendations({
    carProfile,
    trackProfile,
    normalizedSetup,
    telemetryReasoning,
    tyreTempData,
    tyrePressureData,
    tyreWearData,
    engineTemps,
    bottoming,
    shockVelStats,
    aids,
    splitter,
    rarb,
    rideHeightData,
    dataQuality,
    validLapCount: validLaps.length,
    conditioning,
  });

  // Domain knowledge enrichment
  const constraintViolations = validateConstraints(normalizedSetup, carProfile);
  const physicsVersionNote = getPhysicsVersionNote();
  const trackGuidanceData = getTrackGuidance(trackProfile?.id || null);
  const carDeepKnowledgeData = getCarDeepKnowledge(carProfile?.id || null);

  return {
    header,
    setup: flattenSetup(cs as Record<string, unknown>),
    normalizedSetup,
    lapTimes,
    bestTime,
    tyreTempData,
    tyrePressureData,
    tyreWearData,
    rideHeightData,
    bottoming,
    shockVelStats,
    gForceData: gForce.data,
    peakLatG: gForce.peakLat,
    peakBrakeG: gForce.peakBrake,
    peakAccelG: gForce.peakAccel,
    fuel,
    aids,
    conditioning,
    engineTemps,
    rarb,
    splitter,
    validLaps,
    telemetryReasoning,
    recommendations,
    dataQuality,
    carProfileId: carProfile?.id || null,
    trackProfileId: trackProfile?.id || null,
    constraintViolations,
    physicsVersionNote,
    trackGuidance: trackGuidanceData,
    carDeepKnowledge: carDeepKnowledgeData,
  };
}
