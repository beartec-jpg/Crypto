import { useMemo } from 'react';
import type { Candle } from '@/types/candle';
import type { FVGDetection } from '@/types/fvg';
import type { OrderBlock } from '@/types/orderBlock';
import type { BOSSettings, StructureBreak, SwingPoint, TrendBias } from '@/types/structureBreak';
import { calculateSessionSeparators, type SessionSeparator } from '@/lib/sessions/sessionSeparators';

interface UseBOSDetectionOptions {
  candles: Candle[];
  settings: BOSSettings;
  fvgs?: FVGDetection[];
  orderBlocks?: OrderBlock[];
}

/**
 * Detect swing highs and lows using a lookback window.
 * A swing high: candle.high > all candles within `lookback` on each side.
 * A swing low: candle.low < all candles within `lookback` on each side.
 */
function detectSwingPoints(candles: Candle[], lookback: number): SwingPoint[] {
  const swings: SwingPoint[] = [];
  let lastHigh: SwingPoint | null = null;
  let lastLow: SwingPoint | null = null;

  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];

    // Check swing high
    let isSwingHigh = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].high >= current.high) {
        isSwingHigh = false;
        break;
      }
    }

    if (isSwingHigh) {
      // First swing high has no prior reference; treat as HH (initial baseline)
      const label = lastHigh === null || current.high > lastHigh.price ? 'HH' : 'LH';

      const swing: SwingPoint = {
        id: `sh-${current.time}`,
        type: 'high',
        label,
        price: current.high,
        time: current.time,
        index: i,
        broken: false,
      };
      swings.push(swing);
      lastHigh = swing;
    }

    // Check swing low
    let isSwingLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].low <= current.low) {
        isSwingLow = false;
        break;
      }
    }

    if (isSwingLow) {
      // First swing low has no prior reference; treat as LL (initial baseline)
      const label = lastLow === null || current.low < lastLow.price ? 'LL' : 'HL';

      const swing: SwingPoint = {
        id: `sl-${current.time}`,
        type: 'low',
        label,
        price: current.low,
        time: current.time,
        index: i,
        broken: false,
      };
      swings.push(swing);
      lastLow = swing;
    }
  }

  return swings;
}

/**
 * Detect BOS, CHoCH, and MSS from candles and swing points.
 * 
 * MSS (Market Structure Shift) logic:
 * - Bullish MSS: After breaking a swing high (CHoCH candidate), price creates a Higher Low (HL)
 * - Bearish MSS: After breaking a swing low (CHoCH candidate), price creates a Lower High (LH)
 * - MSS confirms a stronger trend change than CHoCH alone
 */
