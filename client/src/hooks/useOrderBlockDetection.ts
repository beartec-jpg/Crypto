import { useMemo } from 'react';
import type { Candle } from '@/types/candle';
import type { FVGDetection } from '@/types/fvg';
import type { OrderBlock, OrderBlockSettings } from '@/types/orderBlock';

const VOLUME_LOOKBACK = 20;

interface UseOrderBlockDetectionOptions {
  candles: Candle[];
  settings: OrderBlockSettings;
  fvgs?: FVGDetection[];
}

function getAverageVolume(candles: Candle[], index: number, lookback: number): number {
  const start = Math.max(0, index - lookback);
  const slice = candles.slice(start, index);
  if (slice.length === 0) return 0;
  return slice.reduce((sum, c) => sum + c.volume, 0) / slice.length;
}

function findRecentSwingHigh(candles: Candle[], index: number, lookback = 20): number {
  const start = Math.max(0, index - lookback);
  let high = -Infinity;
  for (let i = start; i <= index; i++) {
    if (candles[i].high > high) high = candles[i].high;
  }
  return high;
}

function findRecentSwingLow(candles: Candle[], index: number, lookback = 20): number {
  const start = Math.max(0, index - lookback);
  let low = Infinity;
  for (let i = start; i <= index; i++) {
    if (candles[i].low < low) low = candles[i].low;
  }
  return low;
}

function checkForFVG(nextCandles: Candle[]): boolean {
  if (nextCandles.length < 2) return false;
  for (let i = 0; i < nextCandles.length - 2; i++) {
    const c1 = nextCandles[i];
    const c3 = nextCandles[i + 2];
    // Bullish FVG
    if (c1.high < c3.low) return true;
    // Bearish FVG
    if (c1.low > c3.high) return true;
  }
  return false;
}

function analyzeDisplacement(
  obCandle: Candle,
  nextCandles: Candle[],
  allCandles: Candle[],
  index: number,
  minPercent: number,
) {
  const createdFVG = checkForFVG(nextCandles);
  const recentSwingHigh = findRecentSwingHigh(allCandles, index);
  const recentSwingLow = findRecentSwingLow(allCandles, index);

  const brokePreviousHigh = nextCandles.some(c => c.high > recentSwingHigh);
  const brokePreviousLow = nextCandles.some(c => c.low < recentSwingLow);

  const last = nextCandles[nextCandles.length - 1];
  const moveSize = Math.abs(last.close - obCandle.close);
  const strength = obCandle.close > 0 ? (moveSize / obCandle.close) * 100 : 0;

  // Directional bias: each subsequent candle's close must move in the same direction
  const bullish =
    nextCandles.length > 0 &&
    last.close > obCandle.close &&
    strength >= minPercent;

  const bearish =
    nextCandles.length > 0 &&
    last.close < obCandle.close &&
    strength >= minPercent;

  return { bullish, bearish, createdFVG, brokePreviousHigh, brokePreviousLow, strength };
}

/**
 * Detect Order Blocks from candle data, track mitigation and FVG confluence.
 */
