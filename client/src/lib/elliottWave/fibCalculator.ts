/**
 * Fibonacci ratio calculations for Elliott Wave pivots.
 * Used by useElliottWaveProgressive to auto-calculate ratios at each placed point.
 */

export interface FibLevel {
  ratio: number;
  price: number;
  label: string;
  isRetrace: boolean; // true = retracement, false = extension
}

export interface WaveFibResult {
  wave: string;
  ratio: number;
  idealRatio: number;
  quality: 'excellent' | 'good' | 'ok' | 'valid' | 'poor';
  description: string;
}

// Standard retracement ratios displayed after W1 is placed
export const RETRACEMENT_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786];

// Standard extension ratios for wave projections
export const EXTENSION_RATIOS = [1.0, 1.272, 1.618, 2.0, 2.618];

/**
 * Calculate Fibonacci retracement levels from a swing high/low.
 * Used to show potential W2 / W4 endpoints.
 */
export function calcRetracementLevels(
  startPrice: number,
  endPrice: number,
  ratios: number[] = RETRACEMENT_RATIOS,
): FibLevel[] {
  const move = endPrice - startPrice;
  return ratios.map(ratio => ({
    ratio,
    price: endPrice - move * ratio,
    label: `${(ratio * 100).toFixed(1)}%`,
    isRetrace: true,
  }));
}

/**
 * Calculate Fibonacci extension levels from a base swing.
 * Used to project W3 / W5 / Wave C targets.
 *
 * @param baseStart  Start of the reference wave (e.g. W0 for W3 projection)
 * @param baseEnd    End of the reference wave (e.g. W2 for W3 projection)
 * @param ratios     Extension multiples to calculate
 */
export function calcExtensionLevels(
  baseStart: number,
  baseEnd: number,
  ratios: number[] = EXTENSION_RATIOS,
): FibLevel[] {
  const baseLength = Math.abs(baseEnd - baseStart);
  const direction = baseEnd > baseStart ? 1 : -1;
  return ratios.map(ratio => ({
    ratio,
    price: baseEnd + direction * baseLength * ratio,
    label: `${(ratio * 100).toFixed(1)}%`,
    isRetrace: false,
  }));
}

// Tolerance bands for rating wave quality (relative error to nearest ideal)
const TOLERANCE: Record<string, number> = {
  excellent: 0.02,
  good: 0.04,
  ok: 0.06,
  valid: 0.10,
};

/** Allow a small margin below/above the strict valid range before rating as 'poor' */
const VALID_RANGE_LOWER_TOLERANCE = 0.95;
const VALID_RANGE_UPPER_TOLERANCE = 1.05;

interface FibRule {
  validMin: number;
  validMax: number;
  idealTargets: number[];
}

const FIB_RULES: Record<string, FibRule> = {
  wave2: { validMin: 0.382, validMax: 0.786, idealTargets: [0.5, 0.618] },
  wave3: { validMin: 1.618, validMax: 4.236, idealTargets: [1.618, 2.0, 2.618] },
  wave4: { validMin: 0.236, validMax: 0.500, idealTargets: [0.236, 0.382, 0.5] },
  wave5: { validMin: 0.618, validMax: 1.618, idealTargets: [0.618, 1.0, 1.618] },
  waveB:  { validMin: 0.382, validMax: 1.386, idealTargets: [0.5, 0.618, 1.0] },
  waveC:  { validMin: 1.0,   validMax: 1.618, idealTargets: [1.0, 1.272, 1.618] },
};

function rateQuality(
  actual: number,
  rule: FibRule,
): { quality: 'excellent' | 'good' | 'ok' | 'valid' | 'poor'; idealRatio: number } {
  const { validMin, validMax, idealTargets } = rule;

  // Find nearest ideal target
  let nearestIdeal = idealTargets[0];
  let minErr = Infinity;
  for (const t of idealTargets) {
    const err = Math.abs(actual - t) / t;
    if (err < minErr) { minErr = err; nearestIdeal = t; }
  }

  if (actual < validMin * VALID_RANGE_LOWER_TOLERANCE || actual > validMax * VALID_RANGE_UPPER_TOLERANCE) {
    return { quality: 'poor', idealRatio: nearestIdeal };
  }

  if (minErr <= TOLERANCE.excellent) return { quality: 'excellent', idealRatio: nearestIdeal };
  if (minErr <= TOLERANCE.good)      return { quality: 'good',      idealRatio: nearestIdeal };
  if (minErr <= TOLERANCE.ok)        return { quality: 'ok',        idealRatio: nearestIdeal };
  if (actual >= validMin && actual <= validMax) return { quality: 'valid', idealRatio: nearestIdeal };
  return { quality: 'poor', idealRatio: nearestIdeal };
}

/**
 * Score Wave 2 retracement relative to Wave 1.
 */
