// ═══════════════════════════════════════════════════════════════
// DERIVED CHANNELS — Professional math channels for telemetry
// These are the "math channels" that MoTeC i2, Pi Toolbox, and
// Atlas compute automatically. iRacing provides raw channels;
// we derive the engineering quantities a real race engineer needs.
// ═══════════════════════════════════════════════════════════════

import { filterWithPreset, SG_PRESETS, computeShockVelocity } from './savitzky-golay';
import type { CarProfile } from '../types';

/**
 * Car-specific physical constants needed for derived channel computation.
 * These are added to car profile JSONs as new fields.
 */
export interface CarPhysicalConstants {
  wheelbaseMm: number;     // Front to rear axle distance
  trackWidthFrontMm: number;  // Front track width (center to center)
  trackWidthRearMm: number;   // Rear track width (center to center)
  estimatedCgHeightMm: number; // Center of gravity height estimate
}

/**
 * Default constants per chassis platform (LMDh spec is tightly controlled).
 * These are estimates — exact values vary slightly by manufacturer but
 * the chassis suppliers (Dallara, Multimatic, Oreca) are spec.
 */
export const CHASSIS_CONSTANTS: Record<string, CarPhysicalConstants> = {
  dallara: {
    wheelbaseMm: 2970,
    trackWidthFrontMm: 1600,
    trackWidthRearMm: 1560,
    estimatedCgHeightMm: 310,
  },
  multimatic: {
    wheelbaseMm: 2970,
    trackWidthFrontMm: 1600,
    trackWidthRearMm: 1560,
    estimatedCgHeightMm: 310,
  },
  oreca: {
    wheelbaseMm: 2970,
    trackWidthFrontMm: 1600,
    trackWidthRearMm: 1560,
    estimatedCgHeightMm: 310,
  },
  ferrari_lmh: {
    wheelbaseMm: 3000,
    trackWidthFrontMm: 1620,
    trackWidthRearMm: 1580,
    estimatedCgHeightMm: 330,
  },
};

/**
 * Resolve physical constants for a car, using car profile chassis type.
 */
export function getCarConstants(carProfile: CarProfile | null): CarPhysicalConstants {
  if (carProfile && carProfile.chassis in CHASSIS_CONSTANTS) {
    return CHASSIS_CONSTANTS[carProfile.chassis];
  }
  return CHASSIS_CONSTANTS.dallara; // LMDh default
}

// ─── Channel types ──────────────────────────────────────────────

export interface DerivedChannels {
  /** Roll angle in degrees (positive = rolling right) */
  rollAngle: Float64Array | null;
  /** Pitch angle in degrees (positive = nose down under braking) */
  pitchAngle: Float64Array | null;
  /** Average ride height across all four corners, mm */
  rideHeightAvg: Float64Array | null;
  /** Aerodynamic balance estimate: frontDrop / totalDrop at high speed (0-1, ~0.45-0.50 = balanced) */
  aeroBalance: Float64Array | null;
  /** Understeer angle estimate in degrees (positive = understeer) */
  understeerAngle: Float64Array | null;
  /** Lateral load transfer ratio (0-1) */
  lateralLoadTransfer: Float64Array | null;
  /** Filtered shock velocities per corner in mm/s (absolute) */
  shockVelocityLF: Float64Array | null;
  shockVelocityRF: Float64Array | null;
  shockVelocityLR: Float64Array | null;
  shockVelocityRR: Float64Array | null;
  /** Smoothed speed in m/s */
  speedSmoothed: Float64Array | null;
  /** Smoothed ride heights in mm */
  rideHeightLF: Float64Array | null;
  rideHeightRF: Float64Array | null;
  rideHeightLR: Float64Array | null;
  rideHeightRR: Float64Array | null;
}

/**
 * Compute all derived channels from raw telemetry data.
 *
 * @param channels - Raw channel data from IBT parser (m, m/s^2, etc.)
 * @param tickRate - Samples per second
 * @param carProfile - Car profile for physical constants
 * @returns DerivedChannels object
 */
