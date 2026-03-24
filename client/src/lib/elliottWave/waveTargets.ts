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

import { calcRetracementLevels, calcTrendBasedExtension, type FibLevel } from './fibCalculator';
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
        return calcTrendBasedExtension(
          w1Points[0].price,
          w1Points[w1Points.length - 1].price,
          endPrice,
          [1.618, 2.618, 4.236],
        );
      }
      // Fallback when W1 data is unavailable: use W2 length as a rough proxy for W1.
      // W3 continues opposite to W2 direction (W2 is a corrective wave; W3 resumes the trend).
      const w2Direction = endPrice > startPrice ? 1 : -1;
      const w2Len = Math.abs(endPrice - startPrice);
      return [1.618, 2.618, 4.236].map(ratio => ({
        ratio,
        price: endPrice + (-w2Direction) * w2Len * ratio,
        label: `${(ratio * 100).toFixed(1)}%`,
        isRetrace: false,
      }));
    }

    case 'W3': {
      // After W3: show W4 retracement
      return calcRetracementLevels(startPrice, endPrice, [0.236, 0.382, 0.5]);
    }

    case 'W4': {
      // After W4: show W5 targets (0.618, 1.0, 1.618 of W1 length from W4 end)
      const w1Points = priorW1Points;
      if (w1Points && w1Points.length >= 2) {
        return calcTrendBasedExtension(
          w1Points[0].price,
          w1Points[w1Points.length - 1].price,
          endPrice,
          [0.618, 1.0, 1.618],
        );
      }
      // Fallback when W1 data is unavailable: use W4 length as a rough proxy for W1.
      // W5 continues opposite to W4 direction (W4 is corrective; W5 resumes the trend).
      const w4Direction = endPrice > startPrice ? 1 : -1;
      const w4Len = Math.abs(endPrice - startPrice);
      return [0.618, 1.0, 1.618].map(ratio => ({
        ratio,
        price: endPrice + (-w4Direction) * w4Len * ratio,
        label: `${(ratio * 100).toFixed(1)}%`,
        isRetrace: false,
      }));
    }

    case 'A': {
      // After A: show B retracement
      return calcRetracementLevels(startPrice, endPrice, [0.382, 0.5, 0.618]);
    }

    case 'B': {
      // After B: show C targets (1.0, 1.272, 1.618 of A)
      const aPoints = priorAPoints;
      if (aPoints && aPoints.length >= 2) {
        return calcTrendBasedExtension(
          aPoints[0].price,
          aPoints[aPoints.length - 1].price,
          endPrice,
          [1.0, 1.272, 1.618],
        );
      }
      // Fallback when A data is unavailable: use B length as proxy.
      // C continues opposite to B direction (B is corrective; C resumes A's direction).
      const bDirection = endPrice > startPrice ? 1 : -1;
      const bLen = Math.abs(endPrice - startPrice);
      return [1.0, 1.272, 1.618].map(ratio => ({
        ratio,
        price: endPrice + (-bDirection) * bLen * ratio,
        label: `${(ratio * 100).toFixed(1)}%`,
        isRetrace: false,
      }));
    }

    case 'W': {
      // After W: show X retracement
      return calcRetracementLevels(startPrice, endPrice, [0.382, 0.5, 0.618]);
    }

    case 'X': {
      // After X: show Y targets relative to prior W wave (or X as fallback)
      const priorWave = priorW1Points ?? priorAPoints;
      if (priorWave && priorWave.length >= 2) {
        return calcTrendBasedExtension(
          priorWave[0].price,
          priorWave[priorWave.length - 1].price,
          endPrice,
          [1.0, 1.272, 1.618],
        );
      }
      // Fallback when W data is unavailable: use X length as proxy.
      // Y continues opposite to X direction (X is corrective; Y resumes W's direction).
      const xDirection = endPrice > startPrice ? 1 : -1;
      const xLen = Math.abs(endPrice - startPrice);
      return [1.0, 1.272, 1.618].map(ratio => ({
        ratio,
        price: endPrice + (-xDirection) * xLen * ratio,
        label: `${(ratio * 100).toFixed(1)}%`,
        isRetrace: false,
      }));
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
      // After sub-wave 2: project sub-wave 1 length from sub-wave 2 end
      return calcTrendBasedExtension(p0, points[1].price, p1, [1.618, 2.618]);
    }
    if (n === 4) {
      // After sub-wave 3: show sub-wave 4 retracement
      return calcRetracementLevels(points[2].price, p1, [0.236, 0.382, 0.5]);
    }
    if (n === 5) {
      // After sub-wave 4: project sub-wave 1 length from sub-wave 4 end
      return calcTrendBasedExtension(p0, points[1].price, p1, [0.618, 1.0, 1.618]);
    }
  }

  // For corrective waves: show next ABC leg
  if (['W2', 'W4', 'B', 'W', 'X', 'Y'].includes(waveType)) {
    if (n === 2) {
      // After leg A: show leg B retracement
      return calcRetracementLevels(p0, p1, [0.382, 0.5, 0.618]);
    }
    if (n === 3) {
      // After leg B: project leg A length from leg B end
      return calcTrendBasedExtension(p0, points[1].price, p1, [1.0, 1.272, 1.618]);
    }
  }

  return [];
}