export function useOrderBlockDetection({
  candles,
  settings,
  fvgs = [],
}: UseOrderBlockDetectionOptions): OrderBlock[] {
  return useMemo(() => {
    if (!settings.enabled || candles.length < 4) return [];

    const lookforward = Math.max(1, settings.minDisplacementCandles);
    const raw: OrderBlock[] = [];

    for (let i = 0; i < candles.length - lookforward; i++) {
      const current = candles[i];
      const nextCandles = candles.slice(i + 1, i + 1 + lookforward);

      const candleRange = current.high - current.low;
      if (candleRange <= 0) continue;

      const bodySize = Math.abs(current.close - current.open);
      const bodyPercent = (bodySize / candleRange) * 100;
      if (bodyPercent < settings.minBodyPercent) continue;

      const isBearishCandle = current.close < current.open;
      const isBullishCandle = current.close > current.open;

      const displacement = analyzeDisplacement(
        current,
        nextCandles,
        candles,
        i,
        settings.minDisplacementPercent,
      );

      const avgVolume = getAverageVolume(candles, i, VOLUME_LOOKBACK);
      const volumeRatio = avgVolume > 0 ? current.volume / avgVolume : 1;

      // Bullish OB: Red candle followed by bullish displacement
      if (isBearishCandle && displacement.bullish) {
        // Strict mode filters
        if (settings.requireFVG && !displacement.createdFVG) continue;
        if (settings.requireBOS && !displacement.brokePreviousHigh) continue;

        raw.push({
          id: `ob-bull-${current.time}`,
          type: 'bullish',
          top: current.high,
          bottom: current.low,
          extremeTop: current.open,
          extremeBottom: current.low,
          time: current.time,
          formationIndex: i,
          age: 0,
          causedFVG: displacement.createdFVG,
          causedBOS: displacement.brokePreviousHigh,
          displacementStrength: displacement.strength,
          mitigated: false,
          mitigationPercent: 0,
          mitigationTime: undefined,
          swept: false,
          sweepTime: undefined,
          sweepPrice: undefined,
          sweepIndex: undefined,
          hasFVGConfluence: false,
          confluenceFVGId: undefined,
          volume: current.volume,
          volumeRatio,
        });
      }

      // Bearish OB: Green candle followed by bearish displacement
      if (isBullishCandle && displacement.bearish) {
        // Strict mode filters
        if (settings.requireFVG && !displacement.createdFVG) continue;
        if (settings.requireBOS && !displacement.brokePreviousLow) continue;

        raw.push({
          id: `ob-bear-${current.time}`,
          type: 'bearish',
          top: current.high,
          bottom: current.low,
          extremeTop: current.high,
          extremeBottom: current.close,
          time: current.time,
          formationIndex: i,
          age: 0,
          causedFVG: displacement.createdFVG,
          causedBOS: displacement.brokePreviousLow,
          displacementStrength: displacement.strength,
          mitigated: false,
          mitigationPercent: 0,
          mitigationTime: undefined,
          swept: false,
          sweepTime: undefined,
          sweepPrice: undefined,
          sweepIndex: undefined,
          hasFVGConfluence: false,
          confluenceFVGId: undefined,
          volume: current.volume,
          volumeRatio,
        });
      }
    }

    // Phase 2: sweep detection, breaker conversion, mitigation tracking, age, and confluence
    const totalCandles = candles.length;
    const result: OrderBlock[] = [];
    const confirmationWindow = 3;

    for (const ob of raw) {
      const startIdx = candles.findIndex(c => c.time === ob.time);
      if (startIdx < 0) continue;

      const age = totalCandles - 1 - startIdx;
      if (age > settings.maxAge) continue;

      let mitigated = false;
      let mitigationPercent = 0;
      let mitigationTime: number | undefined;
      let swept = false;
      let sweepTime: number | undefined;
      let sweepPrice: number | undefined;
      let sweepIndex: number | undefined;
      let breaker = false;
      let breakerType: 'bullish' | 'bearish' | undefined;
      let conversionTime: number | undefined;
      let conversionIndex: number | undefined;
      let conversionPrice: number | undefined;

      for (let j = startIdx + 1; j < candles.length; j++) {
        const c = candles[j];

        // Check for body pass-through (single candle body completely traverses the OB zone)
        const passedThrough =
          (ob.type === 'bullish' && c.open > ob.bottom && c.close < ob.bottom) ||
          (ob.type === 'bearish' && c.open < ob.top && c.close > ob.top);

        if (passedThrough && !swept && !breaker && !mitigated) {
          let closedBackInside = false;

          // Check next N candles for confirmation
          for (let k = j + 1; k <= Math.min(j + confirmationWindow, candles.length - 1); k++) {
            const confirmCandle = candles[k];

            if (ob.type === 'bullish') {
              if (confirmCandle.close >= ob.bottom) {
                closedBackInside = true;
                break;
              }
            } else {
              if (confirmCandle.close <= ob.top) {
                closedBackInside = true;
                break;
              }
            }
          }

          if (closedBackInside) {
            // SWEEP: Price came back inside, OB stays valid
            swept = true;
            sweepTime = c.time;
            sweepPrice = ob.type === 'bullish' ? c.low : c.high;
            sweepIndex = j;
          } else {
            // BREAKER: All confirmation candles stayed on opposite side, OB converts
            breaker = true;
            breakerType = ob.type === 'bullish' ? 'bearish' : 'bullish';
            conversionTime = c.time;
            conversionIndex = j;
            conversionPrice = c.close;
            break;
          }
        }

        // Check breaker mitigation (price closes through the breaker zone again)
        if (breaker && !mitigated) {
          if (breakerType === 'bullish' && c.close < ob.bottom) {
            mitigated = true;
            mitigationPercent = 100;
            mitigationTime = c.time;
            break;
          }
          if (breakerType === 'bearish' && c.close > ob.top) {
            mitigated = true;
            mitigationPercent = 100;
            mitigationTime = c.time;
            break;
          }
        }

        // Track partial mitigation for non-breaker OBs
        if (!mitigated && !breaker) {
          if (ob.type === 'bullish' && c.low <= ob.top && c.low >= ob.bottom) {
            const penetration = (ob.top - c.low) / (ob.top - ob.bottom);
            mitigationPercent = Math.min(100, Math.max(mitigationPercent, penetration * 100));
          } else if (ob.type === 'bearish' && c.high >= ob.bottom && c.high <= ob.top) {
            const penetration = (c.high - ob.bottom) / (ob.top - ob.bottom);
            mitigationPercent = Math.min(100, Math.max(mitigationPercent, penetration * 100));
          }
        }
      }

      // FVG confluence
      let hasFVGConfluence = false;
      let confluenceFVGId: string | undefined;

      if (settings.highlightFVGConfluence) {
        for (const fvg of fvgs) {
          const overlaps = !(ob.bottom > fvg.top || ob.top < fvg.bottom);
          if (overlaps && ob.type === fvg.type) {
            hasFVGConfluence = true;
            confluenceFVGId = fvg.id;
            break;
          }
        }
      }

      result.push({
        ...ob,
        age,
        mitigated,
        mitigationPercent,
        mitigationTime,
        swept,
        sweepTime,
        sweepPrice,
        sweepIndex,
        breaker,
        breakerType,
        conversionTime,
        conversionIndex,
        conversionPrice,
        hasFVGConfluence,
        confluenceFVGId,
      });
    }

    return result;
  }, [candles, settings, fvgs]);
}
