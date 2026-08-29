import { describe, it, expect } from 'vitest';
import {
  calcExtensionLevels,
  calcTrendBasedExtension,
  calcW5ProjectionLevels,
  scoreWave5,
  measureWave5Percent,
  w1ProjectionsFailToClearW3,
} from '@/lib/elliottWave/fibCalculator';
import {
  getPredictiveTargets,
  getInProgressPredictiveLevels,
} from '@/lib/elliottWave/waveTargets';

const pt = (price: number) => ({ time: 0, price });

// ---------------------------------------------------------------------------
// calcTrendBasedExtension
// ---------------------------------------------------------------------------
describe('calcTrendBasedExtension', () => {
  it('projects W1 length from W2 end (uptrend)', () => {
    // W0=1.35, W1_end=1.61 → W1 length=0.26; project from W2_end=1.42
    const levels = calcTrendBasedExtension(1.35, 1.61, 1.42, [1.618]);
    expect(levels[0].price).toBeCloseTo(1.42 + 0.26 * 1.618, 5);
    expect(levels[0].isRetrace).toBe(false);
  });

  it('projects W1 length from W2 end (downtrend)', () => {
    // W0=1.61, W1_end=1.35 → W1 length=0.26, direction=-1; project from W2_end=1.52
    const levels = calcTrendBasedExtension(1.61, 1.35, 1.52, [1.618]);
    expect(levels[0].price).toBeCloseTo(1.52 - 0.26 * 1.618, 5);
    expect(levels[0].isRetrace).toBe(false);
  });

  it('returns correct label', () => {
    const [level] = calcTrendBasedExtension(0, 1, 2, [1.618]);
    expect(level.label).toBe('161.8%');
  });

  it('handles zero-length wave gracefully', () => {
    const levels = calcTrendBasedExtension(1.0, 1.0, 2.0, [1.618]);
    // direction=1 but length=0, so all targets land on projectionStart
    expect(levels[0].price).toBe(2.0);
  });
});

// ---------------------------------------------------------------------------
// calcExtensionLevels
// ---------------------------------------------------------------------------
describe('calcExtensionLevels', () => {
  it('projects upward from baseEnd', () => {
    const [level] = calcExtensionLevels(1.0, 1.5, [1.0]);
    // baseLength=0.5, direction=1 → 1.5 + 0.5*1.0 = 2.0
    expect(level.price).toBeCloseTo(2.0, 5);
  });

  it('projects downward when baseEnd < baseStart', () => {
    const [level] = calcExtensionLevels(1.5, 1.0, [1.0]);
    // baseLength=0.5, direction=-1 → 1.0 - 0.5*1.0 = 0.5
    expect(level.price).toBeCloseTo(0.5, 5);
  });
});

// ---------------------------------------------------------------------------
// getPredictiveTargets — W2 case (primary path with W1 data)
// ---------------------------------------------------------------------------
describe('getPredictiveTargets W2 → W3 targets', () => {
  const w1Points = [pt(1.35), pt(1.61)]; // W1 length = 0.26
  const w2Points = [pt(1.61), pt(1.42)]; // W2 ends at 1.42

  it('1.618 target projects W1 length from W2 end (uptrend)', () => {
    const levels = getPredictiveTargets('W2', w2Points, w1Points);
    const l = levels.find(l => l.ratio === 1.618)!;
    expect(l).toBeDefined();
    expect(l.price).toBeCloseTo(1.42 + 0.26 * 1.618, 5); // 1.8207
  });

  it('2.618 and 4.236 targets are also projected from W2 end', () => {
    const levels = getPredictiveTargets('W2', w2Points, w1Points);
    const l2 = levels.find(l => l.ratio === 2.618)!;
    const l4 = levels.find(l => l.ratio === 4.236)!;
    expect(l2.price).toBeCloseTo(1.42 + 0.26 * 2.618, 5);
    expect(l4.price).toBeCloseTo(1.42 + 0.26 * 4.236, 5);
  });
});

// ---------------------------------------------------------------------------
// getPredictiveTargets — W2 fallback (no W1 data available)
// ---------------------------------------------------------------------------
describe('getPredictiveTargets W2 fallback', () => {
  it('targets go in trend direction (opposite to W2 corrective move)', () => {
    // W2 went DOWN: start=1.61, end=1.42; W3 should go UP
    const w2Points = [pt(1.61), pt(1.42)];
    const levels = getPredictiveTargets('W2', w2Points); // no priorW1Points
    levels.forEach(l => {
      expect(l.price).toBeGreaterThan(1.42); // all targets above W2 end
    });
  });

  it('targets go in trend direction for downtrend W2 fallback', () => {
    // W2 went UP (retracement of a downtrend): start=1.35, end=1.52; W3 should go DOWN
    const w2Points = [pt(1.35), pt(1.52)];
    const levels = getPredictiveTargets('W2', w2Points);
    levels.forEach(l => {
      expect(l.price).toBeLessThan(1.52); // all targets below W2 end
    });
  });
});

// ---------------------------------------------------------------------------
// getPredictiveTargets — W4 fallback
// ---------------------------------------------------------------------------
describe('getPredictiveTargets W4 fallback', () => {
  it('W5 targets go in trend direction (opposite to W4 corrective move)', () => {
    // W4 went DOWN: start=2.0, end=1.80; W5 should go UP
    const w4Points = [pt(2.0), pt(1.80)];
    const levels = getPredictiveTargets('W4', w4Points);
    levels.forEach(l => {
      expect(l.price).toBeGreaterThan(1.80);
    });
  });
});

