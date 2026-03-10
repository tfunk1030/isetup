// ═══════════════════════════════════════════════════════════════
// FFT ANALYSIS — Frequency-domain porpoising and oscillation detection
// Uses pure-JS Radix-4 FFT for spectral analysis of ride height
// traces on high-speed straights. Detects porpoising (2-8 Hz),
// road surface excitation (8-15 Hz), and computes PSD.
// ═══════════════════════════════════════════════════════════════

/**
 * Result of porpoising/oscillation frequency analysis.
 */
export interface OscillationAnalysis {
  /** Whether porpoising was detected (dominant frequency in 2-8 Hz range) */
  porpoisingDetected: boolean;
  /** Dominant oscillation frequency in Hz (NaN if no clear peak) */
  dominantFrequencyHz: number;
  /** Amplitude of dominant oscillation in mm */
  dominantAmplitudeMm: number;
  /** Standard deviation of ride height during analysis window, mm */
  rideHeightStdDevMm: number;
  /** Number of high-speed segments analyzed */
  segmentsAnalyzed: number;
  /** Severity: 'none' | 'mild' | 'moderate' | 'severe' */
  severity: 'none' | 'mild' | 'moderate' | 'severe';
  /** Per-segment breakdown for detailed reporting */
  segments: OscillationSegment[];
}

export interface OscillationSegment {
  startIdx: number;
  endIdx: number;
  avgSpeedKph: number;
  dominantFreqHz: number;
  amplitudeMm: number;
  stdDevMm: number;
}

/** Porpoising frequency range in Hz */
const PORPOISING_FREQ_MIN = 2;
const PORPOISING_FREQ_MAX = 8;

/** Minimum segment length for FFT (must be power of 2 for Radix-2 FFT) */
const MIN_FFT_SAMPLES = 64;

/** Amplitude thresholds for severity classification (mm) */
const AMPLITUDE_MILD = 1.5;
const AMPLITUDE_MODERATE = 3.0;
const AMPLITUDE_SEVERE = 5.0;

/**
 * Analyze ride height oscillation patterns using FFT.
 *
 * Extracts high-speed straight segments from telemetry, applies
 * Hann windowing, computes FFT, and identifies dominant oscillation
 * frequencies in the porpoising range (2-8 Hz).
 *
 * @param rideHeightMm - Ride height data in mm (typically front average)
 * @param speedKph - Speed data in km/h
 * @param tickRate - Samples per second
 * @param highSpeedThresholdFraction - Fraction of max speed to consider "high speed" (default 0.85)
 * @returns OscillationAnalysis result
 */
export function analyzeOscillation(
  rideHeightMm: Float64Array | null,
  speedKph: Float64Array | null,
  tickRate: number,
  highSpeedThresholdFraction: number = 0.85,
): OscillationAnalysis {
  const noResult: OscillationAnalysis = {
    porpoisingDetected: false,
    dominantFrequencyHz: NaN,
    dominantAmplitudeMm: NaN,
    rideHeightStdDevMm: NaN,
    segmentsAnalyzed: 0,
    severity: 'none',
    segments: [],
  };

  if (!rideHeightMm || !speedKph || rideHeightMm.length < MIN_FFT_SAMPLES) {
    return noResult;
  }

  // Find max speed for threshold
  let maxSpeed = 0;
  for (let i = 0; i < speedKph.length; i++) {
    if (Number.isFinite(speedKph[i]) && speedKph[i] > maxSpeed) {
      maxSpeed = speedKph[i];
    }
  }

  const highSpeedThreshold = maxSpeed * highSpeedThresholdFraction;
  if (highSpeedThreshold < 100) return noResult; // Not enough speed for meaningful aero analysis

  // Extract contiguous high-speed segments
  const segments = findHighSpeedSegments(speedKph, highSpeedThreshold, MIN_FFT_SAMPLES);
  if (segments.length === 0) return noResult;

  const segmentResults: OscillationSegment[] = [];
  let worstAmplitude = 0;
  let worstFreq = 0;

  for (const [start, end] of segments) {
    const segmentLength = end - start;
    // Round down to nearest power of 2 for FFT
    const fftSize = nearestPowerOf2(segmentLength);
    if (fftSize < MIN_FFT_SAMPLES) continue;

    // Extract and window the segment
    const segment = new Float64Array(fftSize);
    const offset = start + Math.floor((segmentLength - fftSize) / 2); // Center the FFT window
    for (let i = 0; i < fftSize; i++) {
      segment[i] = rideHeightMm[offset + i];
    }

    // Remove DC offset (mean)
    const mean = computeMean(segment);
    for (let i = 0; i < fftSize; i++) {
      segment[i] -= mean;
    }

    // Apply Hann window to reduce spectral leakage
    applyHannWindow(segment);

    // Compute FFT
    const { magnitudes } = computeFFT(segment);

    // Find dominant frequency in porpoising range
    const freqResolution = tickRate / fftSize;
    const minBin = Math.ceil(PORPOISING_FREQ_MIN / freqResolution);
    const maxBin = Math.floor(PORPOISING_FREQ_MAX / freqResolution);

    let peakMag = 0;
    let peakBin = 0;
    for (let bin = minBin; bin <= maxBin && bin < magnitudes.length; bin++) {
      if (magnitudes[bin] > peakMag) {
        peakMag = magnitudes[bin];
        peakBin = bin;
      }
    }

    const peakFreq = peakBin * freqResolution;
    // Convert magnitude to amplitude in mm (FFT scaling: 2 * mag / N)
    const amplitude = (2 * peakMag) / fftSize;

    // Compute segment std dev
    const stdDev = computeStdDev(segment);

    // Compute average speed in segment
    let speedSum = 0;
    let speedCount = 0;
    for (let i = start; i < end; i++) {
      if (Number.isFinite(speedKph[i])) {
        speedSum += speedKph[i];
        speedCount++;
      }
    }

    segmentResults.push({
      startIdx: start,
      endIdx: end,
      avgSpeedKph: speedCount > 0 ? speedSum / speedCount : 0,
      dominantFreqHz: peakFreq,
      amplitudeMm: amplitude,
      stdDevMm: stdDev,
    });

    if (amplitude > worstAmplitude) {
      worstAmplitude = amplitude;
      worstFreq = peakFreq;
    }
  }

  if (segmentResults.length === 0) return noResult;

  // Classify severity
  let severity: 'none' | 'mild' | 'moderate' | 'severe' = 'none';
  if (worstAmplitude >= AMPLITUDE_SEVERE) severity = 'severe';
  else if (worstAmplitude >= AMPLITUDE_MODERATE) severity = 'moderate';
  else if (worstAmplitude >= AMPLITUDE_MILD) severity = 'mild';

  const porpoisingDetected = severity !== 'none';

  // Overall std dev from all segments
  const allStdDevs = segmentResults.map(s => s.stdDevMm).filter(Number.isFinite);
  const avgStdDev = allStdDevs.length > 0
    ? allStdDevs.reduce((a, b) => a + b, 0) / allStdDevs.length
    : NaN;

  return {
    porpoisingDetected,
    dominantFrequencyHz: worstFreq,
    dominantAmplitudeMm: worstAmplitude,
    rideHeightStdDevMm: avgStdDev,
    segmentsAnalyzed: segmentResults.length,
    severity,
    segments: segmentResults,
  };
}

