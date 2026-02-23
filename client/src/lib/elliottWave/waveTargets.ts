/**
 * Predictive Fibonacci target calculations for Elliott Wave analysis.
 *
 * For each wave type, calculates where the NEXT wave is likely to terminate
 * based on the key Fibonacci ratios used in Elliott Wave theory.
 *
 * Target table (from Elliott Wave theory):
 *   After W1 complete  → W2 retracement zones: 38.2%, 50%, 61.8%, 78.6%
 *   After W2 complete  → W3 extension targets: 1.618, 2.618, 4.236 of W1
 *   After W3 complete  → W4 retracement: 23.6%, 38.2%, 50% of W3
 *   After W4 complete  → W5 targets: 0.618, 1.0, 1.618 of W1 length
 *   After A complete   → B retracement: 38.2%, 50%, 61.8% of A
 *   After B complete   → C targets: 1.0, 1.272, 1.618 of A
 *   After W complete   → X retracement: 38.2%, 50%, 61.8% of W
 *   After X complete   → Y targets: 1.0, 1.272, 1.618 of W
 */

import { calcRetracementLevels, calcExtensionLevels, type FibLevel } from './fibCalculator';
import type { WaveType } from '@/types/drawing';

export type { FibLevel };

/**
 * Returns predictive Fibonacci target levels for the NEXT wave, given the just-completed wave.
 *
 * @param completedWave  The wave type that was just completed
 * @param points         All placed points for the completed wave [start, ..., end]
 * @param priorW1Points  Points of Wave 1 (needed for W3/W4/W5 calculations). Optional.
 * @param priorAPoints   Points of Wave A (needed for B/C calculations). Optional.
 */
export function getPredictiveTargets(
  completedWave: WaveType,
  points: { time: number; price: number }[],
  priorW1Points?: { time: number; price: number }[],
  priorAPoints?: { time: number; price: number }[],
): FibLevel[] {
  if (points.length < 2) return [];

  const startPrice = points[0].price;
  const endPrice = points[points.length - 1].price;

  switch (completedWave) {
    case 'W1': {
      // After W1: show W2 retracement zones
      return calcRetracementLevels(startPrice, endPrice, [0.382, 0.5, 0.618, 0.786]);
    }

    case 'W2': {
      // After W2: show W3 extension targets (relative to W1 length)
      const w1Points = priorW1Points;
      if (w1Points && w1Points.length >= 2) {
        const w1Start = w1Points[0].price;
        const w1End = w1Points[w1Points.length - 1].price;
        const w1Len = Math.abs(w1End - w1Start);
        const direction = w1End > w1Start ? 1 : -1;
        return [1.618, 2.618, 4.236].map(ratio => ({
          ratio,
          price: endPrice + direction * w1Len * ratio,
          label: `${(ratio * 100).toFixed(1)}%`,
          isRetrace: false,
        }));
      }
      // Fallback: use W2 move as reference
      const w2Move = endPrice - startPrice;
      return calcExtensionLevels(endPrice - w2Move, endPrice, [1.618, 2.618, 4.236]);
    }

    case 'W3': {
      // After W3: show W4 retracement
      return calcRetracementLevels(startPrice, endPrice, [0.236, 0.382, 0.5]);
    }

    case 'W4': {
      // After W4: show W5 targets (0.618, 1.0, 1.618 of W1 length from W4 end)
      const w1Points = priorW1Points;
      if (w1Points && w1Points.length >= 2) {
        const w1Start = w1Points[0].price;
        const w1End = w1Points[w1Points.length - 1].price;
        const w1Len = Math.abs(w1End - w1Start);
        const direction = w1End > w1Start ? 1 : -1;
        return [0.618, 1.0, 1.618].map(ratio => ({
          ratio,
          price: endPrice + direction * w1Len * ratio,
          label: `${(ratio * 100).toFixed(1)}%`,
          isRetrace: false,
        }));
      }
      const w4Move = endPrice - startPrice;
      return calcExtensionLevels(endPrice - w4Move, endPrice, [0.618, 1.0, 1.618]);
    }

    case 'A': {
      // After A: show B retracement
      return calcRetracementLevels(startPrice, endPrice, [0.382, 0.5, 0.618]);
    }

    case 'B': {
      // After B: show C targets (1.0, 1.272, 1.618 of A)
      const aPoints = priorAPoints;
      if (aPoints && aPoints.length >= 2) {
        const aStart = aPoints[0].price;
        const aEnd = aPoints[aPoints.length - 1].price;
        const aLen = Math.abs(aEnd - aStart);
        const direction = aEnd > aStart ? 1 : -1;
        return [1.0, 1.272, 1.618].map(ratio => ({
          ratio,
          price: endPrice + direction * aLen * ratio,
          label: `${(ratio * 100).toFixed(1)}%`,
          isRetrace: false,
        }));
      }
      const bMove = endPrice - startPrice;
      return calcExtensionLevels(endPrice - bMove, endPrice, [1.0, 1.272, 1.618]);
    }

    case 'W': {
      // After W: show X retracement
      return calcRetracementLevels(startPrice, endPrice, [0.382, 0.5, 0.618]);
    }

    case 'X': {
      // After X: show Y targets relative to prior W wave (or X as fallback)
      const priorWave = priorW1Points ?? priorAPoints;
      if (priorWave && priorWave.length >= 2) {
        const wStart = priorWave[0].price;
        const wEnd = priorWave[priorWave.length - 1].price;
        const wLen = Math.abs(wEnd - wStart);
        const direction = wEnd > wStart ? 1 : -1;
        return [1.0, 1.272, 1.618].map(ratio => ({
          ratio,
          price: endPrice + direction * wLen * ratio,
          label: `${(ratio * 100).toFixed(1)}%`,
          isRetrace: false,
        }));
      }
      // Fallback: use X wave length
      const xMove = endPrice - startPrice;
      return calcExtensionLevels(endPrice - xMove, endPrice, [1.0, 1.272, 1.618]);
    }

    default:
      return [];
  }
}

