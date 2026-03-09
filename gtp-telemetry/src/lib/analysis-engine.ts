// ═══════════════════════════════════════════════════════════════
// ANALYSIS ENGINE — 14-item engineering checklist
// Port of sebring_analysis_v4.py logic + new analyses
// ═══════════════════════════════════════════════════════════════

import { speedToKph, accelToG, pressureToPSI, heightToMM } from './unit-conversions';
import { ANALYSIS } from './constants';
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
} from './types';
import { ANALYSIS_CHANNELS } from './types';

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
      lapsTo85: rate > 0 ? Math.max(0, Math.ceil((85 - avgL) / rate)) : 99,
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
      if (Math.abs(now - prev) > 0.01) {
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
      if (Math.abs(to - from) > 0.01) {
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

function flattenSetup(obj: Record<string, unknown>, prefix = ''): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenSetup(v as Record<string, unknown>, key));
    } else {
      out.push([key, v]);
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// MAIN ANALYSIS ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

export function analyzeSession(
  parsed: IBTParsed,
  _carProfile?: CarProfile,
  trackProfile?: TrackProfile
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

  const cs = parsed.sessionInfo?.CarSetup || {};

  return {
    header,
    setup: flattenSetup(cs as Record<string, unknown>),
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
  };
}
