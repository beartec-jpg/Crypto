/**
 * Progressive Elliott Wave pattern detection.
 *
 * Analyses placed points incrementally:
 *   – 2 points  (0→1)          : possible start of impulse or correction
 *   – 3 points  (0→1→2)        : W2 placed → ABC correction possible
 *   – 4 points  (0→1→2→3)      : W3 placed → ABC complete OR impulse in progress
 *   – 5 points  (0→1→2→3→4)    : W4 placed → impulse structure building
 *   – 6 points  (0→1→2→3→4→5)  : W5 placed → impulse wave complete
 */

import {
  scoreWave2,
  scoreWave3,
  scoreWave4,
  scoreWave5,
  scoreWaveB,
  scoreWaveC,
  calcRetracementLevels,
  calcExtensionLevels,
  type FibLevel,
  type WaveFibResult,
} from './fibCalculator';

export type WaveDegree =
  | 'Subminuette'
  | 'Minuette'
  | 'Minute'
  | 'Minor'
  | 'Intermediate'
  | 'Primary'
  | 'Cycle'
  | 'Supercycle';

export type DetectedPatternType = 'unknown' | 'abc_correction' | 'impulse_forming' | 'impulse_complete';

export interface ProgressivePoint {
  /** Point index label: 0, 1, 2, 3, 4, 5 */
  label: string;
  time: number;
  price: number;
  snappedToHigh: boolean;
}

export interface ValidationRule {
  rule: string;
  passed: boolean;
  message: string;
}

export interface PatternDetectionResult {
  /** How many points have been placed so far */
  pointCount: number;

  /** Auto-detected pattern type based on current points */
  detectedPattern: DetectedPatternType;

  /** Descriptive label for the pattern, e.g. "ABC Correction (Zigzag)" */
  patternLabel: string;

  /** Overall validity of the pattern so far */
  isValid: boolean;

  /** Real-time validation rule checks */
  validationRules: ValidationRule[];

  /** Fibonacci ratios scored at each pivot */
  fibRatios: WaveFibResult[];

  /** Fibonacci retracement / extension levels for the *next* expected point */
  nextPointLevels: FibLevel[];

  /** Hint for the user */
  nextPointHint: string;

  /** Wave degree tracked (increases as nested waves are detected) */
  waveDegree: WaveDegree;
}

const WAVE_DEGREES: WaveDegree[] = [
  'Subminuette',
  'Minuette',
  'Minute',
  'Minor',
  'Intermediate',
  'Primary',
  'Cycle',
  'Supercycle',
];

/**
 * Detect the current pattern state and validate Elliott Wave rules
 * given an ordered array of placed points.
 */
