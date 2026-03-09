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
  _tickRate: number,
  trackProfile?: TrackProfile
): { laps: Record<number, LapData>; validLaps: number[] } {
  if (!ch.Lap || !ch.SessionTime || !ch.Speed) {
    return { laps: {}, validLaps: [] };
  }

  const spd = ch.Speed;
  const laps: Record<number, LapData> = {};

  for (let i = 0; i < recordCount; i++) {
    const l = Math.floor(ch.Lap![i]);
    if (!laps[l]) laps[l] = { samples: [], start: i, end: i, duration: 0, maxSpeed: 0, count: 0 };
    laps[l].samples.push(i);
    laps[l].end = i;
  }

  for (const l in laps) {
    const s = laps[l];
    s.duration = ch.SessionTime![s.end] - ch.SessionTime![s.start];
    s.count = s.samples.length;
    let max = 0;
    for (const i of s.samples) {
      const v = speedToKph(spd![i]);
      if (v > max) max = v;
    }
    s.maxSpeed = max;
  }

  // Valid lap window
  let minLap: number, maxLap: number;
  if (trackProfile?.validLapWindow) {
    [minLap, maxLap] = trackProfile.validLapWindow;
  } else {
    const trackLen = parseFloat(
      (parsed_weekendInfo_trackLength as string) || '5.8'
    );
    minLap = trackLen > 10 ? 150 : trackLen > 3 ? 80 : 40;
    maxLap = trackLen > 10 ? 300 : trackLen > 3 ? 160 : 90;
  }

  const validLaps = Object.keys(laps)
    .filter((l) => {
      const d = laps[Number(l)].duration;
      return d > minLap && d < maxLap && laps[Number(l)].count > 100;
    })
    .map(Number)
    .sort((a, b) => a - b);

  return { laps, validLaps };
}

// We need a way to pass weekend info for track length fallback
let parsed_weekendInfo_trackLength: unknown = '5.8';

function avg(arr: Float64Array, indices: number[]): number {
  if (indices.length === 0) return 0;
  let sum = 0;
  for (const i of indices) sum += arr[i];
  return sum / indices.length;
}