// ---------------------------------------------------------------------------
// getPredictiveTargets — B fallback
// ---------------------------------------------------------------------------
describe('getPredictiveTargets B fallback', () => {
  it('C targets go in A direction (opposite to B retracement)', () => {
    // A went DOWN: start=2.0, end=1.50; B went UP: start=1.50, end=1.75; C should go DOWN
    const bPoints = [pt(1.50), pt(1.75)];
    const levels = getPredictiveTargets('B', bPoints);
    levels.forEach(l => {
      expect(l.price).toBeLessThan(1.75);
    });
  });
});

// ---------------------------------------------------------------------------
// getInProgressPredictiveLevels — impulse n===3 (the key bug fix)
// ---------------------------------------------------------------------------
describe('getInProgressPredictiveLevels impulse n===3', () => {
  it('projects W1 length from W2 end, not from W0 (uptrend)', () => {
    // W0=1.35, W1_end=1.61, W2_end=1.42
    const points = [pt(1.35), pt(1.61), pt(1.42)];
    const levels = getInProgressPredictiveLevels('W1', points);
    const l = levels.find(l => l.ratio === 1.618)!;
    expect(l).toBeDefined();
    // Must equal W2_end + W1_len * 1.618 = 1.42 + 0.26 * 1.618 ≈ 1.8207
    expect(l.price).toBeCloseTo(1.42 + 0.26 * 1.618, 5);
    // Must NOT equal a value measured from W0 (which would be different)
    expect(l.price).not.toBeCloseTo(1.35 + 0.26 * 1.618, 4);
  });

  it('projects W1 length from W2 end (downtrend)', () => {
    // W0=1.61, W1_end=1.35, W2_end=1.52
    const points = [pt(1.61), pt(1.35), pt(1.52)];
    const levels = getInProgressPredictiveLevels('W1', points);
    const l = levels.find(l => l.ratio === 1.618)!;
    expect(l).toBeDefined();
    expect(l.price).toBeCloseTo(1.52 - 0.26 * 1.618, 5);
  });

  it('works for W3 wave type (same logic)', () => {
    const points = [pt(1.35), pt(1.61), pt(1.42)];
    const levels = getInProgressPredictiveLevels('W3', points);
    const l = levels.find(l => l.ratio === 1.618)!;
    expect(l.price).toBeCloseTo(1.42 + 0.26 * 1.618, 5);
  });
});

// ---------------------------------------------------------------------------
// getInProgressPredictiveLevels — corrective n===3 (already correct, verify)
// ---------------------------------------------------------------------------
describe('getInProgressPredictiveLevels corrective n===3', () => {
  it('projects A length from B end for C targets', () => {
    // A start=2.0, A end=1.50, B end=1.75; C should go down from 1.75
    const points = [pt(2.0), pt(1.50), pt(1.75)];
    const levels = getInProgressPredictiveLevels('W2', points);
    const l = levels.find(l => l.ratio === 1.0)!;
    expect(l).toBeDefined();
    // A length = 0.50, direction = down (-1), project from B end 1.75
    expect(l.price).toBeCloseTo(1.75 - 0.50 * 1.0, 5);
  });
});

describe('calcW5ProjectionLevels', () => {
  it('uses trend-based W1 from W4 for normal impulse', () => {
    // W0=100, W1=120 (len 20), W2=108, W3=150 (len 42), W4=130
    const levels = calcW5ProjectionLevels(100, 120, 108, 150, 130);
    const w1Target = levels.find(l => l.ratio === 1.0 && l.label.includes('W1'));
    expect(w1Target).toBeDefined();
    expect(w1Target!.price).toBeCloseTo(150, 5); // 130 + 20
  });

  it('adds W3-based targets when shallow W1 + extended W3 cannot clear W3 peak', () => {
    // W1 len=5, W3 peak=160, W4=145 — max W1 161.8% = 153.09 < 160
    const levels = calcW5ProjectionLevels(100, 105, 102, 160, 145);
    expect(w1ProjectionsFailToClearW3(100, 105, 160, 145)).toBe(true);
    const w3Target = levels.find(l => l.label.includes('W3') && l.ratio === 1.0);
    expect(w3Target).toBeDefined();
    // W3 len=58, projected from W4
    expect(w3Target!.price).toBeCloseTo(203, 5);
    expect(w3Target!.price).toBeGreaterThan(160);
  });
});

describe('measured W5 vs W1 (every degree)', () => {
  // W0=1.00, W1=1.20 (len 0.20), W2=1.08, W3=1.403, W4=1.28, W5=1.48 (len 0.20 = 100% of W1)
  it('equals 100% of W1, not ~50% of W0→W3 net', () => {
    const pct = measureWave5Percent(1.00, 1.20, 1.08, 1.403, 1.28, 1.48, 'impulse');
    expect(pct).toBeCloseTo(100, 5);
    const scored = scoreWave5(1.00, 1.20, 1.08, 1.403, 1.28, 1.48);
    expect(scored.ratio).toBeCloseTo(1.0, 5);
  });

  it('diagonals measure W5 against W3', () => {
    const pct = measureWave5Percent(1.00, 1.20, 1.08, 1.30, 1.22, 1.34, 'ending_diagonal');
    // W5=0.12, W3=0.22 → ~54.5%
    expect(pct).toBeCloseTo((0.12 / 0.22) * 100, 5);
  });
});
