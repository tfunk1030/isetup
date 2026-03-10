// ═══════════════════════════════════════════════════════════════
// SAVITZKY-GOLAY FILTER — Industry standard for motorsport telemetry
// Fits successive subsets of adjacent data points with a low-degree
// polynomial via least squares. Preserves peak shapes and can
// simultaneously smooth AND differentiate (derivative mode).
// Used internally by MoTeC i2, Pi Toolbox, Atlas.
// ═══════════════════════════════════════════════════════════════

/**
 * Compute Savitzky-Golay convolution coefficients.
 *
 * Uses the Gram polynomial method to build a set of FIR filter
 * coefficients that, when convolved with the data, produce the
 * smoothed signal (derivativeOrder=0) or its Nth derivative.
 *
 * @param windowSize - Must be odd and >= polyOrder + 1
 * @param polyOrder  - Polynomial degree (2 or 3 typical)
 * @param derivativeOrder - 0 = smooth, 1 = first derivative, etc.
 * @returns Float64Array of convolution coefficients (length = windowSize)
 */
export function computeSGCoefficients(
  windowSize: number,
  polyOrder: number,
  derivativeOrder: number = 0,
): Float64Array {
  if (windowSize % 2 === 0) throw new Error('windowSize must be odd');
  if (windowSize < polyOrder + 1) throw new Error('windowSize must be >= polyOrder + 1');
  if (derivativeOrder > polyOrder) throw new Error('derivativeOrder must be <= polyOrder');

  const halfWindow = (windowSize - 1) / 2;
  const numPoints = windowSize;
  const numCoeffs = polyOrder + 1;

  // Build the Vandermonde-like matrix J where J[i][k] = i^k
  // with i ranging from -halfWindow to +halfWindow
  const J = new Array<Float64Array>(numPoints);
  for (let i = 0; i < numPoints; i++) {
    J[i] = new Float64Array(numCoeffs);
    const x = i - halfWindow;
    for (let k = 0; k < numCoeffs; k++) {
      J[i][k] = Math.pow(x, k);
    }
  }

  // Compute (J^T * J)
  const JtJ = new Array<Float64Array>(numCoeffs);
  for (let i = 0; i < numCoeffs; i++) {
    JtJ[i] = new Float64Array(numCoeffs);
    for (let j = 0; j < numCoeffs; j++) {
      let sum = 0;
      for (let k = 0; k < numPoints; k++) {
        sum += J[k][i] * J[k][j];
      }
      JtJ[i][j] = sum;
    }
  }

  // Invert (J^T * J) using Gauss-Jordan elimination
  const inv = invertMatrix(JtJ, numCoeffs);

  // Compute C = (J^T * J)^{-1} * J^T
  // We only need the row corresponding to derivativeOrder
  const row = derivativeOrder;
  const coeffs = new Float64Array(numPoints);

  for (let i = 0; i < numPoints; i++) {
    let sum = 0;
    for (let k = 0; k < numCoeffs; k++) {
      sum += inv[row][k] * J[i][k];
    }
    // Multiply by factorial(derivativeOrder) to get actual derivative
    coeffs[i] = sum * factorial(derivativeOrder);
  }

  return coeffs;
}

/**
 * Apply Savitzky-Golay filter to a Float64Array signal.
 *
 * Handles edges by reflecting the signal (mirror boundary).
 * NaN values are propagated — if any sample in the window is NaN,
 * the output at that center position is NaN.
 *
 * @param data - Input signal (Float64Array)
 * @param coefficients - Pre-computed SG coefficients from computeSGCoefficients()
 * @returns Filtered Float64Array of same length as input
 */
export function applySGFilter(
  data: Float64Array,
  coefficients: Float64Array,
): Float64Array {
  const n = data.length;
  const windowSize = coefficients.length;
  const halfWindow = (windowSize - 1) / 2;
  const result = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    let sum = 0;
    let hasNaN = false;

    for (let j = 0; j < windowSize; j++) {
      const dataIdx = i + j - halfWindow;
      // Mirror boundary: reflect indices that fall outside the signal
      let idx: number;
      if (dataIdx < 0) {
        idx = -dataIdx;
      } else if (dataIdx >= n) {
        idx = 2 * n - dataIdx - 2;
      } else {
        idx = dataIdx;
      }

      // Clamp to valid range (safety for very short signals)
      idx = Math.max(0, Math.min(n - 1, idx));

      const val = data[idx];
      if (!Number.isFinite(val)) {
        hasNaN = true;
        break;
      }
      sum += coefficients[j] * val;
    }

    result[i] = hasNaN ? NaN : sum;
  }

  return result;
}

/**
 * Pre-configured filter presets for telemetry channels.
 * Each preset includes coefficients for smoothing and optionally differentiation.
 */
export interface SGPreset {
  name: string;
  windowSize: number;
  polyOrder: number;
  derivativeOrder: number;
  /** Pre-computed coefficients (lazy-initialized) */
  coefficients?: Float64Array;
}