export function detectPattern(
  points: ProgressivePoint[],
  waveDegreeIndex: number = 3, // Default: 'Minor'
): PatternDetectionResult {
  const degree: WaveDegree = WAVE_DEGREES[Math.min(waveDegreeIndex, WAVE_DEGREES.length - 1)];
  const n = points.length;

  const base: Omit<PatternDetectionResult, 'detectedPattern' | 'patternLabel' | 'isValid' | 'validationRules' | 'fibRatios' | 'nextPointLevels' | 'nextPointHint'> = {
    pointCount: n,
    waveDegree: degree,
  };

  if (n < 2) {
    return {
      ...base,
      detectedPattern: 'unknown',
      patternLabel: 'Placing start point',
      isValid: true,
      validationRules: [],
      fibRatios: [],
      nextPointLevels: [],
      nextPointHint: n === 0
        ? 'Click a candle high or low to place point 0 (wave origin)'
        : 'Click a candle high or low to place point 1 (end of Wave 1)',
    };
  }

  const p = points.map(pt => pt.price);

  // ─── 2 points (W0 → W1) ───────────────────────────────────────────────────
  if (n === 2) {
    const retraceLevels = calcRetracementLevels(p[0], p[1]);
    return {
      ...base,
      detectedPattern: 'unknown',
      patternLabel: 'Wave 1 placed',
      isValid: true,
      validationRules: [],
      fibRatios: [],
      nextPointLevels: retraceLevels,
      nextPointHint: 'Click a Fibonacci retracement level to place point 2 (Wave 2 end)',
    };
  }

  // ─── 3 points (W0 → W1 → W2) ─────────────────────────────────────────────
  if (n === 3) {
    const rules: ValidationRule[] = [];
    const isUptrend = p[1] > p[0];

    // Rule: W2 cannot retrace beyond W0
    const w2BeyondW0 = isUptrend ? p[2] <= p[0] : p[2] >= p[0];
    rules.push({
      rule: 'W2 cannot exceed W0',
      passed: !w2BeyondW0,
      message: w2BeyondW0
        ? 'Wave 2 has retraced beyond the origin – invalid Elliott Wave'
        : 'Wave 2 stays above W0 ✓',
    });

    const w2Score = scoreWave2(p[0], p[1], p[2]);

    // After W2 → show W3 extension levels projected from W2 using W1 as basis
    // calcExtensionLevels(start, end) → prices = end + direction * |end-start| * ratio
    // We want: p[2] + direction_w1 * w1_len * ratio, so use (p[2]-w1move, p[2]) as args
    const w1Move = p[1] - p[0];
    const extLevels = calcExtensionLevels(p[2] - w1Move, p[2]);

    const isValid = rules.every(r => r.passed);
    return {
      ...base,
      detectedPattern: 'unknown',
      patternLabel: 'Wave 2 placed – ABC correction started',
      isValid,
      validationRules: rules,
      fibRatios: [w2Score],
      nextPointLevels: extLevels,
      nextPointHint: isValid
        ? 'Place point 3: Wave A end (first leg of ABC correction) or Wave 3 (impulse)'
        : 'Warning: W2 violates Elliott Wave rules',
    };
  }

  // ─── 4 points (W0 → W1 → W2 → W3/A) ─────────────────────────────────────
  if (n === 4) {
    const isUptrend = p[1] > p[0];
    const rules: ValidationRule[] = [];

    // After 4 points, we can determine whether this looks like an ABC (W3 = Wave A)
    // or the start of an impulse (W3 continues the impulse beyond W1)
    const w3ExceedsW1 = isUptrend ? p[3] > p[1] : p[3] < p[1];

    let patternType: DetectedPatternType;
    let patternLabel: string;

    if (w3ExceedsW1) {
      patternType = 'impulse_forming';
      patternLabel = 'Wave 3 placed – Impulse wave forming';
    } else {
      patternType = 'abc_correction';
      patternLabel = 'Wave A placed – ABC Correction forming';
    }

    // Validate W2 rule still holds
    const w2BeyondW0 = isUptrend ? p[2] <= p[0] : p[2] >= p[0];
    rules.push({
      rule: 'W2 cannot exceed W0',
      passed: !w2BeyondW0,
      message: w2BeyondW0 ? 'Wave 2 retraced beyond W0 – invalid' : 'W2 above W0 ✓',
    });

    const fibRatios: WaveFibResult[] = [scoreWave2(p[0], p[1], p[2])];

    let nextPointLevels: FibLevel[];
    let nextPointHint: string;

    if (patternType === 'impulse_forming') {
      // W4 retraces W3 – show retracement of W3
      fibRatios.push(scoreWave3(p[0], p[1], p[2], p[3]));

      // W3 cannot be shortest
      const w1Len = Math.abs(p[1] - p[0]);
      const w3Len = Math.abs(p[3] - p[2]);
      const w3LenAcceptable = w3Len >= w1Len * 0.5;
      rules.push({
        rule: 'W3 is not shortest',
        passed: w3LenAcceptable,
        message: w3LenAcceptable ? 'W3 length acceptable ✓' : 'W3 is shorter than expected',
      });

      nextPointLevels = calcRetracementLevels(p[2], p[3]);
      nextPointHint = 'Place point 4: Wave 4 retracement (must stay above W1 in uptrend)';
    } else {
      // ABC Wave B retraces A
      fibRatios.push(scoreWaveB(p[1], p[2], p[3]));
      // Wave C extension: project from Wave B end using Wave A as basis
      // We want: p[3] + direction_wa * wa_len * ratio
      const waMove = p[2] - p[1];
      nextPointLevels = calcExtensionLevels(p[3] - waMove, p[3]);
      nextPointHint = 'Place point 4: Wave C extension (completes ABC correction)';
    }

    return {
      ...base,
      detectedPattern: patternType,
      patternLabel,
      isValid: rules.every(r => r.passed),
      validationRules: rules,
      fibRatios,
      nextPointLevels,
      nextPointHint,
    };
  }

  // ─── 5 points (W0 → W1 → W2 → W3 → W4) ──────────────────────────────────
  if (n === 5) {
    const isUptrend = p[1] > p[0];
    const rules: ValidationRule[] = [];

    const w3ExceedsW1 = isUptrend ? p[3] > p[1] : p[3] < p[1];

    if (w3ExceedsW1) {
      // 5th point is W4 – impulse forming
      const w2BeyondW0 = isUptrend ? p[2] <= p[0] : p[2] >= p[0];
      rules.push({
        rule: 'W2 cannot exceed W0',
        passed: !w2BeyondW0,
        message: w2BeyondW0 ? 'Wave 2 retraced beyond W0 – invalid' : 'W2 above W0 ✓',
      });

      // W4 cannot enter W1 territory
      const w4OverlapsW1 = isUptrend ? p[4] < p[1] : p[4] > p[1];
      rules.push({
        rule: 'W4 cannot overlap W1',
        passed: !w4OverlapsW1,
        message: w4OverlapsW1
          ? 'Wave 4 overlaps Wave 1 territory – invalid impulse'
          : 'W4 does not overlap W1 ✓',
      });

      const fibRatios: WaveFibResult[] = [
        scoreWave2(p[0], p[1], p[2]),
        scoreWave3(p[0], p[1], p[2], p[3]),
        scoreWave4(p[2], p[3], p[4]),
      ];

      // W5 extension levels from W4
      const w1Len = Math.abs(p[1] - p[0]);
      const extLevels = calcExtensionLevels(p[3], p[4]).map(lvl => ({
        ...lvl,
        price: p[4] + (isUptrend ? 1 : -1) * w1Len * lvl.ratio,
      }));

      return {
        ...base,
        detectedPattern: 'impulse_forming',
        patternLabel: 'Wave 4 placed – Impulse almost complete',
        isValid: rules.every(r => r.passed),
        validationRules: rules,
        fibRatios,
        nextPointLevels: extLevels,
        nextPointHint: 'Place point 5: Wave 5 completion (projected extension of W1 from W4)',
      };
    } else {
      // 5th point is Wave C end → ABC complete
      const wALen = Math.abs(p[3] - p[2]);
      const wCLen = Math.abs(p[4] - p[3]);
      const wCAdequate = wCLen >= wALen * 0.5;

      rules.push({
        rule: 'Wave C extends beyond Wave A',
        passed: wCAdequate,
        message: wCAdequate ? 'Wave C extends adequately ✓' : 'Wave C is unusually short',
      });

      const bRatio = Math.abs(p[3] - p[2]) / Math.abs(p[2] - p[1]);
      const bRatioValid = bRatio <= 1.618;
      rules.push({
        rule: 'Wave B within valid range',
        passed: bRatioValid,
        message: bRatioValid ? 'Wave B within 161.8% of A ✓' : 'Wave B exceeds 161.8% – invalid',
      });

      const fibRatios: WaveFibResult[] = [
        scoreWave2(p[0], p[1], p[2]),
        scoreWaveB(p[1], p[2], p[3]),
        scoreWaveC(p[1], p[2], p[3], p[4]),
      ];

      // After ABC – suggest next impulse start (W0 of next degree)
      return {
        ...base,
        detectedPattern: 'abc_correction',
        patternLabel: 'ABC Correction complete',
        isValid: rules.every(r => r.passed),
        validationRules: rules,
        fibRatios,
        nextPointLevels: [],
        nextPointHint: 'ABC Correction complete. Continue to next impulse wave, or add nested degree.',
      };
    }
  }

  // ─── 6 points (W0 → W1 → W2 → W3 → W4 → W5) ─────────────────────────────
  if (n === 6) {
    const isUptrend = p[1] > p[0];
    const rules: ValidationRule[] = [];

    const w2BeyondW0 = isUptrend ? p[2] <= p[0] : p[2] >= p[0];
    rules.push({
      rule: 'W2 cannot exceed W0',
      passed: !w2BeyondW0,
      message: w2BeyondW0 ? 'Wave 2 retraced beyond W0 – invalid' : 'W2 above W0 ✓',
    });

    const w4OverlapsW1 = isUptrend ? p[4] < p[1] : p[4] > p[1];
    rules.push({
      rule: 'W4 cannot overlap W1',
      passed: !w4OverlapsW1,
      message: w4OverlapsW1 ? 'Wave 4 overlaps Wave 1 – invalid impulse' : 'W4 does not overlap W1 ✓',
    });

    const w1Len = Math.abs(p[1] - p[0]);
    const w3Len = Math.abs(p[3] - p[2]);
    const w5Len = Math.abs(p[5] - p[4]);
    rules.push({
      rule: 'W3 is not shortest',
      passed: !(w3Len < w1Len && w3Len < w5Len),
      message: !(w3Len < w1Len && w3Len < w5Len) ? 'W3 is not shortest ✓' : 'W3 cannot be shortest wave',
    });

    const fibRatios: WaveFibResult[] = [
      scoreWave2(p[0], p[1], p[2]),
      scoreWave3(p[0], p[1], p[2], p[3]),
      scoreWave4(p[2], p[3], p[4]),
      scoreWave5(p[0], p[1], p[2], p[3], p[4], p[5]),
    ];

    return {
      ...base,
      detectedPattern: 'impulse_complete',
      patternLabel: 'Impulse Wave (1-2-3-4-5) complete',
      isValid: rules.every(r => r.passed),
      validationRules: rules,
      fibRatios,
      nextPointLevels: [],
      nextPointHint: 'Impulse complete. Expect ABC correction next, or continue to next impulse degree.',
    };
  }

  // More than 6 points – ignore extras
  return {
    ...base,
    detectedPattern: 'unknown',
    patternLabel: 'Pattern complete',
    isValid: true,
    validationRules: [],
    fibRatios: [],
    nextPointLevels: [],
    nextPointHint: 'Pattern complete. Reset to start a new wave sequence.',
  };
}