function detectStructureBreaks(
  candles: Candle[],
  swings: SwingPoint[],
  settings: BOSSettings,
  fvgs: FVGDetection[],
  orderBlocks: OrderBlock[],
): StructureBreak[] {
  const breaks: StructureBreak[] = [];
  // Track broken swing IDs to avoid duplicates
  const brokenSwingIds = new Set<string>();
  
  // Track potential MSS candidates (CHoCH breaks that might upgrade to MSS)
  const pendingMSS: Map<string, { breakId: string; direction: 'bullish' | 'bearish'; swingIdNeeded: string; lastSwingPrice: number }> = new Map();

  // Sort swings by index
  const sortedSwings = [...swings].sort((a, b) => a.index - b.index);

  // Current trend bias
  let trend: TrendBias = 'neutral';

  // Track most recent unbroken swing high and low
  let lastUnbrokenHigh: SwingPoint | null = null;
  let lastUnbrokenLow: SwingPoint | null = null;

  for (let i = 0; i < sortedSwings.length; i++) {
    const swing = sortedSwings[i];
    if (swing.type === 'high') {
      lastUnbrokenHigh = swing;
    } else {
      lastUnbrokenLow = swing;
    }
  }

  // Now iterate candles starting from after the first few swings
  for (let ci = 0; ci < candles.length; ci++) {
    const candle = candles[ci];

    // Check for MSS confirmation from new swing points
    const currentSwing = sortedSwings.find(s => s.index === ci);
    if (currentSwing) {
      // Check if this swing confirms any pending MSS
      for (const [key, pending] of pendingMSS.entries()) {
        if (pending.direction === 'bullish' && currentSwing.type === 'low' && currentSwing.label === 'HL') {
          // Bullish MSS confirmed: found HL after breaking swing high
          const existingBreak = breaks.find(b => b.id === pending.breakId);
          if (existingBreak && existingBreak.type === 'choch') {
            // Upgrade CHoCH to MSS
            existingBreak.type = 'mss';
            existingBreak.id = existingBreak.id.replace('choch', 'mss');
          }
          pendingMSS.delete(key);
        } else if (pending.direction === 'bearish' && currentSwing.type === 'high' && currentSwing.label === 'LH') {
          // Bearish MSS confirmed: found LH after breaking swing low
          const existingBreak = breaks.find(b => b.id === pending.breakId);
          if (existingBreak && existingBreak.type === 'choch') {
            // Upgrade CHoCH to MSS
            existingBreak.type = 'mss';
            existingBreak.id = existingBreak.id.replace('choch', 'mss');
          }
          pendingMSS.delete(key);
        }
      }
    }

    // Find the last unbroken swing high and low with index < ci
    const prevHighs = sortedSwings.filter(s => s.type === 'high' && s.index < ci && !brokenSwingIds.has(s.id));
    const prevLows = sortedSwings.filter(s => s.type === 'low' && s.index < ci && !brokenSwingIds.has(s.id));

    if (prevHighs.length === 0 && prevLows.length === 0) continue;

    const recentHigh = prevHighs[prevHighs.length - 1] || null;
    const recentLow = prevLows[prevLows.length - 1] || null;

    // Check if candle breaks a swing high
    if (recentHigh && !brokenSwingIds.has(recentHigh.id)) {
      const wicked = candle.high > recentHigh.price;
      const confirmed = candle.close > recentHigh.price;

      if (wicked) {
        const swept = !confirmed;

        if (settings.requireClose && !confirmed) {
          // Only swept - record if not hiding swept
          if (!settings.hideSwept) {
            const sbType: 'bos' | 'choch' =
              trend === 'bearish' ? 'choch' : 'bos';
            const direction: 'bullish' | 'bearish' = 'bullish';

            brokenSwingIds.add(recentHigh.id);

            // Integration
            const associatedFVGId = findAssociatedFVG(candle, fvgs, 'bullish');
            const associatedOBId = findAssociatedOB(candle, orderBlocks, 'bullish');

            const newBreak = createBreak(sbType, direction, recentHigh, candle, ci, swept, false,
              associatedOBId, associatedFVGId, settings.extendLines);
            
            breaks.push(newBreak);

            // If this is a CHoCH (trend reversal), mark as pending MSS candidate
            if (sbType === 'choch') {
              const lastLowSwing = prevLows[prevLows.length - 1];
              pendingMSS.set(newBreak.id, {
                breakId: newBreak.id,
                direction: 'bullish',
                swingIdNeeded: 'HL',
                lastSwingPrice: lastLowSwing ? lastLowSwing.price : 0,
              });
            }

            // Update trend
            trend = direction;
          }
          continue;
        }

        brokenSwingIds.add(recentHigh.id);

        const sbType: 'bos' | 'choch' =
          trend === 'bearish' ? 'choch' : 'bos';
        const direction: 'bullish' | 'bearish' = 'bullish';

        const associatedFVGId = findAssociatedFVG(candle, fvgs, 'bullish');
        const associatedOBId = findAssociatedOB(candle, orderBlocks, 'bullish');

        const newBreak = createBreak(sbType, direction, recentHigh, candle, ci, swept, confirmed,
          associatedOBId, associatedFVGId, settings.extendLines);
        
        breaks.push(newBreak);

        // If this is a CHoCH (trend reversal), mark as pending MSS candidate
        if (sbType === 'choch') {
          const lastLowSwing = prevLows[prevLows.length - 1];
          pendingMSS.set(newBreak.id, {
            breakId: newBreak.id,
            direction: 'bullish',
            swingIdNeeded: 'HL',
            lastSwingPrice: lastLowSwing ? lastLowSwing.price : 0,
          });
        }

        trend = direction;
      }
    }

    // Check if candle breaks a swing low
    if (recentLow && !brokenSwingIds.has(recentLow.id)) {
      const wicked = candle.low < recentLow.price;
      const confirmed = candle.close < recentLow.price;

      if (wicked) {
        const swept = !confirmed;

        if (settings.requireClose && !confirmed) {
          if (!settings.hideSwept) {
            const sbType: 'bos' | 'choch' =
              trend === 'bullish' ? 'choch' : 'bos';
            const direction: 'bullish' | 'bearish' = 'bearish';

            brokenSwingIds.add(recentLow.id);

            const associatedFVGId = findAssociatedFVG(candle, fvgs, 'bearish');
            const associatedOBId = findAssociatedOB(candle, orderBlocks, 'bearish');

            const newBreak = createBreak(sbType, direction, recentLow, candle, ci, swept, false,
              associatedOBId, associatedFVGId, settings.extendLines);
            
            breaks.push(newBreak);

            // If this is a CHoCH (trend reversal), mark as pending MSS candidate
            if (sbType === 'choch') {
              const lastHighSwing = prevHighs[prevHighs.length - 1];
              pendingMSS.set(newBreak.id, {
                breakId: newBreak.id,
                direction: 'bearish',
                swingIdNeeded: 'LH',
                lastSwingPrice: lastHighSwing ? lastHighSwing.price : 0,
              });
            }

            trend = direction;
          }
          continue;
        }

        brokenSwingIds.add(recentLow.id);

        const sbType: 'bos' | 'choch' =
          trend === 'bullish' ? 'choch' : 'bos';
        const direction: 'bullish' | 'bearish' = 'bearish';

        const associatedFVGId = findAssociatedFVG(candle, fvgs, 'bearish');
        const associatedOBId = findAssociatedOB(candle, orderBlocks, 'bearish');

        const newBreak = createBreak(sbType, direction, recentLow, candle, ci, swept, confirmed,
          associatedOBId, associatedFVGId, settings.extendLines);
        
        breaks.push(newBreak);

        // If this is a CHoCH (trend reversal), mark as pending MSS candidate
        if (sbType === 'choch') {
          const lastHighSwing = prevHighs[prevHighs.length - 1];
          pendingMSS.set(newBreak.id, {
            breakId: newBreak.id,
            direction: 'bearish',
            swingIdNeeded: 'LH',
            lastSwingPrice: lastHighSwing ? lastHighSwing.price : 0,
          });
        }

        trend = direction;
      }
    }
  }

  return breaks;
}