export function computeDerivedChannels(
  channels: Record<string, Float64Array | null>,
  tickRate: number,
  carProfile: CarProfile | null,
): DerivedChannels {
  const constants = getCarConstants(carProfile);

  // ── Smooth raw channels ───────────────────────────────────────
  const lfRH = smoothChannel(channels['LFrideHeight'], SG_PRESETS.rideHeight);
  const rfRH = smoothChannel(channels['RFrideHeight'], SG_PRESETS.rideHeight);
  const lrRH = smoothChannel(channels['LRrideHeight'], SG_PRESETS.rideHeight);
  const rrRH = smoothChannel(channels['RRrideHeight'], SG_PRESETS.rideHeight);

  const speed = smoothChannel(channels['Speed'], SG_PRESETS.driverInput);
  const latAccel = smoothChannel(channels['LatAccel'], SG_PRESETS.acceleration);
  const steering = smoothChannel(channels['SteeringWheelAngle'], SG_PRESETS.driverInput);

  // Convert ride heights to mm
  const lfRH_mm = scaleChannel(lfRH, 1000);
  const rfRH_mm = scaleChannel(rfRH, 1000);
  const lrRH_mm = scaleChannel(lrRH, 1000);
  const rrRH_mm = scaleChannel(rrRH, 1000);

  // ── Roll angle (degrees) ──────────────────────────────────────
  // rollAngle = atan2(LF_RH - RF_RH, trackWidth_front)
  const rollAngle = computeBinaryChannel(
    lfRH_mm, rfRH_mm,
    (lf, rf) => Math.atan2(lf - rf, constants.trackWidthFrontMm) * (180 / Math.PI),
  );

  // ── Pitch angle (degrees) ─────────────────────────────────────
  // pitchAngle = atan2(frontAvg - rearAvg, wheelbase)
  const pitchAngle = computeQuadChannel(
    lfRH_mm, rfRH_mm, lrRH_mm, rrRH_mm,
    (lf, rf, lr, rr) => {
      const frontAvg = (lf + rf) / 2;
      const rearAvg = (lr + rr) / 2;
      return Math.atan2(frontAvg - rearAvg, constants.wheelbaseMm) * (180 / Math.PI);
    },
  );

  // ── Average ride height (mm) ──────────────────────────────────
  const rideHeightAvg = computeQuadChannel(
    lfRH_mm, rfRH_mm, lrRH_mm, rrRH_mm,
    (lf, rf, lr, rr) => (lf + rf + lr + rr) / 4,
  );

  // ── Aero balance estimate ─────────────────────────────────────
  // At high speed: compare how much front drops vs rear drops
  // relative to their static heights. Approximation: front/(front+rear) of total drop.
  // We compute this as a per-sample ratio using instantaneous values.
  // More meaningful when filtered to high-speed segments in post-processing.
  const aeroBalance = computeQuadChannel(
    lfRH_mm, rfRH_mm, lrRH_mm, rrRH_mm,
    (lf, rf, lr, rr) => {
      const frontAvg = (lf + rf) / 2;
      const rearAvg = (lr + rr) / 2;
      const total = frontAvg + rearAvg;
      if (total <= 0) return NaN;
      return frontAvg / total;
    },
  );

  // ── Understeer angle estimate (degrees) ───────────────────────
  // Using simplified bicycle model:
  //   understeerAngle = steeringAngle(rad) - (latAccel / speed^2) * wheelbase
  // Positive = understeer, negative = oversteer
  const understeerAngle = computeUndersteerAngle(
    steering, latAccel, speed, constants.wheelbaseMm / 1000,
  );

  // ── Lateral load transfer ratio ───────────────────────────────
  // LLT = (latAccel * cgHeight) / (g * trackWidth)
  // Simplified: ratio of 0-1 where 1 = all load on one side
  const lateralLoadTransfer = computeUnaryChannel(
    latAccel,
    (aLat) => {
      const g = 9.81;
      const accelG = Math.abs(aLat) / g;
      const avgTrackWidth = (constants.trackWidthFrontMm + constants.trackWidthRearMm) / 2;
      return Math.min(1, (accelG * constants.estimatedCgHeightMm) / avgTrackWidth);
    },
  );

  // ── Shock velocities (SG derivative, mm/s absolute) ───────────
  const shockVelLF = channels['LFshockDefl']
    ? computeShockVelocity(channels['LFshockDefl'], tickRate)
    : null;
  const shockVelRF = channels['RFshockDefl']
    ? computeShockVelocity(channels['RFshockDefl'], tickRate)
    : null;
  const shockVelLR = channels['LRshockDefl']
    ? computeShockVelocity(channels['LRshockDefl'], tickRate)
    : null;
  const shockVelRR = channels['RRshockDefl']
    ? computeShockVelocity(channels['RRshockDefl'], tickRate)
    : null;

  return {
    rollAngle,
    pitchAngle,
    rideHeightAvg,
    aeroBalance,
    understeerAngle,
    lateralLoadTransfer,
    shockVelocityLF: shockVelLF,
    shockVelocityRF: shockVelRF,
    shockVelocityLR: shockVelLR,
    shockVelocityRR: shockVelRR,
    speedSmoothed: speed,
    rideHeightLF: lfRH_mm,
    rideHeightRF: rfRH_mm,
    rideHeightLR: lrRH_mm,
    rideHeightRR: rrRH_mm,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function smoothChannel(
  raw: Float64Array | null,
  preset: typeof SG_PRESETS[keyof typeof SG_PRESETS],
): Float64Array | null {
  if (!raw || raw.length < preset.windowSize) return raw;
  return filterWithPreset(raw, preset);
}

function scaleChannel(data: Float64Array | null, factor: number): Float64Array | null {
  if (!data) return null;
  const result = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] * factor;
  }
  return result;
}

