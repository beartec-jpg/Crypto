import type { ElliottWaveLabel, InsertElliottWaveLabel } from "@shared/schema";
import { storage } from "../storage";

interface WavePoint {
  index: number;
  label: string;
  price: number;
  time: number;
  isCorrection: boolean;
}

interface FibonacciRatio {
  wave: string;
  ratio: number;
  idealRatio: number;
  validMin: number;
  validMax: number;
  quality: 'excellent' | 'good' | 'ok' | 'valid' | 'poor';
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fibonacciRatios: FibonacciRatio[];
  detectedType?: 'zigzag' | 'flat' | 'impulse' | 'triangle' | 'diagonal'; // Auto-detected pattern subtype
  detectedSubtype?: 'regular_flat' | 'expanded_flat' | 'running_flat'; // Flat subtype classification
}

interface AutoAnalysisResult {
  patterns: DetectedPattern[];
  pivots: Pivot[];
  confidence: number;
}

interface DetectedPattern {
  type: 'impulse' | 'correction' | 'triangle' | 'diagonal' | 'zigzag' | 'flat';
  degree: string;
  points: WavePoint[];
  confidence: number;
  fibonacciScore: number;
  startIndex: number;
  endIndex: number;
}

interface Pivot {
  index: number;
  price: number;
  time: number;
  type: 'high' | 'low';
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const WAVE_DEGREES = [
  { name: 'Grand Supercycle', color: '#FF0000', labels: ['(I)', '(II)', '(III)', '(IV)', '(V)'] },
  { name: 'Supercycle', color: '#FF6B00', labels: ['(I)', '(II)', '(III)', '(IV)', '(V)'] },
  { name: 'Cycle', color: '#FFD700', labels: ['I', 'II', 'III', 'IV', 'V'] },
  { name: 'Primary', color: '#00FF00', labels: ['1', '2', '3', '4', '5'] },
  { name: 'Intermediate', color: '#00BFFF', labels: ['(1)', '(2)', '(3)', '(4)', '(5)'] },
  { name: 'Minor', color: '#0000FF', labels: ['1', '2', '3', '4', '5'] },
  { name: 'Minute', color: '#8B00FF', labels: ['i', 'ii', 'iii', 'iv', 'v'] },
  { name: 'Minuette', color: '#FF1493', labels: ['(i)', '(ii)', '(iii)', '(iv)', '(v)'] },
  { name: 'Subminuette', color: '#808080', labels: ['i', 'ii', 'iii', 'iv', 'v'] },
];

const CORRECTION_LABELS: Record<string, string[]> = {
  'Grand Supercycle': ['(A)', '(B)', '(C)'],
  'Supercycle': ['(A)', '(B)', '(C)'],
  'Cycle': ['A', 'B', 'C'],
  'Primary': ['A', 'B', 'C'],
  'Intermediate': ['(A)', '(B)', '(C)'],
  'Minor': ['A', 'B', 'C'],
  'Minute': ['a', 'b', 'c'],
  'Minuette': ['(a)', '(b)', '(c)'],
  'Subminuette': ['a', 'b', 'c'],
};

// Elliott Wave Fibonacci Rules with valid ranges and ideal targets
// Based on standard Elliott Wave theory guidelines
interface FibRule {
  validMin: number;
  validMax: number;
  idealTargets: { ratio: number; tolerance: number }[];
}

// 4-Tier Rating System with tolerance bands around ideal targets
// Proximity to ideal targets takes priority over strict range limits
interface ToleranceBands {
  excellent: number;  // Within this % of ideal = excellent (tightest)
  good: number;       // Within this % of ideal = good
  ok: number;         // Within this % of ideal = ok
  valid: number;      // Within this % of ideal = still valid (widest)
}

// Common Fibonacci targets and their tolerance bands
// These are RELATIVE tolerances (e.g., 0.03 = 3% of the target ratio)
const TOLERANCE_BANDS: ToleranceBands = {
  excellent: 0.02,   // Within 2% = excellent (e.g., 161.8% ± 3.2% = 158.6-165%)
  good: 0.04,        // Within 4% = good (e.g., 161.8% ± 6.5% = 155.3-168.3%)
  ok: 0.06,          // Within 6% = ok (e.g., 161.8% ± 9.7% = 152-171.5%)
  valid: 0.10,       // Within 10% = valid (e.g., 161.8% ± 16% = 145.6-178%)
};

const FIBONACCI_RULES: Record<string, FibRule> = {
  // Wave 2: Retracement of Wave 1 (38.2% - 78.6%)
  // Common: 50%, 61.8%. Deep retracements to 78.6% are acceptable
  wave2: {
    validMin: 0.382,
    validMax: 0.786,
    idealTargets: [
      { ratio: 0.500, tolerance: 0.03 },
      { ratio: 0.618, tolerance: 0.03 },
    ],
  },
  // Wave 3: Extension of Wave 1 (161.8% minimum, can extend to 423.6%+)
  // Most powerful wave, often extends to 2.618 or beyond
  wave3: {
    validMin: 1.618,
    validMax: 4.236,
    idealTargets: [
      { ratio: 1.618, tolerance: 0.05 },
      { ratio: 2.000, tolerance: 0.04 },
      { ratio: 2.618, tolerance: 0.05 },
      { ratio: 3.618, tolerance: 0.06 },
      { ratio: 4.236, tolerance: 0.06 },
    ],
  },
  // Wave 4: Retracement of Wave 3 (23.6% - 50%)
  // Typically shallow, 38.2% is most common
  wave4: {
    validMin: 0.236,
    validMax: 0.500,
    idealTargets: [
      { ratio: 0.236, tolerance: 0.03 },
      { ratio: 0.382, tolerance: 0.03 },
      { ratio: 0.500, tolerance: 0.03 },
    ],
  },
  // Wave 5: Extension relative to combined W1+W3 (61.8% - 161.8%)
  // Often equals Wave 1, can be extended or truncated
  wave5: {
    validMin: 0.618,
    validMax: 1.618,
    idealTargets: [
      { ratio: 0.618, tolerance: 0.05 },
      { ratio: 1.000, tolerance: 0.04 },
      { ratio: 1.272, tolerance: 0.05 },
      { ratio: 1.618, tolerance: 0.05 },
    ],
  },
  // Wave B (zigzag): Retracement of Wave A (38.2% - 88.6%)
  waveB_zigzag: {
    validMin: 0.382,
    validMax: 0.886,
    idealTargets: [
      { ratio: 0.500, tolerance: 0.03 },
      { ratio: 0.618, tolerance: 0.03 },
      { ratio: 0.786, tolerance: 0.04 },
    ],
  },
  // Wave B (flat/expanded): Near equal or exceeds Wave A (90% - 138.6%)
  // Regular flat: ~100%, Expanded flat: 100-138.6%, Must not exceed 161.8%
  waveB_flat: {
    validMin: 0.900,
    validMax: 1.386,
    idealTargets: [
      { ratio: 1.000, tolerance: 0.03 }, // Regular flat
      { ratio: 1.236, tolerance: 0.04 }, // Expanded flat
      { ratio: 1.382, tolerance: 0.04 }, // Extended expanded flat
    ],
  },
  // Wave C (zigzag): Extension of Wave A (100% - 161.8%)
  waveC_zigzag: {
    validMin: 1.000,
    validMax: 1.618,
    idealTargets: [
      { ratio: 1.000, tolerance: 0.04 },
      { ratio: 1.272, tolerance: 0.05 },
      { ratio: 1.414, tolerance: 0.05 },
      { ratio: 1.618, tolerance: 0.05 },
    ],
  },
  // Wave C (flat): Extension of Wave A (123.6% - 161.8%)
  waveC_flat: {
    validMin: 1.236,
    validMax: 1.618,
    idealTargets: [
      { ratio: 1.272, tolerance: 0.04 },
      { ratio: 1.414, tolerance: 0.04 },
      { ratio: 1.618, tolerance: 0.05 },
    ],
  },
  // Triangle internal waves: 38.2% - 61.8% retracement of prior leg
  triangle: {
    validMin: 0.382,
    validMax: 0.786,
    idealTargets: [
      { ratio: 0.500, tolerance: 0.03 },
      { ratio: 0.618, tolerance: 0.03 },
    ],
  },
  // DIAGONAL-SPECIFIC RULES
  // Diagonals have overlapping waves and waves are typically smaller than impulses
  
  // Diagonal Wave 2: Same as impulse - retracement of Wave 1 (50% - 78.6%)
  wave2_diagonal: {
    validMin: 0.500,
    validMax: 0.886,
    idealTargets: [
      { ratio: 0.618, tolerance: 0.04 },
      { ratio: 0.786, tolerance: 0.04 },
    ],
  },
  // Diagonal Wave 3: Shorter than impulses - often 61.8% to 161.8% of Wave 1
  // In contracting diagonals, each wave is shorter than previous impulse wave
  wave3_diagonal: {
    validMin: 0.618,
    validMax: 1.618,
    idealTargets: [
      { ratio: 0.786, tolerance: 0.05 },
      { ratio: 1.000, tolerance: 0.05 },
      { ratio: 1.272, tolerance: 0.05 },
    ],
  },
  // Diagonal Wave 4: Deeper retracements allowed (50% - 78.6%)
  // Wave 4 must overlap Wave 1 territory in ending diagonals
  wave4_diagonal: {
    validMin: 0.500,
    validMax: 0.786,
    idealTargets: [
      { ratio: 0.500, tolerance: 0.04 },
      { ratio: 0.618, tolerance: 0.04 },
      { ratio: 0.786, tolerance: 0.05 },
    ],
  },
  // Diagonal Wave 5: Measured against Wave 3 only (not W1+W3)
  // Typically shorter than Wave 3 in contracting diagonals
  wave5_diagonal: {
    validMin: 0.382,
    validMax: 1.236,
    idealTargets: [
      { ratio: 0.500, tolerance: 0.04 },
      { ratio: 0.618, tolerance: 0.04 },
      { ratio: 0.786, tolerance: 0.05 },
      { ratio: 1.000, tolerance: 0.05 },
    ],
  },
};

// Legacy compatibility - keep old format
const _IDEAL_FIB_RATIOS = {
  wave2: [0.382, 0.5, 0.618],
  wave3: [1.618, 2.0, 2.618],
  wave4: [0.236, 0.382, 0.5],
  wave5: [0.618, 1.0, 1.618],
  waveB: [0.382, 0.5, 0.618, 0.786],
  waveC: [0.618, 1.0, 1.272, 1.618],
};
void _IDEAL_FIB_RATIOS;

export function validateImpulseWave(points: WavePoint[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fibonacciRatios: ValidationResult['fibonacciRatios'] = [];

  if (points.length !== 6) {
    errors.push(`Impulse wave requires 6 points (0-5), got ${points.length}`);
    return { isValid: false, errors, warnings, fibonacciRatios };
  }

  const [w0, w1, w2, w3, w4, w5] = points;
  const isUptrend = w1.price > w0.price;

  // IMPULSE WAVE RULES:
  // Key rule: Wave 4 can NEVER enter the price territory of Wave 1 (this is the difference from diagonals)
  
  if (isUptrend) {
    // Uptrend: Wave 1 goes up from 0 to 1
    if (w2.price <= w0.price) {
      errors.push('Wave 2 cannot retrace below the start of Wave 1 (point 0)');
    }
    if (w3.price <= w1.price) {
      errors.push('Wave 3 must extend beyond Wave 1');
    }
    // CRITICAL: Wave 4's low must stay ABOVE Wave 1's high
    // In uptrend, w4.price is Wave 4's bottom, w1.price is Wave 1's top
    if (w4.price < w1.price) {
      errors.push(`Wave 4 overlaps Wave 1 territory - invalid impulse (W4: ${w4.price.toFixed(2)}, W1 top: ${w1.price.toFixed(2)})`);
    }
    if (w5.price <= w3.price) {
      warnings.push('Wave 5 typically exceeds Wave 3 (truncation detected)');
    }
  } else {
    // Downtrend: Wave 1 goes down from 0 to 1
    if (w2.price >= w0.price) {
      errors.push('Wave 2 cannot retrace above the start of Wave 1 (point 0)');
    }
    if (w3.price >= w1.price) {
      errors.push('Wave 3 must extend beyond Wave 1');
    }
    // CRITICAL: Wave 4's high must stay BELOW Wave 1's low
    // In downtrend, w4.price is Wave 4's top, w1.price is Wave 1's bottom
    if (w4.price > w1.price) {
      errors.push(`Wave 4 overlaps Wave 1 territory - invalid impulse (W4: ${w4.price.toFixed(2)}, W1 bottom: ${w1.price.toFixed(2)})`);
    }
    if (w5.price >= w3.price) {
      warnings.push('Wave 5 typically exceeds Wave 3 (truncation detected)');
    }
  }

  const wave1Length = Math.abs(w1.price - w0.price);
  const wave2Length = Math.abs(w2.price - w1.price);
  const wave3Length = Math.abs(w3.price - w2.price);
  const wave4Length = Math.abs(w4.price - w3.price);
  const wave5Length = Math.abs(w5.price - w4.price);

  if (wave3Length < wave1Length && wave3Length < wave5Length) {
    errors.push('Wave 3 cannot be the shortest wave among waves 1, 3, and 5');
  }

  // Wave 2: Retracement of Wave 1
  const wave2Ratio = wave2Length / wave1Length;
  const wave2Score = scoreWave(wave2Ratio, 'wave2');
  fibonacciRatios.push({
    wave: 'Wave 2',
    ratio: wave2Ratio,
    idealRatio: wave2Score.idealRatio,
    validMin: wave2Score.validMin,
    validMax: wave2Score.validMax,
    quality: wave2Score.quality,
  });

  // Wave 3: Extension of Wave 1
  const wave3Ratio = wave3Length / wave1Length;
  const wave3Score = scoreWave(wave3Ratio, 'wave3');
  fibonacciRatios.push({
    wave: 'Wave 3',
    ratio: wave3Ratio,
    idealRatio: wave3Score.idealRatio,
    validMin: wave3Score.validMin,
    validMax: wave3Score.validMax,
    quality: wave3Score.quality,
  });

  // Wave 4: Retracement of Wave 3
  const wave4Ratio = wave4Length / wave3Length;
  const wave4Score = scoreWave(wave4Ratio, 'wave4');
  fibonacciRatios.push({
    wave: 'Wave 4',
    ratio: wave4Ratio,
    idealRatio: wave4Score.idealRatio,
    validMin: wave4Score.validMin,
    validMax: wave4Score.validMax,
    quality: wave4Score.quality,
  });

  // Wave 5: Extension relative to combined W1+W3 length
  const combinedW1W3 = wave1Length + wave3Length;
  const wave5Ratio = wave5Length / combinedW1W3;
  const wave5Score = scoreWave(wave5Ratio, 'wave5');
  fibonacciRatios.push({
    wave: 'Wave 5',
    ratio: wave5Ratio,
    idealRatio: wave5Score.idealRatio,
    validMin: wave5Score.validMin,
    validMax: wave5Score.validMax,
    quality: wave5Score.quality,
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    fibonacciRatios,
  };
}

export function validateCorrectiveWave(points: WavePoint[], patternType: 'correction' | 'zigzag' | 'flat' = 'zigzag'): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fibonacciRatios: ValidationResult['fibonacciRatios'] = [];

  if (points.length !== 4) {
    errors.push(`Corrective wave (ABC) requires 4 points (0, A, B, C), got ${points.length}`);
    return { isValid: false, errors, warnings, fibonacciRatios };
  }

  const [w0, wA, wB, wC] = points;
  const isDownCorrection = wA.price < w0.price;

  // Detect flat vs zigzag based on Wave B characteristics if not specified
  const waveALength = Math.abs(wA.price - w0.price);
  const waveBLength = Math.abs(wB.price - wA.price);
  const waveBRatio = waveBLength / waveALength;
  
  // Auto-detect pattern type if 'correction' (generic) - flat patterns have B >= 90% of A
  let effectiveType = patternType;
  if (patternType === 'correction') {
    effectiveType = waveBRatio >= 0.90 ? 'flat' : 'zigzag';
  }
  
  const isFlat = effectiveType === 'flat';

  if (isDownCorrection) {
    if (isFlat) {
      // Flat: Wave B typically retraces most or all of Wave A
      if (wB.price < w0.price * 0.98 && wB.price > w0.price * 1.02) {
        warnings.push('In a flat, Wave B typically retraces near or beyond the start of Wave A');
      }
    } else {
      if (wB.price >= w0.price) {
        warnings.push('In a zigzag, Wave B typically does not exceed the start of Wave A');
      }
    }
    if (wC.price >= wA.price) {
      warnings.push('Wave C usually extends beyond Wave A');
    }
  } else {
    if (isFlat) {
      if (wB.price > w0.price * 1.02 && wB.price < w0.price * 0.98) {
        warnings.push('In a flat, Wave B typically retraces near or beyond the start of Wave A');
      }
    } else {
      if (wB.price <= w0.price) {
        warnings.push('In a zigzag, Wave B typically does not exceed the start of Wave A');
      }
    }
    if (wC.price <= wA.price) {
      warnings.push('Wave C usually extends beyond Wave A');
    }
  }

  const waveCLength = Math.abs(wC.price - wB.price);

  // CRITICAL: Wave B should NEVER exceed 161.8% of Wave A in any correction type
  if (waveBRatio > 1.618) {
    errors.push('Wave B exceeds 161.8% of Wave A - this invalidates the correction pattern');
  }

  // Wave B: Use flat or zigzag rules based on pattern type
  const waveBRuleKey = isFlat ? 'waveB_flat' : 'waveB_zigzag';
  const waveBScore = scoreWave(waveBRatio, waveBRuleKey);
  fibonacciRatios.push({
    wave: 'Wave B',
    ratio: waveBRatio,
    idealRatio: waveBScore.idealRatio,
    validMin: waveBScore.validMin,
    validMax: waveBScore.validMax,
    quality: waveBScore.quality,
  });

  // Wave C: Use flat or zigzag rules based on pattern type
  const waveCRatio = waveCLength / waveALength;
  const waveCRuleKey = isFlat ? 'waveC_flat' : 'waveC_zigzag';
  const waveCScore = scoreWave(waveCRatio, waveCRuleKey);
  fibonacciRatios.push({
    wave: 'Wave C',
    ratio: waveCRatio,
    idealRatio: waveCScore.idealRatio,
    validMin: waveCScore.validMin,
    validMax: waveCScore.validMax,
    quality: waveCScore.quality,
  });

  // Detect flat subtype based on B and C relationships
  let detectedSubtype: 'regular_flat' | 'expanded_flat' | 'running_flat' | undefined;
  
  if (isFlat) {
    // Check if B exceeds the start of A (0 level)
    const bExceedsStart = isDownCorrection 
      ? wB.price > w0.price  // For down correction, B goes above 0
      : wB.price < w0.price; // For up correction, B goes below 0
    
    // Check if C exceeds the end of A (A level)
    const cExceedsA = isDownCorrection
      ? wC.price < wA.price  // For down correction, C goes below A
      : wC.price > wA.price; // For up correction, C goes above A
    
    if (bExceedsStart && cExceedsA) {
      // Expanded Flat: B exceeds 0, C exceeds A
      detectedSubtype = 'expanded_flat';
    } else if (bExceedsStart && !cExceedsA) {
      // Running Flat: B exceeds 0, but C doesn't reach A (strong trend signal)
      detectedSubtype = 'running_flat';
    } else {
      // Regular Flat: B near 0, C near or at A
      detectedSubtype = 'regular_flat';
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    fibonacciRatios,
    detectedType: isFlat ? 'flat' : 'zigzag',
    detectedSubtype,
  };
}

export function validateTriangle(points: WavePoint[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fibonacciRatios: ValidationResult['fibonacciRatios'] = [];

  if (points.length !== 6) {
    errors.push(`Triangle requires 6 points (0, A, B, C, D, E), got ${points.length}`);
    return { isValid: false, errors, warnings, fibonacciRatios };
  }

  const [w0, wA, wB, wC, wD, wE] = points;

  const highs = [w0.price, wB.price, wD.price];
  const lows = [wA.price, wC.price, wE.price];

  const highsConverging = highs[0] > highs[1] && highs[1] > highs[2];
  const lowsConverging = lows[0] < lows[1] && lows[1] < lows[2];

  if (!highsConverging && !lowsConverging) {
    warnings.push('Triangle should show converging trendlines');
  }

  const waveALength = Math.abs(wA.price - w0.price);
  const waveBLength = Math.abs(wB.price - wA.price);
  const waveCLength = Math.abs(wC.price - wB.price);
  const waveDLength = Math.abs(wD.price - wC.price);
  const waveELength = Math.abs(wE.price - wD.price);

  // Triangle waves use the triangle rule (38.2% - 78.6%)
  const waveBARatio = waveBLength / waveALength;
  const waveBAScore = scoreWave(waveBARatio, 'triangle');
  fibonacciRatios.push({
    wave: 'Wave B/A',
    ratio: waveBARatio,
    idealRatio: waveBAScore.idealRatio,
    validMin: waveBAScore.validMin,
    validMax: waveBAScore.validMax,
    quality: waveBAScore.quality,
  });

  const waveCBRatio = waveCLength / waveBLength;
  const waveCBScore = scoreWave(waveCBRatio, 'triangle');
  fibonacciRatios.push({
    wave: 'Wave C/B',
    ratio: waveCBRatio,
    idealRatio: waveCBScore.idealRatio,
    validMin: waveCBScore.validMin,
    validMax: waveCBScore.validMax,
    quality: waveCBScore.quality,
  });

  const waveDCRatio = waveDLength / waveCLength;
  const waveDCScore = scoreWave(waveDCRatio, 'triangle');
  fibonacciRatios.push({
    wave: 'Wave D/C',
    ratio: waveDCRatio,
    idealRatio: waveDCScore.idealRatio,
    validMin: waveDCScore.validMin,
    validMax: waveDCScore.validMax,
    quality: waveDCScore.quality,
  });

  const waveEDRatio = waveELength / waveDLength;
  const waveEDScore = scoreWave(waveEDRatio, 'triangle');
  fibonacciRatios.push({
    wave: 'Wave E/D',
    ratio: waveEDRatio,
    idealRatio: waveEDScore.idealRatio,
    validMin: waveEDScore.validMin,
    validMax: waveEDScore.validMax,
    quality: waveEDScore.quality,
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    fibonacciRatios,
  };
}

export function validateDiagonal(points: WavePoint[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fibonacciRatios: ValidationResult['fibonacciRatios'] = [];
  let detectedType: 'contracting' | 'expanding' | 'parallel' = 'contracting';

  if (points.length !== 6) {
    errors.push(`Diagonal requires 6 points (0-5), got ${points.length}`);
    return { isValid: false, errors, warnings, fibonacciRatios };
  }

  const [w0, w1, w2, w3, w4, w5] = points;
  const isUptrend = w5.price > w0.price;

  // Basic diagonal structure validation
  if (isUptrend) {
    if (w3.price <= w1.price) {
      errors.push('Wave 3 must exceed Wave 1 in a diagonal');
    }
    if (w5.price <= w3.price) {
      warnings.push('Wave 5 truncation in diagonal');
    }
  } else {
    if (w3.price >= w1.price) {
      errors.push('Wave 3 must exceed Wave 1 in a diagonal');
    }
    if (w5.price >= w3.price) {
      warnings.push('Wave 5 truncation in diagonal');
    }
  }

  // AUTO-CLASSIFICATION: Detect contracting vs expanding based on trendline convergence
  // This is similar to how ABC auto-detects zigzag vs flat
  const time1 = w1.time as number;
  const time2 = w2.time as number;
  const time3 = w3.time as number;
  const time4 = w4.time as number;
  
  if (time4 > time2 && time3 > time1) {
    // Lower trendline slope: W2 → W4 (correction wave endpoints)
    const lowerSlope = (w4.price - w2.price) / (time4 - time2);
    
    // Upper trendline slope: W1 → W3 (impulse wave peaks)
    const upperSlope = (w3.price - w1.price) / (time3 - time1);
    
    // Determine if converging, expanding, or parallel
    if (isUptrend) {
      // In uptrend: converging = upper slope < lower slope (lines meet above)
      if (upperSlope < lowerSlope - 0.0001) {
        detectedType = 'contracting';
      } else if (upperSlope > lowerSlope + 0.0001) {
        detectedType = 'expanding';
      } else {
        detectedType = 'parallel';
      }
    } else {
      // In downtrend: converging = upper slope > lower slope (lines meet below)
      if (upperSlope > lowerSlope + 0.0001) {
        detectedType = 'contracting';
      } else if (upperSlope < lowerSlope - 0.0001) {
        detectedType = 'expanding';
      } else {
        detectedType = 'parallel';
      }
    }
  }

  // Add classification info to warnings (will be parsed by frontend for display)
  if (detectedType === 'expanding') {
    warnings.unshift('📊 Auto-classified: Expanding Diagonal');
  } else if (detectedType === 'parallel') {
    warnings.unshift('📊 Auto-classified: Parallel Diagonal (unusual)');
  } else {
    warnings.unshift('📊 Auto-classified: Contracting Diagonal');
  }

  // Fib ratios for diagonal - using diagonal-specific rules
  const wave1Length = Math.abs(w1.price - w0.price);
  const wave2Length = Math.abs(w2.price - w1.price);
  const wave3Length = Math.abs(w3.price - w2.price);
  const wave4Length = Math.abs(w4.price - w3.price);
  const wave5Length = Math.abs(w5.price - w4.price);

  // Wave 2 retracement of Wave 1 (using diagonal-specific rules)
  if (wave1Length > 0) {
    const wave2Ratio = wave2Length / wave1Length;
    const wave2Score = scoreWave(wave2Ratio, 'wave2_diagonal');
    fibonacciRatios.push({
      wave: 'Wave 2',
      ratio: wave2Ratio,
      idealRatio: wave2Score.idealRatio,
      validMin: wave2Score.validMin,
      validMax: wave2Score.validMax,
      quality: wave2Score.quality,
    });
  }

  // Wave 3 extension of Wave 1 (using diagonal-specific rules)
  if (wave1Length > 0) {
    const wave3Ratio = wave3Length / wave1Length;
    const wave3Score = scoreWave(wave3Ratio, 'wave3_diagonal');
    fibonacciRatios.push({
      wave: 'Wave 3',
      ratio: wave3Ratio,
      idealRatio: wave3Score.idealRatio,
      validMin: wave3Score.validMin,
      validMax: wave3Score.validMax,
      quality: wave3Score.quality,
    });
  }

  // Wave 4 retracement of Wave 3 (using diagonal-specific rules)
  if (wave3Length > 0) {
    const wave4Ratio = wave4Length / wave3Length;
    const wave4Score = scoreWave(wave4Ratio, 'wave4_diagonal');
    fibonacciRatios.push({
      wave: 'Wave 4',
      ratio: wave4Ratio,
      idealRatio: wave4Score.idealRatio,
      validMin: wave4Score.validMin,
      validMax: wave4Score.validMax,
      quality: wave4Score.quality,
    });
  }

  // Wave 5 as % of Wave 3 (key diagonal measurement - using diagonal-specific rules)
  if (wave3Length > 0) {
    const wave5Ratio = wave5Length / wave3Length;
    const wave5Score = scoreWave(wave5Ratio, 'wave5_diagonal');
    fibonacciRatios.push({
      wave: 'Wave 5 (vs W3)',
      ratio: wave5Ratio,
      idealRatio: wave5Score.idealRatio,
      validMin: wave5Score.validMin,
      validMax: wave5Score.validMax,
      quality: wave5Score.quality,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    fibonacciRatios,
  };
}

// New scoring function using 4-tier tolerance bands with SOFT OVERFLOW
// Key principle: Allow small breaches beyond range if close to EDGE targets only
// Hard limits still enforced - values far outside range are always "poor"
function scoreWave(actual: number, ruleKey: string): { quality: 'excellent' | 'good' | 'ok' | 'valid' | 'poor'; idealRatio: number; validMin: number; validMax: number } {
  const rule = FIBONACCI_RULES[ruleKey];
  if (!rule) {
    return { quality: 'poor', idealRatio: 1.0, validMin: 0, validMax: 1 };
  }
  
  const { validMin, validMax, idealTargets } = rule;
  
  // Find the nearest ideal target and calculate relative error
  let nearestIdeal = idealTargets[0]?.ratio || 1.0;
  let minRelativeError = Infinity;
  
  for (const target of idealTargets) {
    const relativeError = Math.abs(actual - target.ratio) / target.ratio;
    if (relativeError < minRelativeError) {
      minRelativeError = relativeError;
      nearestIdeal = target.ratio;
    }
  }
  
  // Check if WITHIN valid range
  const isWithinRange = actual >= validMin && actual <= validMax;
  
  // SOFT OVERFLOW: Allow small breaches (up to 5%) beyond range edges
  // BUT only if close to an EDGE ideal target (first or last in idealTargets)
  const SOFT_OVERFLOW = 0.05; // 5% overflow allowed
  const edgeTargets = [idealTargets[0]?.ratio, idealTargets[idealTargets.length - 1]?.ratio];
  const isCloseToEdgeTarget = edgeTargets.some(edge => 
    edge && Math.abs(actual - edge) / edge <= TOLERANCE_BANDS.ok // Within 6% of an edge target
  );
  
  // Calculate how far outside the range (if at all)
  const overflowBelow = actual < validMin ? (validMin - actual) / validMin : 0;
  const overflowAbove = actual > validMax ? (actual - validMax) / validMax : 0;
  const totalOverflow = overflowBelow + overflowAbove;
  
  // If WAY outside range (>5% overflow) = always poor, regardless of target proximity
  if (totalOverflow > SOFT_OVERFLOW) {
    return { quality: 'poor', idealRatio: nearestIdeal, validMin, validMax };
  }
  
  // If slightly outside range but close to edge target = allow downgraded rating
  if (!isWithinRange && isCloseToEdgeTarget && totalOverflow <= SOFT_OVERFLOW) {
    // Downgrade by one tier for being outside range
    if (minRelativeError <= TOLERANCE_BANDS.excellent) {
      return { quality: 'good', idealRatio: nearestIdeal, validMin, validMax }; // Downgraded from excellent
    }
    if (minRelativeError <= TOLERANCE_BANDS.good) {
      return { quality: 'ok', idealRatio: nearestIdeal, validMin, validMax }; // Downgraded from good
    }
    if (minRelativeError <= TOLERANCE_BANDS.ok) {
      return { quality: 'valid', idealRatio: nearestIdeal, validMin, validMax }; // Downgraded from ok
    }
    // Still somewhat close to edge target but not great = valid instead of poor
    return { quality: 'valid', idealRatio: nearestIdeal, validMin, validMax };
  }
  
  // If outside range and NOT close to edge target = poor
  if (!isWithinRange) {
    return { quality: 'poor', idealRatio: nearestIdeal, validMin, validMax };
  }
  
  // WITHIN RANGE: Apply tolerance bands for rating
  if (minRelativeError <= TOLERANCE_BANDS.excellent) {
    return { quality: 'excellent', idealRatio: nearestIdeal, validMin, validMax };
  }
  
  if (minRelativeError <= TOLERANCE_BANDS.good) {
    return { quality: 'good', idealRatio: nearestIdeal, validMin, validMax };
  }
  
  if (minRelativeError <= TOLERANCE_BANDS.ok) {
    return { quality: 'ok', idealRatio: nearestIdeal, validMin, validMax };
  }
  
  // Within valid range but not hitting any ideal target = valid
  return { quality: 'valid', idealRatio: nearestIdeal, validMin, validMax };
}

// Legacy function for backward compatibility (deprecated)
function ratioQuality(actual: number, idealRatios: number[]): 'excellent' | 'valid' | 'poor' {
  const tolerance = 0.05;
  const goodTolerance = 0.15;

  for (const ideal of idealRatios) {
    const diff = Math.abs(actual - ideal);
    if (diff <= tolerance) return 'excellent';
    if (diff <= goodTolerance) return 'valid';
  }

  return 'poor';
}

export function detectPivots(candles: Candle[], lookback: number = 5): Pivot[] {
  const pivots: Pivot[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }

    if (isHigh) {
      pivots.push({
        index: i,
        price: candles[i].high,
        time: candles[i].time,
        type: 'high',
      });
    }

    if (isLow) {
      pivots.push({
        index: i,
        price: candles[i].low,
        time: candles[i].time,
        type: 'low',
      });
    }
  }

  return pivots.sort((a, b) => a.index - b.index);
}

export function autoAnalyze(candles: Candle[], startIndex: number, endIndex: number): AutoAnalysisResult {
  const slicedCandles = candles.slice(startIndex, endIndex + 1);
  const lookback = Math.max(3, Math.floor(slicedCandles.length / 50));
  const pivots = detectPivots(slicedCandles, lookback);

  const patterns: DetectedPattern[] = [];

  if (pivots.length >= 5) {
    const impulsePattern = detectImpulsePattern(pivots, slicedCandles, startIndex);
    if (impulsePattern) {
      patterns.push(impulsePattern);
    }
  }

  if (pivots.length >= 3) {
    const correctivePattern = detectCorrectivePattern(pivots, slicedCandles, startIndex);
    if (correctivePattern) {
      patterns.push(correctivePattern);
    }
  }

  const confidence = patterns.length > 0
    ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
    : 0;

  return {
    patterns,
    pivots: pivots.map(p => ({
      ...p,
      index: p.index + startIndex,
    })),
    confidence,
  };
}

function detectImpulsePattern(pivots: Pivot[], candles: Candle[], baseIndex: number): DetectedPattern | null {
  const alternatingPivots = getAlternatingPivots(pivots, 5);

  if (alternatingPivots.length < 5) {
    return null;
  }

  const [p0, p1, p2, p3, p4] = alternatingPivots;

  const isUptrend = p1.type === 'high';

  const wave1Length = Math.abs(p1.price - p0.price);
  const wave3Length = Math.abs(p3.price - p2.price);

  if (wave3Length < wave1Length * 0.5) {
    return null;
  }

  const points: WavePoint[] = [
    { index: p0.index + baseIndex, label: '0', price: p0.price, time: p0.time, isCorrection: false },
    { index: p1.index + baseIndex, label: '1', price: p1.price, time: p1.time, isCorrection: false },
    { index: p2.index + baseIndex, label: '2', price: p2.price, time: p2.time, isCorrection: true },
    { index: p3.index + baseIndex, label: '3', price: p3.price, time: p3.time, isCorrection: false },
    { index: p4.index + baseIndex, label: '4', price: p4.price, time: p4.time, isCorrection: true },
  ];

  if (alternatingPivots.length >= 6) {
    const p5 = alternatingPivots[5];
    points.push({ index: p5.index + baseIndex, label: '5', price: p5.price, time: p5.time, isCorrection: false });
  }

  const validation = validateImpulseWave(points.length === 6 ? points : [...points, { ...points[4], label: '5' }]);

  const fibScore = validation.fibonacciRatios.filter(r => r.quality === 'excellent' || r.quality === 'valid').length / validation.fibonacciRatios.length;
  const confidence = validation.isValid ? 0.7 + (fibScore * 0.3) : fibScore * 0.5;

  return {
    type: 'impulse',
    degree: 'Minor',
    points,
    confidence,
    fibonacciScore: fibScore,
    startIndex: p0.index + baseIndex,
    endIndex: (alternatingPivots[alternatingPivots.length - 1].index) + baseIndex,
  };
}

function detectCorrectivePattern(pivots: Pivot[], candles: Candle[], baseIndex: number): DetectedPattern | null {
  const alternatingPivots = getAlternatingPivots(pivots, 3);

  if (alternatingPivots.length < 3) {
    return null;
  }

  const [p0, pA, pB] = alternatingPivots;

  const waveALength = Math.abs(pA.price - p0.price);
  const waveBLength = Math.abs(pB.price - pA.price);

  if (waveBLength > waveALength * 1.2) {
    return null;
  }

  const points: WavePoint[] = [
    { index: p0.index + baseIndex, label: '0', price: p0.price, time: p0.time, isCorrection: false },
    { index: pA.index + baseIndex, label: 'A', price: pA.price, time: pA.time, isCorrection: true },
    { index: pB.index + baseIndex, label: 'B', price: pB.price, time: pB.time, isCorrection: true },
  ];

  if (alternatingPivots.length >= 4) {
    const pC = alternatingPivots[3];
    points.push({ index: pC.index + baseIndex, label: 'C', price: pC.price, time: pC.time, isCorrection: true });
  }

  const validation = validateCorrectiveWave(points.length === 4 ? points : [...points, { ...points[2], label: 'C' }]);

  const fibScore = validation.fibonacciRatios.filter(r => r.quality === 'excellent' || r.quality === 'valid').length / Math.max(validation.fibonacciRatios.length, 1);
  const confidence = validation.isValid ? 0.6 + (fibScore * 0.3) : fibScore * 0.4;

  return {
    type: 'correction',
    degree: 'Minor',
    points,
    confidence,
    fibonacciScore: fibScore,
    startIndex: p0.index + baseIndex,
    endIndex: (alternatingPivots[alternatingPivots.length - 1].index) + baseIndex,
  };
}

function getAlternatingPivots(pivots: Pivot[], minCount: number): Pivot[] {
  if (pivots.length === 0) return [];

  const result: Pivot[] = [pivots[0]];

  for (let i = 1; i < pivots.length && result.length < minCount + 1; i++) {
    if (pivots[i].type !== result[result.length - 1].type) {
      result.push(pivots[i]);
    }
  }

  return result;
}

export async function saveWaveLabel(label: InsertElliottWaveLabel): Promise<ElliottWaveLabel> {
  return storage.createElliottWaveLabel(label);
}

export async function getWaveLabels(userId: string, symbol: string, timeframe: string): Promise<ElliottWaveLabel[]> {
  return storage.getElliottWaveLabels(userId, symbol, timeframe);
}

export async function updateWaveLabel(id: string, label: Partial<InsertElliottWaveLabel>): Promise<ElliottWaveLabel | undefined> {
  return storage.updateElliottWaveLabel(id, label);
}

export async function deleteWaveLabel(id: string): Promise<boolean> {
  return storage.deleteElliottWaveLabel(id);
}

export async function clearWaveLabels(userId: string, symbol: string, timeframe: string): Promise<boolean> {
  return storage.deleteElliottWaveLabelsByUserSymbolTimeframe(userId, symbol, timeframe);
}

export { WAVE_DEGREES, CORRECTION_LABELS };