// ─── Internal FFT implementation ────────────────────────────────
// Pure-JS Radix-2 Cooley-Tukey FFT. For production, consider
// replacing with fft.js (indutny) which is 3-5x faster via Radix-4.

/**
 * Compute FFT of a real-valued signal (in-place, Radix-2).
 * Returns magnitude spectrum (first N/2+1 bins).
 */
function computeFFT(signal: Float64Array): { magnitudes: Float64Array } {
  const N = signal.length;
  // Real and imaginary parts
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = signal[i];

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // FFT butterfly computation
  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);

    for (let i = 0; i < N; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let j = 0; j < halfLen; j++) {
        const a = i + j;
        const b = i + j + halfLen;
        const tRe = curRe * re[b] - curIm * im[b];
        const tIm = curRe * im[b] + curIm * re[b];
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        const nextIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
        curIm = nextIm;
      }
    }
  }

  // Compute magnitudes for first N/2+1 bins (positive frequencies)
  const numBins = (N >> 1) + 1;
  const magnitudes = new Float64Array(numBins);
  for (let i = 0; i < numBins; i++) {
    magnitudes[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }

  return { magnitudes };
}

// ─── Helper functions ───────────────────────────────────────────

function findHighSpeedSegments(
  speedKph: Float64Array,
  threshold: number,
  minLength: number,
): [number, number][] {
  const segments: [number, number][] = [];
  let segStart = -1;

  for (let i = 0; i < speedKph.length; i++) {
    const isHighSpeed = Number.isFinite(speedKph[i]) && speedKph[i] >= threshold;

    if (isHighSpeed && segStart === -1) {
      segStart = i;
    } else if (!isHighSpeed && segStart !== -1) {
      if (i - segStart >= minLength) {
        segments.push([segStart, i]);
      }
      segStart = -1;
    }
  }

  // Close final segment
  if (segStart !== -1 && speedKph.length - segStart >= minLength) {
    segments.push([segStart, speedKph.length]);
  }

  return segments;
}

function nearestPowerOf2(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

function applyHannWindow(data: Float64Array): void {
  const N = data.length;
  for (let i = 0; i < N; i++) {
    const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
    data[i] *= w;
  }
}

function computeMean(data: Float64Array): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    if (Number.isFinite(data[i])) {
      sum += data[i];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function computeStdDev(data: Float64Array): number {
  const mean = computeMean(data);
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    if (Number.isFinite(data[i])) {
      const d = data[i] - mean;
      sumSq += d * d;
      count++;
    }
  }
  return count > 1 ? Math.sqrt(sumSq / (count - 1)) : 0;
}
