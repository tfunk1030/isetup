// ═══════════════════════════════════════════════════════════════
// FINDING GENERATOR — Produces TelemetryFindings from raw data
// This is the "Stage 2" of the evidence chain pipeline:
//   Raw Data → FINDINGS → Diagnoses → Recommendations
//
// Each finding is a computed observation with evidence backing.
// Findings carry lap consistency and corner specificity so that
// the recommendation builder can distinguish patterns from noise.
// ═══════════════════════════════════════════════════════════════

import type { TelemetryFinding } from './finding-types';
import type {
  TyreTempLap,
  TyrePressureLap,
  TyreWearLap,
  BottomingResult,
  ShockVelCorner,
  EngineTempsLap,
  DriverAid,
  SplitterData,
  ConditioningCorner,
  CarProfile,
} from './types';
import { TYRE_TEMP, TYRE_PRESSURE, ANALYSIS, RECOMMENDATION, SHOCK_VELOCITY, ENGINE_TEMP } from './constants';
import type { OscillationAnalysis } from './dsp/fft-analysis';

// ─── Finding ID helpers ─────────────────────────────────────────

let findingCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}-${++findingCounter}`;
}

/** Reset counter between analysis runs */
export function resetFindingCounter(): void {
  findingCounter = 0;
}

// ─── Master finding generation ──────────────────────────────────

export interface FindingGeneratorInput {
  tyreTempData: TyreTempLap[];
  tyrePressureData: TyrePressureLap[];
  tyreWearData: TyreWearLap[];
  bottoming: BottomingResult;
  shockVelStats: Record<string, ShockVelCorner>;
  engineTemps: EngineTempsLap[];
  aids: Record<string, DriverAid>;
  splitter: SplitterData | null;
  conditioning: Record<string, ConditioningCorner> | null;
  oscillation: OscillationAnalysis | null;
  validLaps: number[];
  carProfile: CarProfile | null;
  /** Dynamic high-speed threshold (0.7 * maxSpeed) */
  highSpeedKph: number;
}

/**
 * Generate all telemetry findings from analysis data.
 * Returns a flat array of findings, sorted by severity then confidence.
 */
export function generateFindings(input: FindingGeneratorInput): TelemetryFinding[] {
  resetFindingCounter();
  const findings: TelemetryFinding[] = [];

  findings.push(...generateThermalFindings(input));
  findings.push(...generatePressureFindings(input));
  findings.push(...generateWearFindings(input));
  findings.push(...generateAeroFindings(input));
  findings.push(...generateDynamicsFindings(input));
  findings.push(...generateDriverAidFindings(input));
  findings.push(...generateEngineThermalFindings(input));

  // Sort: CRITICAL first, then WARNING, then INFO; within severity by confidence descending
  const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  findings.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.confidence - a.confidence;
  });

  return findings;
}

// ─── Thermal findings (tyre temps) ──────────────────────────────

function generateThermalFindings(input: FindingGeneratorInput): TelemetryFinding[] {
  const findings: TelemetryFinding[] = [];
  const { tyreTempData, validLaps, conditioning } = input;
  if (tyreTempData.length === 0) return findings;

  const corners = ['LF', 'RF', 'LR', 'RR'] as const;

  // Per-corner analysis across laps
  for (const corner of corners) {
    const temps = tyreTempData.map(lap => lap[corner]);
    if (temps.length === 0) continue;

    // Temperature gradient (inner-outer spread)
    const spreads = temps.map(t => Math.abs(t.I - t.O));
    const avgSpread = average(spreads);
    const lapsAboveWarn = spreads.filter(s => s >= RECOMMENDATION.TYRE_TEMP_SPREAD_WARN_C).length;
    const consistency = lapsAboveWarn / temps.length;

    if (avgSpread >= RECOMMENDATION.TYRE_TEMP_SPREAD_WARN_C) {
      const isCritical = avgSpread >= RECOMMENDATION.TYRE_TEMP_SPREAD_CRITICAL_C;
      const innerHotter = average(temps.map(t => t.I)) > average(temps.map(t => t.O));
      findings.push({
        id: nextId(`thermal-${corner.toLowerCase()}-gradient`),
        category: 'thermal',
        observation: `${corner} tire has ${avgSpread.toFixed(1)}C inner-outer spread (${innerHotter ? 'inner' : 'outer'} hotter)`,
        metric: `tyreTempGradient.${corner}`,
        value: avgSpread,
        normalRange: [0, RECOMMENDATION.TYRE_TEMP_SPREAD_WARN_C],
        deviation: avgSpread / RECOMMENDATION.TYRE_TEMP_SPREAD_WARN_C,
        deviationDirection: 'above',
        dataPoints: temps.length,
        lapConsistency: consistency,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: Math.min(1, consistency * 1.2),
        severity: isCritical ? 'CRITICAL' : 'WARNING',
      });
    }

    // Crowning (middle hotter than edges)
    const crownDeltas = temps.map(t => t.M - (t.O + t.I) / 2);
    const avgCrown = average(crownDeltas);
    if (avgCrown >= RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C) {
      findings.push({
        id: nextId(`thermal-${corner.toLowerCase()}-crowning`),
        category: 'thermal',
        observation: `${corner} tire showing crowning pattern (middle ${avgCrown.toFixed(1)}C hotter) - over-inflation likely`,
        metric: `tyreCrowning.${corner}`,
        value: avgCrown,
        normalRange: [-RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C, RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C],
        deviation: avgCrown / RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C,
        deviationDirection: 'above',
        dataPoints: temps.length,
        lapConsistency: crownDeltas.filter(d => d >= RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C).length / temps.length,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.7,
        severity: 'WARNING',
      });
    }

    // Cupping (middle cooler than edges)
    if (avgCrown <= -RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C) {
      findings.push({
        id: nextId(`thermal-${corner.toLowerCase()}-cupping`),
        category: 'thermal',
        observation: `${corner} tire showing cupping pattern (middle ${Math.abs(avgCrown).toFixed(1)}C cooler) - under-inflation likely`,
        metric: `tyreCupping.${corner}`,
        value: Math.abs(avgCrown),
        normalRange: [-RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C, RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C],
        deviation: Math.abs(avgCrown) / RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C,
        deviationDirection: 'below',
        dataPoints: temps.length,
        lapConsistency: crownDeltas.filter(d => d <= -RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C).length / temps.length,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.7,
        severity: 'WARNING',
      });
    }

    // Absolute temperature check (NEW - was missing entirely)
    const avgTemp = average(temps.map(t => (t.O + t.M + t.I) / 3));
    if (avgTemp > TYRE_TEMP.HOT) {
      findings.push({
        id: nextId(`thermal-${corner.toLowerCase()}-overheating`),
        category: 'thermal',
        observation: `${corner} tire overheating: avg ${avgTemp.toFixed(0)}C exceeds ${TYRE_TEMP.HOT}C limit`,
        metric: `tyreAbsTemp.${corner}`,
        value: avgTemp,
        normalRange: [TYRE_TEMP.OK_MIN, TYRE_TEMP.OK_MAX],
        deviation: (avgTemp - TYRE_TEMP.OK_MAX) / (TYRE_TEMP.HOT - TYRE_TEMP.OK_MAX),
        deviationDirection: 'above',
        dataPoints: temps.length,
        lapConsistency: temps.filter(t => (t.O + t.M + t.I) / 3 > TYRE_TEMP.HOT).length / temps.length,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.85,
        severity: 'WARNING',
      });
    } else if (avgTemp < TYRE_TEMP.COLD) {
      findings.push({
        id: nextId(`thermal-${corner.toLowerCase()}-cold`),
        category: 'thermal',
        observation: `${corner} tire below operating window: avg ${avgTemp.toFixed(0)}C under ${TYRE_TEMP.COLD}C minimum`,
        metric: `tyreAbsTemp.${corner}`,
        value: avgTemp,
        normalRange: [TYRE_TEMP.OK_MIN, TYRE_TEMP.OK_MAX],
        deviation: (TYRE_TEMP.OK_MIN - avgTemp) / TYRE_TEMP.OK_MIN,
        deviationDirection: 'below',
        dataPoints: temps.length,
        lapConsistency: temps.filter(t => (t.O + t.M + t.I) / 3 < TYRE_TEMP.COLD).length / temps.length,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.75,
        severity: 'WARNING',
      });
    }
  }

  // Front-rear axle temperature delta (balance finding)
  if (tyreTempData.length > 0) {
    const frontAvgs = tyreTempData.map(lap => {
      const lf = (lap.LF.O + lap.LF.M + lap.LF.I) / 3;
      const rf = (lap.RF.O + lap.RF.M + lap.RF.I) / 3;
      return (lf + rf) / 2;
    });
    const rearAvgs = tyreTempData.map(lap => {
      const lr = (lap.LR.O + lap.LR.M + lap.LR.I) / 3;
      const rr = (lap.RR.O + lap.RR.M + lap.RR.I) / 3;
      return (lr + rr) / 2;
    });
    const axleDelta = average(frontAvgs) - average(rearAvgs);
    const AXLE_DELTA_THRESHOLD = 6; // degrees C

    if (Math.abs(axleDelta) >= AXLE_DELTA_THRESHOLD) {
      const frontHotter = axleDelta > 0;
      findings.push({
        id: nextId('thermal-axle-imbalance'),
        category: 'balance',
        observation: `${frontHotter ? 'Front' : 'Rear'} axle ${Math.abs(axleDelta).toFixed(1)}C hotter than ${frontHotter ? 'rear' : 'front'} - ${frontHotter ? 'front working harder (possible understeer)' : 'rear working harder (possible oversteer)'}`,
        metric: 'tyreAxleDelta',
        value: axleDelta,
        normalRange: [-AXLE_DELTA_THRESHOLD, AXLE_DELTA_THRESHOLD],
        deviation: Math.abs(axleDelta) / AXLE_DELTA_THRESHOLD,
        deviationDirection: frontHotter ? 'above' : 'below',
        dataPoints: tyreTempData.length,
        lapConsistency: 1.0,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.7,
        severity: 'INFO',
      });
    }
  }

  // Conditioning findings
  if (conditioning) {
    for (const corner of corners) {
      const cond = conditioning[corner];
      if (!cond) continue;
      if (cond.lapsTo85 > 8 && cond.rate > 0) {
        findings.push({
          id: nextId(`thermal-${corner.toLowerCase()}-slow-conditioning`),
          category: 'thermal',
          observation: `${corner} tire slow to reach operating window: ~${cond.lapsTo85} laps to 85C at ${cond.rate.toFixed(1)}C/lap`,
          metric: `conditioning.${corner}.lapsTo85`,
          value: cond.lapsTo85,
          normalRange: [1, 6],
          deviation: cond.lapsTo85 / 6,
          deviationDirection: 'above',
          dataPoints: validLaps.length,
          lapConsistency: 1.0,
          cornerIds: null,
          relatedFindingIds: [],
          confidence: 0.6,
          severity: 'INFO',
        });
      }
    }
  }

  return findings;
}

// ─── Pressure findings ──────────────────────────────────────────

function generatePressureFindings(input: FindingGeneratorInput): TelemetryFinding[] {
  const findings: TelemetryFinding[] = [];
  const { tyrePressureData } = input;
  if (tyrePressureData.length === 0) return findings;

  const corners = ['LF', 'RF', 'LR', 'RR'] as const;

  for (const corner of corners) {
    const pressures = tyrePressureData.map(lap => lap[corner]);
    if (pressures.length < 2) continue;

    // Pressure build rate per lap (NEW finding)
    const firstPressure = pressures[0];
    const lastPressure = pressures[pressures.length - 1];
    const buildRate = (lastPressure - firstPressure) / (pressures.length - 1);

    if (Math.abs(buildRate) > 0.3) { // > 0.3 PSI/lap build rate is notable
      findings.push({
        id: nextId(`pressure-${corner.toLowerCase()}-build`),
        category: 'mechanical',
        observation: `${corner} pressure ${buildRate > 0 ? 'rising' : 'falling'} at ${Math.abs(buildRate).toFixed(2)} PSI/lap over ${pressures.length} laps`,
        metric: `pressureBuildRate.${corner}`,
        value: buildRate,
        normalRange: [-0.15, 0.15],
        deviation: Math.abs(buildRate) / 0.15,
        deviationDirection: buildRate > 0 ? 'above' : 'below',
        dataPoints: pressures.length,
        lapConsistency: 1.0,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.65,
        severity: Math.abs(buildRate) > 0.5 ? 'WARNING' : 'INFO',
      });
    }
  }

  // Absolute pressure threshold checks (HIGH and LOW)
  if (tyrePressureData.length > 0) {
    const lastLapP = tyrePressureData[tyrePressureData.length - 1];
    for (const corner of corners) {
      const psi = lastLapP[corner];
      if (psi > TYRE_PRESSURE.HIGH_THRESHOLD) {
        findings.push({
          id: nextId(`pressure-${corner.toLowerCase()}-high`),
          category: 'mechanical',
          observation: `${corner} hot pressure ${psi.toFixed(1)} PSI exceeds ${TYRE_PRESSURE.HIGH_THRESHOLD} PSI threshold — tyre overheating, sliding, or over-inflated cold`,
          metric: `pressureHot.${corner}`,
          value: psi,
          normalRange: [TYRE_PRESSURE.LOW_THRESHOLD, TYRE_PRESSURE.HIGH_THRESHOLD],
          deviation: (psi - TYRE_PRESSURE.HIGH_THRESHOLD) / 2,
          deviationDirection: 'above',
          dataPoints: tyrePressureData.length,
          lapConsistency: 1.0,
          cornerIds: null,
          relatedFindingIds: [],
          confidence: 0.8,
          severity: psi > TYRE_PRESSURE.HIGH_THRESHOLD + 2 ? 'CRITICAL' : 'WARNING',
        });
      } else if (psi < TYRE_PRESSURE.LOW_THRESHOLD) {
        findings.push({
          id: nextId(`pressure-${corner.toLowerCase()}-low`),
          category: 'mechanical',
          observation: `${corner} hot pressure ${psi.toFixed(1)} PSI below ${TYRE_PRESSURE.LOW_THRESHOLD} PSI threshold — underinflated, poor turn-in response`,
          metric: `pressureHot.${corner}`,
          value: psi,
          normalRange: [TYRE_PRESSURE.LOW_THRESHOLD, TYRE_PRESSURE.HIGH_THRESHOLD],
          deviation: (TYRE_PRESSURE.LOW_THRESHOLD - psi) / 2,
          deviationDirection: 'below',
          dataPoints: tyrePressureData.length,
          lapConsistency: 1.0,
          cornerIds: null,
          relatedFindingIds: [],
          confidence: 0.8,
          severity: psi < TYRE_PRESSURE.LOW_THRESHOLD - 2 ? 'CRITICAL' : 'WARNING',
        });
      }
    }
  }

  // Front-rear pressure asymmetry
  if (tyrePressureData.length > 0) {
    const lastLap = tyrePressureData[tyrePressureData.length - 1];
    const crossDelta = Math.abs(lastLap.LF - lastLap.RF);

    if (crossDelta > 1.0) {
      findings.push({
        id: nextId('pressure-front-asymmetry'),
        category: 'mechanical',
        observation: `Front tires ${crossDelta.toFixed(1)} PSI apart (LF: ${lastLap.LF.toFixed(1)}, RF: ${lastLap.RF.toFixed(1)}) - may indicate setup or driving asymmetry`,
        metric: 'pressureAsymmetry.front',
        value: crossDelta,
        normalRange: [0, 0.8],
        deviation: crossDelta / 0.8,
        deviationDirection: 'above',
        dataPoints: tyrePressureData.length,
        lapConsistency: 1.0,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.6,
        severity: 'INFO',
      });
    }
  }

  return findings;
}

// ─── Wear findings ──────────────────────────────────────────────

function generateWearFindings(input: FindingGeneratorInput): TelemetryFinding[] {
  const findings: TelemetryFinding[] = [];
  const { tyreWearData, validLaps } = input;
  if (tyreWearData.length === 0) return findings;

  const corners = ['LF', 'RF', 'LR', 'RR'] as const;

  for (const corner of corners) {
    const wears = tyreWearData.map(lap => lap[corner]);
    if (wears.length === 0) continue;

    const lastWear = wears[wears.length - 1];
    const avgRemaining = lastWear.avg;

    // Overall wear rate
    if (avgRemaining < ANALYSIS.TYRE_WEAR_RISK_THRESHOLD) {
      const wearRate = (100 - avgRemaining) / validLaps.length;
      findings.push({
        id: nextId(`wear-${corner.toLowerCase()}-degradation`),
        category: 'mechanical',
        observation: `${corner} tire at ${avgRemaining.toFixed(0)}% tread remaining (${wearRate.toFixed(1)}%/lap) - approaching replacement threshold`,
        metric: `tyreWear.${corner}`,
        value: avgRemaining,
        normalRange: [ANALYSIS.TYRE_WEAR_RISK_THRESHOLD, 100],
        deviation: (ANALYSIS.TYRE_WEAR_RISK_THRESHOLD - avgRemaining) / ANALYSIS.TYRE_WEAR_RISK_THRESHOLD,
        deviationDirection: 'below',
        dataPoints: wears.length,
        lapConsistency: 1.0,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.8,
        severity: avgRemaining < 80 ? 'CRITICAL' : 'WARNING',
      });
    }

    // Asymmetric wear (NEW - inner vs outer differential)
    // Note: The L/R mapping varies by side (left vs right tires)
    // For simplicity, we check the spread of L vs R wear
    const wearSpread = Math.abs(lastWear.L - lastWear.R);

    if (wearSpread > 3) { // > 3% wear differential is significant
      findings.push({
        id: nextId(`wear-${corner.toLowerCase()}-asymmetric`),
        category: 'mechanical',
        observation: `${corner} tire showing ${wearSpread.toFixed(1)}% asymmetric wear across tread - possible camber or alignment issue`,
        metric: `wearAsymmetry.${corner}`,
        value: wearSpread,
        normalRange: [0, 2],
        deviation: wearSpread / 2,
        deviationDirection: 'above',
        dataPoints: wears.length,
        lapConsistency: 1.0,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.65,
        severity: wearSpread > 5 ? 'WARNING' : 'INFO',
      });
    }
  }

  return findings;
}

// ─── Aero platform findings ─────────────────────────────────────

function generateAeroFindings(input: FindingGeneratorInput): TelemetryFinding[] {
  const findings: TelemetryFinding[] = [];
  const { bottoming, splitter, oscillation } = input;

  // Bottoming
  if (bottoming.clean >= RECOMMENDATION.PLATFORM_CLEAN_BOTTOMING_WARN) {
    const isCritical = bottoming.clean >= RECOMMENDATION.PLATFORM_CLEAN_BOTTOMING_CRITICAL;
    findings.push({
      id: nextId('aero-bottoming-clean'),
      category: 'aero',
      observation: `${bottoming.clean} clean-track bottoming events detected (excluding kerbs)`,
      metric: 'bottomingCleanCount',
      value: bottoming.clean,
      normalRange: [0, RECOMMENDATION.PLATFORM_CLEAN_BOTTOMING_WARN],
      deviation: bottoming.clean / RECOMMENDATION.PLATFORM_CLEAN_BOTTOMING_WARN,
      deviationDirection: 'above',
      dataPoints: bottoming.byLocation.length,
      lapConsistency: 1.0,
      cornerIds: null,
      relatedFindingIds: [],
      confidence: 0.9,
      severity: isCritical ? 'CRITICAL' : 'WARNING',
    });
  }

  // Splitter proximity
  if (splitter) {
    if (splitter.minHeight <= RECOMMENDATION.SPLITTER_MIN_HEIGHT_CRITICAL_MM) {
      findings.push({
        id: nextId('aero-splitter-critical'),
        category: 'aero',
        observation: `Front splitter minimum clearance ${splitter.minHeight.toFixed(1)}mm - risk of aero stall or floor damage`,
        metric: 'splitterMinHeight',
        value: splitter.minHeight,
        normalRange: [RECOMMENDATION.SPLITTER_MIN_HEIGHT_WARN_MM, 30],
        deviation: (RECOMMENDATION.SPLITTER_MIN_HEIGHT_WARN_MM - splitter.minHeight) / RECOMMENDATION.SPLITTER_MIN_HEIGHT_WARN_MM,
        deviationDirection: 'below',
        dataPoints: splitter.samples.length,
        lapConsistency: 1.0,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.9,
        severity: 'CRITICAL',
      });
    } else if (splitter.minHeight <= RECOMMENDATION.SPLITTER_MIN_HEIGHT_WARN_MM) {
      findings.push({
        id: nextId('aero-splitter-warn'),
        category: 'aero',
        observation: `Front splitter minimum clearance ${splitter.minHeight.toFixed(1)}mm - approaching danger zone`,
        metric: 'splitterMinHeight',
        value: splitter.minHeight,
        normalRange: [RECOMMENDATION.SPLITTER_MIN_HEIGHT_WARN_MM, 30],
        deviation: (RECOMMENDATION.SPLITTER_MIN_HEIGHT_WARN_MM - splitter.minHeight) / RECOMMENDATION.SPLITTER_MIN_HEIGHT_WARN_MM,
        deviationDirection: 'below',
        dataPoints: splitter.samples.length,
        lapConsistency: 1.0,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.8,
        severity: 'WARNING',
      });
    }
  }

  // Porpoising (from FFT analysis)
  if (oscillation && oscillation.porpoisingDetected) {
    findings.push({
      id: nextId('aero-porpoising'),
      category: 'dynamics',
      observation: `Porpoising detected at ${oscillation.dominantFrequencyHz.toFixed(1)}Hz with ${oscillation.dominantAmplitudeMm.toFixed(1)}mm amplitude (${oscillation.severity})`,
      metric: 'porpoisingAmplitude',
      value: oscillation.dominantAmplitudeMm,
      normalRange: [0, 1.5],
      deviation: oscillation.dominantAmplitudeMm / 1.5,
      deviationDirection: 'above',
      dataPoints: oscillation.segmentsAnalyzed,
      lapConsistency: 1.0,
      cornerIds: null,
      relatedFindingIds: [],
      confidence: 0.85,
      severity: oscillation.severity === 'severe' ? 'CRITICAL' : 'WARNING',
    });
  }

  return findings;
}

// ─── Dynamics findings (shock velocities) ───────────────────────

function generateDynamicsFindings(input: FindingGeneratorInput): TelemetryFinding[] {
  const findings: TelemetryFinding[] = [];
  const { shockVelStats } = input;

  const cornerNames = ['LF', 'RF', 'LR', 'RR'];
  for (const corner of cornerNames) {
    const hsComp = shockVelStats[`${corner}_hsComp`];
    if (!hsComp) continue;

    if (hsComp.peak >= SHOCK_VELOCITY.EXTREME) {
      findings.push({
        id: nextId(`dynamics-${corner.toLowerCase()}-shock-extreme`),
        category: 'dynamics',
        observation: `${corner} shock velocity extreme: peak ${hsComp.peak.toFixed(0)} mm/s (p99: ${hsComp.p99.toFixed(0)}) - damper may be operating beyond effective range`,
        metric: `shockVelocity.${corner}.peak`,
        value: hsComp.peak,
        normalRange: [0, SHOCK_VELOCITY.HIGH],
        deviation: hsComp.peak / SHOCK_VELOCITY.HIGH,
        deviationDirection: 'above',
        dataPoints: 1,
        lapConsistency: 1.0,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.8,
        severity: 'CRITICAL',
      });
    } else if (hsComp.peak >= SHOCK_VELOCITY.HIGH) {
      findings.push({
        id: nextId(`dynamics-${corner.toLowerCase()}-shock-high`),
        category: 'dynamics',
        observation: `${corner} shock velocity elevated: peak ${hsComp.peak.toFixed(0)} mm/s (p95: ${hsComp.p95.toFixed(0)})`,
        metric: `shockVelocity.${corner}.peak`,
        value: hsComp.peak,
        normalRange: [0, SHOCK_VELOCITY.HIGH],
        deviation: hsComp.peak / SHOCK_VELOCITY.HIGH,
        deviationDirection: 'above',
        dataPoints: 1,
        lapConsistency: 1.0,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.7,
        severity: 'WARNING',
      });
    }
  }

  return findings;
}

// ─── Driver aid findings ────────────────────────────────────────

function generateDriverAidFindings(input: FindingGeneratorInput): TelemetryFinding[] {
  const findings: TelemetryFinding[] = [];
  const { aids, carProfile } = input;

  // Brake bias drift
  const brakeBias = aids['dcBrakeBias'];
  if (brakeBias && !brakeBias.constant) {
    const range = brakeBias.max - brakeBias.min;
    if (range > 1.0) {
      findings.push({
        id: nextId('aids-brake-bias-drift'),
        category: 'driver-aids',
        observation: `Brake bias adjusted ${range.toFixed(1)}% during stint (${brakeBias.min.toFixed(1)}-${brakeBias.max.toFixed(1)}%) - frequent changes may indicate fundamental setup imbalance`,
        metric: 'aidsDrift.brakeBias',
        value: range,
        normalRange: [0, 1.0],
        deviation: range / 1.0,
        deviationDirection: 'above',
        dataPoints: 1,
        lapConsistency: 1.0,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.7,
        severity: range > 2.0 ? 'WARNING' : 'INFO',
      });
    }

    // Brake bias vs car default
    if (carProfile) {
      const biasOffset = Math.abs(brakeBias.avg - carProfile.defaultBrakeBias);
      if (biasOffset > 2.0) {
        findings.push({
          id: nextId('aids-brake-bias-far'),
          category: 'driver-aids',
          observation: `Brake bias ${brakeBias.avg.toFixed(1)}% is ${biasOffset.toFixed(1)}% from ${carProfile.name} baseline (${carProfile.defaultBrakeBias}%)`,
          metric: 'aidsBiasOffset',
          value: biasOffset,
          normalRange: [0, 1.0],
          deviation: biasOffset / 1.0,
          deviationDirection: 'above',
          dataPoints: 1,
          lapConsistency: 1.0,
          cornerIds: null,
          relatedFindingIds: [],
          confidence: 0.6,
          severity: 'CRITICAL',
        });
      }
    }
  }

  // TC climbing
  const tc = aids['dcTractionControl'];
  if (tc && !tc.constant) {
    const tcRange = tc.max - tc.min;
    if (tcRange >= 2) {
      findings.push({
        id: nextId('aids-tc-climbing'),
        category: 'driver-aids',
        observation: `Traction control adjusted from ${tc.min} to ${tc.max} during stint - progressive increase may signal rear degradation`,
        metric: 'aidsTCRange',
        value: tcRange,
        normalRange: [0, 1],
        deviation: tcRange,
        deviationDirection: 'above',
        dataPoints: 1,
        lapConsistency: 1.0,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.65,
        severity: 'WARNING',
      });
    }
  }

  // ARB maxed out
  for (const arbKey of ['dcAntiRollFront', 'dcAntiRollRear'] as const) {
    const arb = aids[arbKey];
    if (!arb) continue;
    const label = arbKey === 'dcAntiRollFront' ? 'Front' : 'Rear';
    if (arb.min <= 1 || arb.max >= 5) {
      findings.push({
        id: nextId(`aids-${label.toLowerCase()}-arb-maxed`),
        category: 'driver-aids',
        observation: `${label} ARB blade at limit (range: ${arb.min}-${arb.max}) - no more adjustment room in this direction`,
        metric: `aidsARBMaxed.${label.toLowerCase()}`,
        value: arb.min <= 1 ? arb.min : arb.max,
        normalRange: [2, 4],
        deviation: 1.0,
        deviationDirection: arb.min <= 1 ? 'below' : 'above',
        dataPoints: 1,
        lapConsistency: 1.0,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.8,
        severity: 'WARNING',
      });
    }
  }

  return findings;
}

// ─── Engine thermal findings ────────────────────────────────────

function generateEngineThermalFindings(input: FindingGeneratorInput): TelemetryFinding[] {
  const findings: TelemetryFinding[] = [];
  const { engineTemps } = input;
  if (engineTemps.length === 0) return findings;

  const waterTemps = engineTemps.map(e => e.waterTemp);
  const oilTemps = engineTemps.map(e => e.oilTemp);
  const avgWater = average(waterTemps);
  const avgOil = average(oilTemps);
  const maxWater = Math.max(...waterTemps);
  const maxOil = Math.max(...oilTemps);

  if (avgWater > ENGINE_TEMP.WATER_WARNING) {
    findings.push({
      id: nextId('engine-water-overheat'),
      category: 'thermal',
      observation: `Coolant temperature elevated: avg ${avgWater.toFixed(0)}C, peak ${maxWater.toFixed(0)}C (warn at ${ENGINE_TEMP.WATER_WARNING}C)`,
      metric: 'engineWaterTemp',
      value: avgWater,
      normalRange: [80, ENGINE_TEMP.WATER_WARNING],
      deviation: (avgWater - ENGINE_TEMP.WATER_WARNING) / 10,
      deviationDirection: 'above',
      dataPoints: engineTemps.length,
      lapConsistency: waterTemps.filter(t => t > ENGINE_TEMP.WATER_WARNING).length / waterTemps.length,
      cornerIds: null,
      relatedFindingIds: [],
      confidence: 0.9,
      severity: avgWater > ENGINE_TEMP.WATER_WARNING + 5 ? 'CRITICAL' : 'WARNING',
    });
  }

  if (avgOil > ENGINE_TEMP.OIL_WARNING) {
    findings.push({
      id: nextId('engine-oil-overheat'),
      category: 'thermal',
      observation: `Oil temperature elevated: avg ${avgOil.toFixed(0)}C, peak ${maxOil.toFixed(0)}C (warn at ${ENGINE_TEMP.OIL_WARNING}C)`,
      metric: 'engineOilTemp',
      value: avgOil,
      normalRange: [90, ENGINE_TEMP.OIL_WARNING],
      deviation: (avgOil - ENGINE_TEMP.OIL_WARNING) / 10,
      deviationDirection: 'above',
      dataPoints: engineTemps.length,
      lapConsistency: oilTemps.filter(t => t > ENGINE_TEMP.OIL_WARNING).length / oilTemps.length,
      cornerIds: null,
      relatedFindingIds: [],
      confidence: 0.9,
      severity: avgOil > ENGINE_TEMP.OIL_WARNING + 5 ? 'CRITICAL' : 'WARNING',
    });
  }

  // Temperature trend (NEW - rising temps over stint)
  if (engineTemps.length >= 3) {
    const waterTrend = (waterTemps[waterTemps.length - 1] - waterTemps[0]) / (waterTemps.length - 1);
    if (waterTrend > 1.0) { // > 1C/lap rise
      findings.push({
        id: nextId('engine-water-trend'),
        category: 'thermal',
        observation: `Coolant temperature rising ${waterTrend.toFixed(1)}C/lap - may not stabilize within stint`,
        metric: 'engineWaterTrend',
        value: waterTrend,
        normalRange: [-0.5, 0.5],
        deviation: waterTrend / 0.5,
        deviationDirection: 'above',
        dataPoints: engineTemps.length,
        lapConsistency: 1.0,
        cornerIds: null,
        relatedFindingIds: [],
        confidence: 0.6,
        severity: waterTrend > 2.0 ? 'WARNING' : 'INFO',
      });
    }
  }

  return findings;
}

// ─── Utilities ──────────────────────────────────────────────────

function average(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}