/**
 * Returns in-progress predictive levels while a wave is being drawn.
 * Shows where the NEXT sub-wave within the current wave is likely to go.
 */
export function getInProgressPredictiveLevels(
  waveType: WaveType,
  points: { time: number; price: number }[],
): FibLevel[] {
  const n = points.length;
  if (n < 2) return [];

  const p0 = points[0].price;
  const p1 = points[n - 1].price;

  // For impulse waves: show extensions for the next internal wave
  if (['W1', 'W3', 'W5', 'A', 'C'].includes(waveType)) {
    if (n === 2) {
      // After sub-wave 1: show sub-wave 2 retracement
      return calcRetracementLevels(p0, p1, [0.382, 0.5, 0.618, 0.786]);
    }
    if (n === 3) {
      // After sub-wave 2: show sub-wave 3 extension
      const move = points[1].price - p0;
      return calcExtensionLevels(p1 - move, p1, [1.618, 2.618]);
    }
    if (n === 4) {
      // After sub-wave 3: show sub-wave 4 retracement
      return calcRetracementLevels(points[2].price, p1, [0.236, 0.382, 0.5]);
    }
    if (n === 5) {
      // After sub-wave 4: show sub-wave 5 target
      const w1Len = Math.abs(points[1].price - p0);
      const direction = points[1].price > p0 ? 1 : -1;
      return [0.618, 1.0, 1.618].map(ratio => ({
        ratio,
        price: p1 + direction * w1Len * ratio,
        label: `${(ratio * 100).toFixed(1)}%`,
        isRetrace: false,
      }));
    }
  }

  // For corrective waves: show next ABC leg
  if (['W2', 'W4', 'B', 'W', 'X', 'Y'].includes(waveType)) {
    if (n === 2) {
      // After leg A: show leg B retracement
      return calcRetracementLevels(p0, p1, [0.382, 0.5, 0.618]);
    }
    if (n === 3) {
      // After leg B: show leg C extension
      const aLen = Math.abs(points[1].price - p0);
      const direction = points[1].price > p0 ? 1 : -1;
      return [1.0, 1.272, 1.618].map(ratio => ({
        ratio,
        price: p1 + direction * aLen * ratio,
        label: `${(ratio * 100).toFixed(1)}%`,
        isRetrace: false,
      }));
    }
  }

  return [];
}
