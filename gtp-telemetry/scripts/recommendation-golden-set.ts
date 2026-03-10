import { analyzeSession } from '../src/lib/analysis-engine';
import type { ChannelVar, IBTParsed } from '../src/lib/types';

function makeSeries(length: number, fn: (i: number) => number): Float64Array {
  const out = new Float64Array(length);
  for (let i = 0; i < length; i++) out[i] = fn(i);
  return out;
}

function buildFixture(overrides?: {
  speedMps?: number;
  splitterM?: number;
  rideHeightM?: number;
  dropChannels?: string[];
}): IBTParsed {
  const recordCount = 420;
  const lapLength = 120;
  const speedMps = overrides?.speedMps ?? 62;
  const splitterM = overrides?.splitterM ?? 0.004;
  const rideHeightM = overrides?.rideHeightM ?? 0.008;

  const channels: Record<string, Float64Array> = {
    SessionTime: makeSeries(recordCount, (i) => i),
    Lap: makeSeries(recordCount, (i) => Math.floor(i / lapLength) + 1),
    LapDistPct: makeSeries(recordCount, (i) => (i % lapLength) / lapLength),
    Speed: makeSeries(recordCount, () => speedMps),
    LatAccel: makeSeries(recordCount, (i) => 0.6 + (i % 9) * 0.06),
    LongAccel: makeSeries(recordCount, (i) => -0.5 + (i % 13) * 0.06),
    Throttle: makeSeries(recordCount, (i) => 0.48 + (i % 7) * 0.06),
    Brake: makeSeries(recordCount, (i) => (i % 11) * 0.05),
    SteeringWheelAngle: makeSeries(recordCount, (i) => (i % 20) * 0.01),
    Gear: makeSeries(recordCount, () => 6),
    RPM: makeSeries(recordCount, (i) => 7600 + (i % 150)),
    FuelLevel: makeSeries(recordCount, (i) => 88 - i * 0.03),
    WaterTemp: makeSeries(recordCount, () => 108),
    OilTemp: makeSeries(recordCount, () => 126),
    dcBrakeBias: makeSeries(recordCount, () => 50.8),
    dcTractionControl: makeSeries(recordCount, (i) => 3 + (i % 2)),
    dcTractionControl2: makeSeries(recordCount, (i) => 2 + (i % 2)),
    dcABS: makeSeries(recordCount, () => 5),
    dcAntiRollFront: makeSeries(recordCount, () => 5),
    dcAntiRollRear: makeSeries(recordCount, (i) => 6 + (i % 2)),
    LFtempL: makeSeries(recordCount, () => 92),
    LFtempM: makeSeries(recordCount, () => 96),
    LFtempR: makeSeries(recordCount, () => 102),
    RFtempL: makeSeries(recordCount, () => 100),
    RFtempM: makeSeries(recordCount, () => 95),
    RFtempR: makeSeries(recordCount, () => 89),
    LRtempL: makeSeries(recordCount, () => 89),
    LRtempM: makeSeries(recordCount, () => 92),
    LRtempR: makeSeries(recordCount, () => 98),
    RRtempL: makeSeries(recordCount, () => 96),
    RRtempM: makeSeries(recordCount, () => 92),
    RRtempR: makeSeries(recordCount, () => 88),
    LFpressure: makeSeries(recordCount, () => 160),
    RFpressure: makeSeries(recordCount, () => 159),
    LRpressure: makeSeries(recordCount, () => 158),
    RRpressure: makeSeries(recordCount, () => 157),
    LFwearL: makeSeries(recordCount, () => 0.95),
    LFwearM: makeSeries(recordCount, () => 0.94),
    LFwearR: makeSeries(recordCount, () => 0.93),
    RFwearL: makeSeries(recordCount, () => 0.92),
    RFwearM: makeSeries(recordCount, () => 0.91),
    RFwearR: makeSeries(recordCount, () => 0.9),
    LRwearL: makeSeries(recordCount, () => 0.89),
    LRwearM: makeSeries(recordCount, () => 0.88),
    LRwearR: makeSeries(recordCount, () => 0.87),
    RRwearL: makeSeries(recordCount, () => 0.92),
    RRwearM: makeSeries(recordCount, () => 0.91),
    RRwearR: makeSeries(recordCount, () => 0.9),
    LFrideHeight: makeSeries(recordCount, (i) => rideHeightM - (i % 35 === 0 ? 0.011 : 0)),
    RFrideHeight: makeSeries(recordCount, (i) => rideHeightM - (i % 40 === 0 ? 0.01 : 0)),
    LRrideHeight: makeSeries(recordCount, () => 0.02),
    RRrideHeight: makeSeries(recordCount, () => 0.02),
    CFSRrideHeight: makeSeries(recordCount, () => splitterM),
    HFshockDefl: makeSeries(recordCount, (i) => (i % 18) * 0.0005),
    LFshockDefl: makeSeries(recordCount, (i) => (i % 14) * 0.001),
    RFshockDefl: makeSeries(recordCount, (i) => (i % 10) * 0.0012),
    LRshockDefl: makeSeries(recordCount, (i) => (i % 12) * 0.0009),
    RRshockDefl: makeSeries(recordCount, (i) => (i % 8) * 0.0014),
  };

  for (const channel of overrides?.dropChannels || []) {
    delete channels[channel];
  }

  const vars: Record<string, ChannelVar> = {};
  for (const name of Object.keys(channels)) {
    vars[name] = {
      type: 5,
      offset: 0,
      count: 1,
      desc: name,
      unit: name.includes('pressure')
        ? 'kPa'
        : name.includes('Height') || name.includes('Defl')
          ? 'm'
          : name.includes('Accel')
            ? 'm/s^2'
            : name.includes('Speed')
              ? 'm/s'
              : name.includes('Temp')
                ? 'C'
                : '',
    };
  }

  return {
    sessionInfo: {
      WeekendInfo: {
        TrackDisplayName: 'Sebring International Raceway',
        TrackConfigName: 'International',
        TrackLength: '6.0 km',
        TrackSurfaceTemp: '35 C',
        TrackAirTemp: '24 C',
      },
      DriverInfo: {
        DriverCarIdx: 0,
        Drivers: [{ CarIdx: 0, UserName: 'Golden Fixture', CarScreenName: 'Cadillac V-Series.R', CarIsPaceCar: 0 }],
      },
      CarSetup: {
        Chassis: {
          Front: {
            HeaveSpringPerchOffset: -25,
            PushrodLengthOffset: -28,
          },
        },
      },
    },
    vars,
    readChannel: (name: string) => channels[name] ?? null,
    recordCount,
    tickRate: 1,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function runGoldenCase(): void {
  const result = analyzeSession(buildFixture(), undefined, undefined, []);
  assert(!('error' in result), 'golden case should analyze successfully');
  assert(result.recommendations.length > 0, 'golden case should produce recommendations');
  assert(result.segmentFeatures.length >= 3, 'segment features should include phase/speed coverage');
  assert(result.recommendations.every((rec) => rec.expectedGain?.source === 'counterfactual-model'), 'recommendations should use impact model source');
  assert(result.recommendations.some((rec) => typeof rec.rankScore === 'number' && rec.rankScore > 0), 'recommendations should include rank scores');
}

function runLowCoverageCase(): void {
  const result = analyzeSession(
    buildFixture({ dropChannels: ['LFtempL', 'LFtempM', 'LFtempR', 'RFtempL', 'RFtempM', 'RFtempR', 'LRtempL', 'LRtempM', 'LRtempR', 'RRtempL', 'RRtempM', 'RRtempR', 'LFwearL', 'LFwearM', 'LFwearR', 'RFwearL', 'RFwearM', 'RFwearR'] }),
    undefined,
    undefined,
    []
  );
  assert(!('error' in result), 'low coverage case should still analyze');
  assert(result.recommendationGuardrails.length > 0, 'low coverage should emit recommendation guardrails');
  assert(result.recommendationGuardrails.some((g) => g.id === 'guardrail-missing-channels'), 'low coverage should flag missing channels guardrail');
}

function run(): void {
  runGoldenCase();
  runLowCoverageCase();
  console.log('recommendation-golden-set: all checks passed');
}

run();