export function scoreWave2(w0: number, w1: number, w2: number): WaveFibResult {
  const wave1Len = Math.abs(w1 - w0);
  if (wave1Len === 0) return { wave: 'Wave 2', ratio: 0, idealRatio: 0.618, quality: 'poor', description: 'W1 has zero length' };
  const ratio = Math.abs(w2 - w1) / wave1Len;
  const { quality, idealRatio } = rateQuality(ratio, FIB_RULES.wave2);
  return {
    wave: 'Wave 2',
    ratio,
    idealRatio,
    quality,
    description: `W2 retraced ${(ratio * 100).toFixed(1)}% of W1 (ideal: ${(idealRatio * 100).toFixed(1)}%)`,
  };
}

/**
 * Score Wave 3 extension relative to Wave 1.
 */
export function scoreWave3(w0: number, w1: number, w2: number, w3: number): WaveFibResult {
  const wave1Len = Math.abs(w1 - w0);
  if (wave1Len === 0) return { wave: 'Wave 3', ratio: 0, idealRatio: 1.618, quality: 'poor', description: 'W1 has zero length' };
  const wave3Len = Math.abs(w3 - w2);
  const ratio = wave3Len / wave1Len;
  const { quality, idealRatio } = rateQuality(ratio, FIB_RULES.wave3);
  return {
    wave: 'Wave 3',
    ratio,
    idealRatio,
    quality,
    description: `W3 is ${(ratio * 100).toFixed(1)}% of W1 (ideal: ${(idealRatio * 100).toFixed(1)}%)`,
  };
}

/**
 * Score Wave 4 retracement relative to Wave 3.
 */
export function scoreWave4(w2: number, w3: number, w4: number): WaveFibResult {
  const wave3Len = Math.abs(w3 - w2);
  if (wave3Len === 0) return { wave: 'Wave 4', ratio: 0, idealRatio: 0.382, quality: 'poor', description: 'W3 has zero length' };
  const ratio = Math.abs(w4 - w3) / wave3Len;
  const { quality, idealRatio } = rateQuality(ratio, FIB_RULES.wave4);
  return {
    wave: 'Wave 4',
    ratio,
    idealRatio,
    quality,
    description: `W4 retraced ${(ratio * 100).toFixed(1)}% of W3 (ideal: ${(idealRatio * 100).toFixed(1)}%)`,
  };
}

/**
 * Score Wave 5 extension relative to Wave 1+3 combined.
 */
export function scoreWave5(w0: number, w1: number, w2: number, w3: number, w4: number, w5: number): WaveFibResult {
  const wave1Len = Math.abs(w1 - w0);
  const wave3Len = Math.abs(w3 - w2);
  const combined = wave1Len + wave3Len;
  if (combined === 0) return { wave: 'Wave 5', ratio: 0, idealRatio: 1.0, quality: 'poor', description: 'Zero combined W1+W3' };
  const wave5Len = Math.abs(w5 - w4);
  const ratio = wave5Len / combined;
  const { quality, idealRatio } = rateQuality(ratio, FIB_RULES.wave5);
  return {
    wave: 'Wave 5',
    ratio,
    idealRatio,
    quality,
    description: `W5 is ${(ratio * 100).toFixed(1)}% of W1+W3 (ideal: ${(idealRatio * 100).toFixed(1)}%)`,
  };
}

/**
 * Score Wave B retracement relative to Wave A.
 */
export function scoreWaveB(w0: number, wA: number, wB: number): WaveFibResult {
  const waveALen = Math.abs(wA - w0);
  if (waveALen === 0) return { wave: 'Wave B', ratio: 0, idealRatio: 0.618, quality: 'poor', description: 'WA has zero length' };
  const ratio = Math.abs(wB - wA) / waveALen;
  const { quality, idealRatio } = rateQuality(ratio, FIB_RULES.waveB);
  return {
    wave: 'Wave B',
    ratio,
    idealRatio,
    quality,
    description: `B retraced ${(ratio * 100).toFixed(1)}% of A (ideal: ${(idealRatio * 100).toFixed(1)}%)`,
  };
}

/**
 * Score Wave C extension relative to Wave A.
 */
export function scoreWaveC(w0: number, wA: number, wB: number, wC: number): WaveFibResult {
  const waveALen = Math.abs(wA - w0);
  if (waveALen === 0) return { wave: 'Wave C', ratio: 0, idealRatio: 1.0, quality: 'poor', description: 'WA has zero length' };
  const waveCLen = Math.abs(wC - wB);
  const ratio = waveCLen / waveALen;
  const { quality, idealRatio } = rateQuality(ratio, FIB_RULES.waveC);
  return {
    wave: 'Wave C',
    ratio,
    idealRatio,
    quality,
    description: `C is ${(ratio * 100).toFixed(1)}% of A (ideal: ${(idealRatio * 100).toFixed(1)}%)`,
  };
}