function computeUnaryChannel(
  a: Float64Array | null,
  fn: (a: number) => number,
): Float64Array | null {
  if (!a) return null;
  const result = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    result[i] = Number.isFinite(va) ? fn(va) : NaN;
  }
  return result;
}

function computeBinaryChannel(
  a: Float64Array | null,
  b: Float64Array | null,
  fn: (a: number, b: number) => number,
): Float64Array | null {
  if (!a || !b) return null;
  const n = Math.min(a.length, b.length);
  const result = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const va = a[i], vb = b[i];
    result[i] = (Number.isFinite(va) && Number.isFinite(vb)) ? fn(va, vb) : NaN;
  }
  return result;
}

function computeQuadChannel(
  a: Float64Array | null,
  b: Float64Array | null,
  c: Float64Array | null,
  d: Float64Array | null,
  fn: (a: number, b: number, c: number, d: number) => number,
): Float64Array | null {
  if (!a || !b || !c || !d) return null;
  const n = Math.min(a.length, b.length, c.length, d.length);
  const result = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const va = a[i], vb = b[i], vc = c[i], vd = d[i];
    result[i] = (Number.isFinite(va) && Number.isFinite(vb) && Number.isFinite(vc) && Number.isFinite(vd))
      ? fn(va, vb, vc, vd) : NaN;
  }
  return result;
}

/**
 * Compute understeer angle using simplified bicycle model.
 *
 * understeerAngle = steeringAngle - (lateralAccel / speed^2) * wheelbase
 *
 * Positive values indicate understeer (driver steering more than car turns).
 * Only valid above ~30 km/h (low speed gives division-by-near-zero artifacts).
 */
function computeUndersteerAngle(
  steeringRad: Float64Array | null,
  latAccel: Float64Array | null,
  speedMs: Float64Array | null,
  wheelbaseM: number,
): Float64Array | null {
  if (!steeringRad || !latAccel || !speedMs) return null;
  const n = Math.min(steeringRad.length, latAccel.length, speedMs.length);
  const result = new Float64Array(n);
  const MIN_SPEED = 8.33; // ~30 km/h — below this, bicycle model is meaningless

  for (let i = 0; i < n; i++) {
    const delta = steeringRad[i];
    const aLat = latAccel[i];
    const v = speedMs[i];

    if (!Number.isFinite(delta) || !Number.isFinite(aLat) || !Number.isFinite(v) || Math.abs(v) < MIN_SPEED) {
      result[i] = NaN;
      continue;
    }

    // Kinematic steering angle for a neutral car
    const kinematicAngle = (aLat / (v * v)) * wheelbaseM;
    // Understeer angle in radians → convert to degrees
    result[i] = (delta - kinematicAngle) * (180 / Math.PI);
  }

  return result;
}