function analyzeTyreTemps(
  ch: Channels,
  laps: Record<number, LapData>,
  validLaps: number[]
): TyreTempLap[] {
  return validLaps.map((l) => {
    const s = laps[l].samples;
    const late = s.slice(Math.floor(s.length / 2)); // Last 50% for stability

    // CRITICAL: L/M/R to O/M/I mapping differs by side
    // Left tyres (LF, LR): tempL = Outer, tempM = Middle, tempR = Inner
    // Right tyres (RF, RR): tempR = Outer, tempM = Middle, tempL = Inner
    return {
      lap: l,
      LF: {
        O: ch.LFtempL ? avg(ch.LFtempL, late) : 0,
        M: ch.LFtempM ? avg(ch.LFtempM, late) : 0,
        I: ch.LFtempR ? avg(ch.LFtempR, late) : 0,
      },
      RF: {
        O: ch.RFtempR ? avg(ch.RFtempR, late) : 0,
        M: ch.RFtempM ? avg(ch.RFtempM, late) : 0,
        I: ch.RFtempL ? avg(ch.RFtempL, late) : 0,
      },
      LR: {
        O: ch.LRtempL ? avg(ch.LRtempL, late) : 0,
        M: ch.LRtempM ? avg(ch.LRtempM, late) : 0,
        I: ch.LRtempR ? avg(ch.LRtempR, late) : 0,
      },
      RR: {
        O: ch.RRtempR ? avg(ch.RRtempR, late) : 0,
        M: ch.RRtempM ? avg(ch.RRtempM, late) : 0,
        I: ch.RRtempL ? avg(ch.RRtempL, late) : 0,
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
    const s = laps[l].samples;
    return {
      lap: l,
      LF: ch.LFpressure ? pressureToPSI(avg(ch.LFpressure, s)) : 0,
      RF: ch.RFpressure ? pressureToPSI(avg(ch.RFpressure, s)) : 0,
      LR: ch.LRpressure ? pressureToPSI(avg(ch.LRpressure, s)) : 0,
      RR: ch.RRpressure ? pressureToPSI(avg(ch.RRpressure, s)) : 0,
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
    const s = laps[l].samples;
    const lastIdx = s[s.length - 1];

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
      data.push({
        pct: ch.LapDistPct![i] * 100,
        LF: heightToMM(ch.LFrideHeight![i]),
        RF: heightToMM(ch.RFrideHeight![i]),
        LR: heightToMM(ch.LRrideHeight![i]),
        RR: heightToMM(ch.RRrideHeight![i]),
        speed: speedToKph(ch.Speed![i]),
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

    const corners = [
      { name: 'LF', rh: ch.LFrideHeight![i] },
      { name: 'RF', rh: ch.RFrideHeight![i] },
      { name: 'LR', rh: ch.LRrideHeight![i] },
      { name: 'RR', rh: ch.RRrideHeight![i] },
    ];

    const minRH = Math.min(...corners.map((c) => c.rh)) * 1000;
    if (minRH <= ANALYSIS.BOTTOMING_THRESHOLD_MM) {
      const pct = ch.LapDistPct![i] * 100;
      const isKerb = kerbZones.some(([a, b]) => pct >= a && pct <= b);

      if (isKerb) kerb++;
      else clean++;

      // Track first 100 events for location display
      if (byLocation.length < 100) {
        const worstCorner = corners.reduce((a, b) => (a.rh < b.rh ? a : b));
        byLocation.push({ pct, corner: worstCorner.name, rideHeight: worstCorner.rh * 1000 });
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
      vels.push(Math.abs((ch[chName]![i] - ch[chName]![i - 1]) * 1000 / dt));
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
  for (let i = 0; i < recordCount; i++) {
    if (!validMask[i] || i % 6 !== 0) continue;
    data.push({
      lat: accelToG(ch.LatAccel![i]),
      long: accelToG(ch.LongAccel![i]),
    });
  }

  const peakLat = Math.max(...data.map((d) => Math.abs(d.lat)), 0);
  const peakBrake = Math.min(...data.map((d) => d.long), 0);
  const peakAccel = Math.max(...data.map((d) => d.long), 0);

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

  const start = ch.FuelLevel[laps[validLaps[0]].start];
  const end = ch.FuelLevel[laps[validLaps[validLaps.length - 1]].end];
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

  for (const [name, key] of aidChannels) {
    if (!ch[key]) continue;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let cnt = 0;

    for (let i = 0; i < recordCount; i++) {
      if (!validMask[i]) continue;
      const v = ch[key]![i];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      cnt++;
    }

    if (cnt > 0) {
      aids[name] = {
        avg: sum / cnt,
        min,
        max,
        constant: max - min < ANALYSIS.CONDITIONING_CONSTANT_THRESHOLD,
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

  for (const [corner, tempO, tempM, tempI] of cornerChannels) {
    const fLate = laps[fl].samples.slice(Math.floor(laps[fl].count / 2));
    const lLate = laps[ll].samples.slice(Math.floor(laps[ll].count / 2));

    const channels = [tempO, tempM, tempI];
    let avgF = 0;
    let avgL = 0;
    let validChannels = 0;

    for (const c of channels) {
      if (!ch[c]) continue;
      avgF += avg(ch[c]!, fLate);
      avgL += avg(ch[c]!, lLate);
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
    const s = laps[l].samples;
    return {
      lap: l,
      waterTemp: ch.WaterTemp ? avg(ch.WaterTemp, s) : 0,
      oilTemp: ch.OilTemp ? avg(ch.OilTemp, s) : 0,
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

  const speedBands: RARBSpeedBand[] = bands.map(({ range, min, max }) => {
    const values: number[] = [];
    for (let i = 0; i < recordCount; i++) {
      if (!validMask[i]) continue;
      const spdKph = speedToKph(ch.Speed![i]);
      if (spdKph >= min && spdKph < max) {
        values.push(ch.dcAntiRollRear![i]);
      }
    }
    if (values.length === 0) {
      return { range, avgValue: 0, minValue: 0, maxValue: 0, sampleCount: 0 };
    }
    return {
      range,
      avgValue: values.reduce((a, b) => a + b, 0) / values.length,
      minValue: Math.min(...values),
      maxValue: Math.max(...values),
      sampleCount: values.length,
    };
  });

  // Per-lap change counting
  const perLapChanges: RARBLapChange[] = validLaps.map((l) => {
    const s = laps[l].samples;
    let changes = 0;
    for (let j = 1; j < s.length; j++) {
      if (Math.abs(ch.dcAntiRollRear![s[j]] - ch.dcAntiRollRear![s[j - 1]]) > 0.01) {
        changes++;
      }
    }
    return { lap: l, changeCount: changes };
  });

  // Best-lap RARB change log
  const bestLapLog: RARBChangeEvent[] = [];
  if (laps[bestLapIdx]) {
    const s = laps[bestLapIdx].samples;
    for (let j = 1; j < s.length; j++) {
      const from = ch.dcAntiRollRear![s[j - 1]];
      const to = ch.dcAntiRollRear![s[j]];
      if (Math.abs(to - from) > 0.01) {
        bestLapLog.push({
          pct: ch.LapDistPct ? ch.LapDistPct[s[j]] * 100 : 0,
          speed: speedToKph(ch.Speed![s[j]]),
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

    if (h < minHeight) minHeight = h;
    sumHeight += h;
    count++;
    if (h <= 0) bottomingCount++;

    if (i % 3 === 0) {
      samples.push({
        pct: ch.LapDistPct![i] * 100,
        height: h,
        speed: speedToKph(ch.Speed![i]),
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

  // Set track length for fallback lap window calculation
  const wi = parsed.sessionInfo?.WeekendInfo || {};
  parsed_weekendInfo_trackLength = wi.TrackLength || '5.8';

  const header = extractSessionHeader(parsed, driver);

  if (!ch.Speed || !ch.Lap || !ch.LapDistPct) {
    return { error: 'Missing critical channels (Speed, Lap, LapDistPct)' };
  }

  const { laps, validLaps } = detectLaps(ch, parsed.recordCount, parsed.tickRate, trackProfile);

  if (validLaps.length === 0) {
    return { error: 'No valid laps detected. Session may be too short or lap times outside expected range.' };
  }

  // Build masks
  const validMask = new Uint8Array(parsed.recordCount);
  for (const l of validLaps) {
    for (const i of laps[l].samples) validMask[i] = 1;
  }

  const hiSpeedMask = new Uint8Array(parsed.recordCount);
  for (let i = 0; i < parsed.recordCount; i++) {
    if (validMask[i] && speedToKph(ch.Speed![i]) > ANALYSIS.HIGH_SPEED_KPH) {
      hiSpeedMask[i] = 1;
    }
  }

  // Find best lap
  const lapTimes: LapTime[] = validLaps.map((l) => ({
    lap: l,
    time: laps[l].duration,
    maxSpeed: laps[l].maxSpeed,
    timeStr: `${Math.floor(laps[l].duration / 60)}:${(laps[l].duration % 60).toFixed(2).padStart(5, '0')}`,
  }));
  const bestTime = Math.min(...lapTimes.map((l) => l.time));
  const bestLap = lapTimes.find((l) => Math.abs(l.time - bestTime) < 0.01);
  const bestLapIdx = bestLap?.lap ?? validLaps[0];

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