export const SG_PRESETS = {
  /** Ride heights: preserve aero transients */
  rideHeight: { name: 'rideHeight', windowSize: 15, polyOrder: 2, derivativeOrder: 0 } as SGPreset,

  /** Shock displacement → velocity: smooth differentiation */
  shockVelocity: { name: 'shockVelocity', windowSize: 21, polyOrder: 3, derivativeOrder: 1 } as SGPreset,

  /** Tyre temperatures: slow-changing, wider window */
  tyreTemp: { name: 'tyreTemp', windowSize: 41, polyOrder: 2, derivativeOrder: 0 } as SGPreset,

  /** Steering, throttle, brake: fast-changing driver inputs */
  driverInput: { name: 'driverInput', windowSize: 7, polyOrder: 2, derivativeOrder: 0 } as SGPreset,

  /** Lateral/Longitudinal acceleration: moderate smoothing */
  acceleration: { name: 'acceleration', windowSize: 11, polyOrder: 2, derivativeOrder: 0 } as SGPreset,

  /** Speed trace for corner detection: wide enough to remove noise */
  speedCornerDetect: { name: 'speedCornerDetect', windowSize: 21, polyOrder: 2, derivativeOrder: 0 } as SGPreset,
} as const;

// Cache of computed coefficients by preset key
const coefficientCache = new Map<string, Float64Array>();

/**
 * Get (or compute and cache) coefficients for a named preset.
 */
export function getPresetCoefficients(preset: SGPreset): Float64Array {
  const key = `${preset.windowSize}_${preset.polyOrder}_${preset.derivativeOrder}`;
  let coeffs = coefficientCache.get(key);
  if (!coeffs) {
    coeffs = computeSGCoefficients(preset.windowSize, preset.polyOrder, preset.derivativeOrder);
    coefficientCache.set(key, coeffs);
  }
  return coeffs;
}

/**
 * Convenience: smooth a signal using a named preset.
 */
export function filterWithPreset(data: Float64Array, preset: SGPreset): Float64Array {
  const coeffs = getPresetCoefficients(preset);
  return applySGFilter(data, coeffs);
}

/**
 * Compute shock velocity from displacement using SG derivative filter.
 *
 * This replaces the raw first-difference approach:
 *   vel[i] = |defl[i] - defl[i-1]| * 1000 / dt
 * which amplifies sensor noise into false velocity spikes.
 *
 * The SG derivative simultaneously smooths and differentiates,
 * producing physically meaningful velocity traces.
 *
 * @param displacement - Shock displacement in meters (Float64Array)
 * @param tickRate     - Samples per second (e.g., 60 for iRacing)
 * @returns Shock velocity in mm/s (Float64Array, absolute values)
 */
export function computeShockVelocity(
  displacement: Float64Array,
  tickRate: number,
): Float64Array {
  const coeffs = getPresetCoefficients(SG_PRESETS.shockVelocity);
  const derivative = applySGFilter(displacement, coeffs);

  // SG derivative gives d/d(sample). Scale to d/d(time) in mm/s:
  // derivative * tickRate (samples/s → per-second) * 1000 (m → mm)
  const scaleFactor = tickRate * 1000;
  const velocity = new Float64Array(derivative.length);
  for (let i = 0; i < derivative.length; i++) {
    const val = derivative[i];
    velocity[i] = Number.isFinite(val) ? Math.abs(val * scaleFactor) : NaN;
  }

  return velocity;
}

/**
 * Compute percentile statistics from an array of values.
 * Used for shock velocity histogramming and ride height analysis.
 *
 * @param values - Input values (will be sorted in-place for a copy)
 * @param percentiles - Array of percentiles to compute (0-100)
 * @returns Map of percentile → value
 */
export function computePercentiles(
  values: Float64Array,
  percentiles: number[],
): Map<number, number> {
  // Filter out NaN values
  const clean: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i])) {
      clean.push(values[i]);
    }
  }
  clean.sort((a, b) => a - b);

  const result = new Map<number, number>();
  if (clean.length === 0) {
    for (const p of percentiles) result.set(p, NaN);
    return result;
  }

  for (const p of percentiles) {
    const idx = Math.min(Math.floor(clean.length * p / 100), clean.length - 1);
    result.set(p, clean[idx]);
  }
  return result;
}

// ─── Internal helpers ───────────────────────────────────────────

function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/**
 * Gauss-Jordan matrix inversion for small matrices (typically 3x3 or 4x4).
 */
function invertMatrix(matrix: Float64Array[], size: number): Float64Array[] {
  // Augment with identity
  const aug = new Array<Float64Array>(size);
  for (let i = 0; i < size; i++) {
    aug[i] = new Float64Array(2 * size);
    for (let j = 0; j < size; j++) {
      aug[i][j] = matrix[i][j];
    }
    aug[i][size + i] = 1;
  }

  // Forward elimination with partial pivoting
  for (let col = 0; col < size; col++) {
    // Find pivot
    let maxVal = Math.abs(aug[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < size; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }

    // Swap rows
    if (maxRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[maxRow];
      aug[maxRow] = tmp;
    }

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) {
      throw new Error(`Matrix is singular (pivot near zero at column ${col})`);
    }

    // Scale pivot row
    for (let j = 0; j < 2 * size; j++) {
      aug[col][j] /= pivot;
    }

    // Eliminate column in all other rows
    for (let row = 0; row < size; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * size; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Extract inverse
  const inv = new Array<Float64Array>(size);
  for (let i = 0; i < size; i++) {
    inv[i] = new Float64Array(size);
    for (let j = 0; j < size; j++) {
      inv[i][j] = aug[i][size + j];
    }
  }

  return inv;
}