function createBreak(
  type: 'bos' | 'choch' | 'mss',
  direction: 'bullish' | 'bearish',
  brokenSwing: SwingPoint,
  breakCandle: Candle,
  breakIndex: number,
  swept: boolean,
  confirmed: boolean,
  associatedOBId: string | undefined,
  associatedFVGId: string | undefined,
  lineExtendRight: boolean,
): StructureBreak {
  return {
    id: `${type}-${direction}-${breakCandle.time}`,
    type,
    direction,
    brokenSwing,
    brokenLevel: brokenSwing.price,
    breakTime: breakCandle.time,
    breakIndex,
    breakPrice: breakCandle.close,
    confirmed,
    swept,
    associatedOBId,
    associatedFVGId,
    createdOB: associatedOBId !== undefined,
    createdFVG: associatedFVGId !== undefined,
    lineExtendRight,
  };
}

function findAssociatedFVG(
  breakCandle: Candle,
  fvgs: FVGDetection[],
  direction: 'bullish' | 'bearish',
): string | undefined {
  for (const fvg of fvgs) {
    if (fvg.type !== direction) continue;
    // FVG completed at the same candle as the break (endTime = c3 of 3-candle pattern)
    if (fvg.endTime === breakCandle.time) {
      return fvg.id;
    }
  }
  return undefined;
}

function findAssociatedOB(
  breakCandle: Candle,
  orderBlocks: OrderBlock[],
  direction: 'bullish' | 'bearish',
): string | undefined {
  for (const ob of orderBlocks) {
    if (ob.type !== direction) continue;
    // OB that encompasses or is near the break candle
    if (breakCandle.close >= ob.bottom && breakCandle.close <= ob.top) {
      return ob.id;
    }
  }
  return undefined;
}

export interface UseBOSDetectionResult {
  swingPoints: SwingPoint[];
  structureBreaks: StructureBreak[];
  sessionSeparators: SessionSeparator[];
}

/**
 * Detect BOS and CHoCH structure breaks from candle data.
 */
export function useBOSDetection({
  candles,
  settings,
  fvgs = [],
  orderBlocks = [],
}: UseBOSDetectionOptions): UseBOSDetectionResult {
  return useMemo(() => {
    if (!settings.enabled || candles.length < settings.swingLookback) {
      return { swingPoints: [], structureBreaks: [], sessionSeparators: [] };
    }

    const swingPoints = detectSwingPoints(candles, settings.swingLookback);
    const rawBreaks = detectStructureBreaks(candles, swingPoints, settings, fvgs, orderBlocks);

    // Age filter
    const totalCandles = candles.length;
    const structureBreaks = rawBreaks.filter(sb => {
      const age = totalCandles - 1 - sb.breakIndex;
      return age <= settings.maxAge;
    });

    // Session separators (only if showSessions is enabled)
    const sessionSeparators = settings.showSessions
      ? calculateSessionSeparators(
          candles,
          settings.showAsianSession,
          settings.showLondonSession,
          settings.showNYSession
        )
      : [];

    return { swingPoints, structureBreaks, sessionSeparators };
  }, [candles, settings, fvgs, orderBlocks]);
}
