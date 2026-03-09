import { analyzeSession } from '../src/lib/analysis-engine';
import type { ChannelVar, IBTParsed } from '../src/lib/types';

function makeSeries(length: number, fn: (i: number) => number): Float64Array {
  const out = new Float64Array(length);
  for (let i = 0; i < length; i++) out[i] = fn(i);
  return out;
}

function buildFixture(overrides?: {
  dropChannels?: string[];
  parserWarnings?: string[];
  speedMps?: number;
  rideHeightM?: number;
  splitterM?: number;
  hotWaterC?: number;
  hotOilC?: number;
  tyreMiddleBiasC?: number;
}): { parsed: IBTParsed; parserWarnings: string[] } {
  const recordCount = 400;
  const lapLength = 120;
  const speedMps = overrides?.speedMps ?? 61; // 220 km/h
  const rideHeightM = overrides?.rideHeightM ?? 0.008;
  const splitterM = overrides?.splitterM ?? 0.006;
  const hotWaterC = overrides?.hotWaterC ?? 106;
  const hotOilC = overrides?.hotOilC ?? 124;
  const tyreMiddleBiasC = overrides?.tyreMiddleBiasC ?? 0;

  const channels: Record<string, Float64Array> = {
    SessionTime: makeSeries(recordCount, (i) => i),
    Lap: makeSeries(recordCount, (i) => Math.floor(i / lapLength) + 1),
    LapDistPct: makeSeries(recordCount, (i) => (i % lapLength) / lapLength),
    Speed: makeSeries(recordCount, () => speedMps),
    LatAccel: makeSeries(recordCount, (i) => (i % 11) * 0.08),
    LongAccel: makeSeries(recordCount, (i) => -0.3 + (i % 13) * 0.04),
    Throttle: makeSeries(recordCount, (i) => 0.45 + (i % 5) * 0.1),
    Brake: makeSeries(recordCount, (i) => (i % 17) * 0.03),
    SteeringWheelAngle: makeSeries(recordCount, (i) => (i % 20) * 0.01),
    Gear: makeSeries(recordCount, (i) => 5 + (i % 2)),
    RPM: makeSeries(recordCount, (i) => 7800 + (i % 200)),
    FuelLevel: makeSeries(recordCount, (i) => 90 - i * 0.03),
    WaterTemp: makeSeries(recordCount, () => hotWaterC),
    OilTemp: makeSeries(recordCount, () => hotOilC),
    dcBrakeBias: makeSeries(recordCount, (i) => 49.5 + ((i % 9) - 4) * 0.25),
    dcTractionControl: makeSeries(recordCount, (i) => 3 + (i % 2)),
    dcTractionControl2: makeSeries(recordCount, (i) => 2 + (i % 2)),
    dcABS: makeSeries(recordCount, (i) => 4 + (i % 3)),
    dcAntiRollFront: makeSeries(recordCount, (i) => 6 + (i % 2)),
    dcAntiRollRear: makeSeries(recordCount, (i) => 7 + (i % 3)),
    LFtempL: makeSeries(recordCount, () => 90),
    LFtempM: makeSeries(recordCount, () => 90 + tyreMiddleBiasC),
    LFtempR: makeSeries(recordCount, () => 101),
    RFtempL: makeSeries(recordCount, () => 100),
    RFtempM: makeSeries(recordCount, () => 92 + tyreMiddleBiasC),
    RFtempR: makeSeries(recordCount, () => 89),
    LRtempL: makeSeries(recordCount, () => 88),
    LRtempM: makeSeries(recordCount, () => 89 + tyreMiddleBiasC),
    LRtempR: makeSeries(recordCount, () => 99),
    RRtempL: makeSeries(recordCount, () => 96),
    RRtempM: makeSeries(recordCount, () => 91 + tyreMiddleBiasC),
    RRtempR: makeSeries(recordCount, () => 87),
    LFpressure: makeSeries(recordCount, () => 160),
    RFpressure: makeSeries(recordCount, () => 161),
    LRpressure: makeSeries(recordCount, () => 159),
    RRpressure: makeSeries(recordCount, () => 158),
    LFwearL: makeSeries(recordCount, () => 0.95),
    LFwearM: makeSeries(recordCount, () => 0.94),
    LFwearR: makeSeries(recordCount, () => 0.93),
    RFwearL: makeSeries(recordCount, () => 0.92),
    RFwearM: makeSeries(recordCount, () => 0.91),
    RFwearR: makeSeries(recordCount, () => 0.90),
    LRwearL: makeSeries(recordCount, () => 0.89),
    LRwearM: makeSeries(recordCount, () => 0.88),
    LRwearR: makeSeries(recordCount, () => 0.87),
    RRwearL: makeSeries(recordCount, () => 0.94),
    RRwearM: makeSeries(recordCount, () => 0.93),
    RRwearR: makeSeries(recordCount, () => 0.92),
    LFrideHeight: makeSeries(recordCount, (i) => rideHeightM - (i % 50 === 0 ? 0.011 : 0)),
    RFrideHeight: makeSeries(recordCount, (i) => rideHeightM - (i % 60 === 0 ? 0.01 : 0)),
    LRrideHeight: makeSeries(recordCount, () => 0.02),
    RRrideHeight: makeSeries(recordCount, () => 0.02),
    CFSRrideHeight: makeSeries(recordCount, () => splitterM),
    HFshockDefl: makeSeries(recordCount, (i) => (i % 20) * 0.0005),
    LFshockDefl: makeSeries(recordCount, (i) => (i % 17) * 0.0008),
    RFshockDefl: makeSeries(recordCount, (i) => (i % 11) * 0.0012),
    LRshockDefl: makeSeries(recordCount, (i) => (i % 13) * 0.0009),
    RRshockDefl: makeSeries(recordCount, (i) => (i % 7) * 0.0015),
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

  const parsed: IBTParsed = {
    sessionInfo: {
      WeekendInfo: {
        TrackDisplayName: 'Sebring International Raceway',
        TrackConfigName: 'International',
        TrackLength: '6.0 km',
        TrackSurfaceTemp: '34 C',
        TrackAirTemp: '24 C',
      },
      DriverInfo: {
        DriverCarIdx: 0,
        Drivers: [
          {
            CarIdx: 0,
            UserName: 'Regression Fixture',
            CarScreenName: 'Ferrari 499P',
            CarIsPaceCar: 0,
          },
        ],
      },
      CarSetup: { Chassis: { Front: { RideHeight: 39 } } },
    },
    vars,
    readChannel: (name: string) => channels[name] ?? null,
    recordCount,
    tickRate: 1,
  };

  return { parsed, parserWarnings: overrides?.parserWarnings ?? [] };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function run(): void {
  const baseline = buildFixture({ parserWarnings: ['Very short session warning'] });
  const baselineResult = analyzeSession(baseline.parsed, {
    id: 'ferrari_499p',
    name: 'Ferrari 499P',
    screenNameMatch: ['Ferrari 499P'],
    chassis: 'ferrari_lmh',
    architecture: 'lmh',
    hasBrakeMigration: true,
    pushrodParamName: 'PushrodLengthOffset',
    arbValueType: 'indexed',
    diffArchitecture: 'front_and_rear',
    setupPathPrefix: { brakesDiff: 'BrakesInCar', dampers: 'DampersInGarage' },
    defaultBrakeBias: 50.5,
    knownQuirks: ['Indexed ARB blades'],
  }, {
    id: 'sebring',
    name: 'Sebring',
    displayNameMatch: ['sebring'],
    length_km: 6,
    type: 'road',
    kerbZones: [[10, 15]],
    validLapWindow: [80, 160],
    setupFocus: 'Protect floor over bumps before chasing balance.',
    mandatoryGearStack: null,
  }, baseline.parserWarnings);

  assert(!('error' in baselineResult), 'baseline analysis should succeed');
  assert(baselineResult.recommendations.length > 0, 'baseline should generate recommendations');
  assert(
    baselineResult.recommendations.some((r) => r.category === 'PLATFORM'),
    'baseline should include a platform recommendation'
  );

  const lowCoverage = buildFixture({
    dropChannels: ['LFtempL', 'LFtempM', 'LFtempR', 'RFtempL', 'RFtempM', 'RFtempR', 'LRtempL', 'LRtempM', 'LRtempR', 'RRtempL', 'RRtempM', 'RRtempR'],
  });
  const lowCoverageResult = analyzeSession(lowCoverage.parsed, undefined, undefined, lowCoverage.parserWarnings);
  assert(!('error' in lowCoverageResult), 'low coverage analysis should still succeed');
  assert(lowCoverageResult.dataQuality.sectionConfidence.tyres === 'LOW', 'tyre confidence should degrade when tyre channels are missing');

  const noCritical = buildFixture({ dropChannels: ['Speed'] });
  const noCriticalResult = analyzeSession(noCritical.parsed, undefined, undefined, []);
  assert('error' in noCriticalResult, 'missing critical channel should fail analysis');

  const highThermal = buildFixture({ hotWaterC: 118, hotOilC: 137 });
  const highThermalResult = analyzeSession(highThermal.parsed, undefined, undefined, []);
  assert(!('error' in highThermalResult), 'high thermal analysis should succeed');
  assert(
    highThermalResult.recommendations.some((r) => r.id === 'engine-temperature-control'),
    'high thermal case should emit engine temperature recommendation'
  );

  console.log('analysis-regression: all checks passed');
}

run();
