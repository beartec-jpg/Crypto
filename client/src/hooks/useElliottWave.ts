import { useState, useCallback } from 'react';

// Elliott Wave point with price/time/snap info
export interface ElliottWavePoint {
  time: number;
  price: number;
  snappedToHigh: boolean; // true = high, false = low
  label: string; // 'W0', 'W1', 'W2'
}

// Simulated candle for W2 ABC correction
export interface SimulatedCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  label: string; // Labels will be added during rendering for W2.A, W2.B, W2.C endpoints
}

// Elliott Wave mode states
export type ElliottWaveMode = 'idle' | 'placing_w0' | 'placing_w1' | 'placing_w2' | 'complete';

export interface UseElliottWaveParams {
  timeframe?: string; // e.g., '1h', '4H', '1D'
}

export interface UseElliottWaveResult {
  mode: ElliottWaveMode;
  placedPoints: ElliottWavePoint[];
  simulatedCandles: SimulatedCandle[];
  fibLevels: { ratio: number; price: number; label: string }[];
  
  // Actions
  activateMode: () => void;
  deactivateMode: () => void;
  placePoint: (time: number, price: number, snappedToHigh: boolean, snapType?: 'candle' | 'fib') => void;
  reset: () => void;
  undo: () => void;
  
  // Status helpers
  getStatusText: () => string;
  isActive: boolean;
}

/**
 * Convert timeframe string to milliseconds (case-insensitive)
 * e.g., '1h' or '1H' -> 3600000, '4h' or '4H' -> 14400000
 */
function intervalToMs(interval: string): number {
  const match = interval.toLowerCase().match(/^(\d+)([mhdw])$/);
  if (!match) return 60 * 60 * 1000; // default to 1 hour
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'w': return value * 7 * 24 * 60 * 60 * 1000;
    default: return 60 * 60 * 1000;
  }
}

/**
 * Generate a momentum candle (for impulse waves A & C)
 * Large bodies, small wicks, strong direction
 */
function generateMomentumCandle(
  time: number,
  startPrice: number,
  endPrice: number,
  currentPrice: number,
  isCounterTrend: boolean = false
): SimulatedCandle {
  const direction = endPrice > startPrice ? 'up' : 'down';
  
  // Counter-trend candles should be smaller
  const bodyMultiplier = isCounterTrend ? 0.3 : 1.0;
  
  // Body size: 0.3-0.8% of price range
  const bodySize = currentPrice * (0.003 + Math.random() * 0.005) * bodyMultiplier;
  
  // Determine open/close based on direction and counter-trend
  let open: number, close: number;
  if (isCounterTrend) {
    // Counter-trend: opposite direction, smaller move
    if (direction === 'up') {
      close = currentPrice - bodySize * Math.random();
      open = close + bodySize;
    } else {
      close = currentPrice + bodySize * Math.random();
      open = close - bodySize;
    }
  } else {
    // Trend candle: move in wave direction
    if (direction === 'up') {
      open = currentPrice;
      close = currentPrice + bodySize;
    } else {
      open = currentPrice;
      close = currentPrice - bodySize;
    }
  }
  
  // Wicks: 5-15% of body size
  const wickRatio = 0.05 + Math.random() * 0.10;
  const upperWick = bodySize * wickRatio * (0.5 + Math.random());
  const lowerWick = bodySize * wickRatio * (0.5 + Math.random());
  
  const high = Math.max(open, close) + upperWick;
  const low = Math.min(open, close) - lowerWick;
  
  return { time, open, high, low, close, label: '' };
}

/**
 * Generate a consolidation/corrective candle (for Wave B)
 * Small bodies, longer wicks, indecision
 */
function generateConsolidationCandle(
  time: number,
  currentPrice: number,
  isDoji: boolean = false
): SimulatedCandle {
  // Body size: 0.1-0.3% of price range (or very small for doji)
  const bodySize = isDoji 
    ? currentPrice * 0.0005 * Math.random() 
    : currentPrice * (0.001 + Math.random() * 0.002);
  
  // Random direction for consolidation
  const isGreen = Math.random() > 0.5;
  const open = currentPrice;
  const close = isGreen ? currentPrice + bodySize : currentPrice - bodySize;
  
  // Wicks: 20-50% of body on both sides
  const wickRatio = 0.2 + Math.random() * 0.3;
  const upperWick = bodySize * wickRatio * (0.8 + Math.random() * 1.2);
  const lowerWick = bodySize * wickRatio * (0.8 + Math.random() * 1.2);
  
  const high = Math.max(open, close) + upperWick;
  const low = Math.min(open, close) - lowerWick;
  
  return { time, open, high, low, close, label: '' };
}

/**
 * Generate 5-wave impulse structure for Wave A or Wave C (Zigzag pattern)
 * Returns array of candles with realistic sub-wave structure
 * Large momentum candles, ~80% same direction, ~20% counter-trend
 */
function generate5WaveImpulse(
  startTime: number,
  startPrice: number,
  endPrice: number,
  numCandles: number,
  intervalMs: number,
  direction: 'down' | 'up'
): SimulatedCandle[] {
  const candles: SimulatedCandle[] = [];
  const totalMove = endPrice - startPrice;
  
  // 5-wave structure: 1 (impulse), 2 (correction), 3 (impulse, largest), 4 (correction), 5 (impulse)
  // Wave proportions: W1=20%, W2=10% retrace, W3=50%, W4=15% retrace, W5=20%
  // Distribute candles: W1=20%, W2=15%, W3=35%, W4=15%, W5=15%
  const candleDistribution = [
    Math.max(2, Math.floor(numCandles * 0.20)),  // W1
    Math.max(1, Math.floor(numCandles * 0.15)),  // W2
    Math.max(3, Math.floor(numCandles * 0.35)),  // W3
    Math.max(1, Math.floor(numCandles * 0.15)),  // W4
    0  // W5 gets remainder
  ];
  candleDistribution[4] = numCandles - candleDistribution.slice(0, 4).reduce((a, b) => a + b, 0);
  
  let currentTime = startTime;
  let currentPrice = startPrice;
  
  // Wave 1: Impulse (20% of total move)
  const w1EndPrice = startPrice + totalMove * 0.20;
  for (let i = 0; i < candleDistribution[0]; i++) {
    const progress = (i + 1) / candleDistribution[0];
    const targetPrice = startPrice + (w1EndPrice - startPrice) * progress;
    
    // ~20% counter-trend candles
    const isCounterTrend = Math.random() > 0.80;
    const candle = generateMomentumCandle(currentTime, startPrice, w1EndPrice, currentPrice, isCounterTrend);
    
    // Adjust to reach target
    currentPrice = targetPrice;
    candle.close = currentPrice;
    candle.high = Math.max(candle.high, candle.open, candle.close);
    candle.low = Math.min(candle.low, candle.open, candle.close);
    
    candles.push(candle);
    currentTime += intervalMs;
  }
  
  // Wave 2: Correction (retraces ~38% of W1)
  const w2EndPrice = w1EndPrice - (w1EndPrice - startPrice) * 0.38;
  for (let i = 0; i < candleDistribution[1]; i++) {
    const progress = (i + 1) / candleDistribution[1];
    const targetPrice = currentPrice + (w2EndPrice - currentPrice) * progress;
    
    const candle = generateMomentumCandle(currentTime, w1EndPrice, w2EndPrice, currentPrice, false);
    
    currentPrice = targetPrice;
    candle.close = currentPrice;
    candle.high = Math.max(candle.high, candle.open, candle.close);
    candle.low = Math.min(candle.low, candle.open, candle.close);
    
    candles.push(candle);
    currentTime += intervalMs;
  }
  
  // Wave 3: Largest impulse (moves from W2 end to 70% of total move)
  const w3EndPrice = startPrice + totalMove * 0.70;
  for (let i = 0; i < candleDistribution[2]; i++) {
    const progress = (i + 1) / candleDistribution[2];
    const targetPrice = currentPrice + (w3EndPrice - currentPrice) * progress;
    
    const isCounterTrend = Math.random() > 0.80;
    const candle = generateMomentumCandle(currentTime, w2EndPrice, w3EndPrice, currentPrice, isCounterTrend);
    
    currentPrice = targetPrice;
    candle.close = currentPrice;
    candle.high = Math.max(candle.high, candle.open, candle.close);
    candle.low = Math.min(candle.low, candle.open, candle.close);
    
    candles.push(candle);
    currentTime += intervalMs;
  }
  
  // Wave 4: Correction (retraces ~23% of W3)
  const w4EndPrice = w3EndPrice - (w3EndPrice - w2EndPrice) * 0.23;
  for (let i = 0; i < candleDistribution[3]; i++) {
    const progress = (i + 1) / candleDistribution[3];
    const targetPrice = currentPrice + (w4EndPrice - currentPrice) * progress;
    
    const candle = generateMomentumCandle(currentTime, w3EndPrice, w4EndPrice, currentPrice, false);
    
    currentPrice = targetPrice;
    candle.close = currentPrice;
    candle.high = Math.max(candle.high, candle.open, candle.close);
    candle.low = Math.min(candle.low, candle.open, candle.close);
    
    candles.push(candle);
    currentTime += intervalMs;
  }
  
  // Wave 5: Final impulse (completes to end price)
  for (let i = 0; i < candleDistribution[4]; i++) {
    const progress = (i + 1) / candleDistribution[4];
    const targetPrice = currentPrice + (endPrice - currentPrice) * progress;
    
    const isCounterTrend = Math.random() > 0.80;
    const candle = generateMomentumCandle(currentTime, w4EndPrice, endPrice, currentPrice, isCounterTrend);
    
    currentPrice = targetPrice;
    candle.close = currentPrice;
    candle.high = Math.max(candle.high, candle.open, candle.close);
    candle.low = Math.min(candle.low, candle.open, candle.close);
    
    candles.push(candle);
    currentTime += intervalMs;
  }
  
  return candles;
}

/**
 * Generate 3-wave corrective structure for Wave B
 * Returns array of candles with realistic ABC sub-structure
 * patternType: 'zigzag' = low B wave (38-50% retrace), 'flat' = high B wave (78-100% retrace)
 */
function generate3WaveCorrection(
  startTime: number,
  startPrice: number,
  endPrice: number,
  numCandles: number,
  intervalMs: number,
  direction: 'down' | 'up',
  patternType: 'zigzag' | 'flat' = 'zigzag'
): SimulatedCandle[] {
  const candles: SimulatedCandle[] = [];
  const totalMove = endPrice - startPrice;
  
  // Different proportions for zigzag vs flat
  let candleDistribution: number[];
  let bRetracePercent: number;
  
  if (patternType === 'flat') {
    // Flat: A=30%, B=35%, C=35%
    candleDistribution = [
      Math.max(2, Math.floor(numCandles * 0.30)),  // A
      Math.max(2, Math.floor(numCandles * 0.35)),  // B
      0  // C gets remainder
    ];
    // B retraces 78.6%-100% of A (comes back HIGH near W1)
    bRetracePercent = 0.786 + Math.random() * 0.214; // 78.6% to 100%
  } else {
    // Zigzag: A=40%, B=20%, C=40%
    candleDistribution = [
      Math.max(2, Math.floor(numCandles * 0.40)),  // A
      Math.max(1, Math.floor(numCandles * 0.20)),  // B
      0  // C gets remainder
    ];
    // B retraces 38.2%-50% of A (stays LOW)
    bRetracePercent = 0.382 + Math.random() * 0.118; // 38.2% to 50%
  }
  
  candleDistribution[2] = numCandles - candleDistribution[0] - candleDistribution[1];
  
  let currentTime = startTime;
  let currentPrice = startPrice;
  
  // Sub-wave A (moves in correction direction)
  const aPercent = patternType === 'flat' ? 0.50 : 0.45; // Flat reaches 50%, Zigzag 45%
  const aEndPrice = startPrice + totalMove * aPercent;
  
  for (let i = 0; i < candleDistribution[0]; i++) {
    const progress = (i + 1) / candleDistribution[0];
    const targetPrice = startPrice + (aEndPrice - startPrice) * progress;
    
    // For flat, Wave A is less impulsive (more choppy)
    let candle: SimulatedCandle;
    if (patternType === 'flat') {
      // Mix of consolidation and small momentum candles
      const isConsolidation = Math.random() > 0.6;
      if (isConsolidation) {
        candle = generateConsolidationCandle(currentTime, currentPrice, Math.random() > 0.8);
      } else {
        candle = generateMomentumCandle(currentTime, startPrice, aEndPrice, currentPrice, false);
      }
    } else {
      // Zigzag Wave A is more impulsive
      const isCounterTrend = Math.random() > 0.75;
      candle = generateMomentumCandle(currentTime, startPrice, aEndPrice, currentPrice, isCounterTrend);
    }
    
    currentPrice = targetPrice;
    candle.close = currentPrice;
    candle.high = Math.max(candle.high, candle.open, candle.close);
    candle.low = Math.min(candle.low, candle.open, candle.close);
    
    candles.push(candle);
    currentTime += intervalMs;
  }
  
  // Sub-wave B (retraces back towards start - choppy/consolidation)
  const bEndPrice = aEndPrice - (aEndPrice - startPrice) * bRetracePercent;
  
  for (let i = 0; i < candleDistribution[1]; i++) {
    const progress = (i + 1) / candleDistribution[1];
    const targetPrice = currentPrice + (bEndPrice - currentPrice) * progress;
    
    // Wave B is always choppy/consolidation with dojis and spinning tops
    const isDoji = Math.random() > 0.7;
    const candle = generateConsolidationCandle(currentTime, currentPrice, isDoji);
    
    currentPrice = targetPrice;
    candle.close = currentPrice;
    candle.high = Math.max(candle.high, candle.open, candle.close);
    candle.low = Math.min(candle.low, candle.open, candle.close);
    
    candles.push(candle);
    currentTime += intervalMs;
  }
  
  // Sub-wave C (completes to end price)
  for (let i = 0; i < candleDistribution[2]; i++) {
    const progress = (i + 1) / candleDistribution[2];
    const targetPrice = currentPrice + (endPrice - currentPrice) * progress;
    
    // Wave C is moderately impulsive
    const isCounterTrend = Math.random() > 0.75;
    const candle = generateMomentumCandle(currentTime, bEndPrice, endPrice, currentPrice, isCounterTrend);
    
    currentPrice = targetPrice;
    candle.close = currentPrice;
    candle.high = Math.max(candle.high, candle.open, candle.close);
    candle.low = Math.min(candle.low, candle.open, candle.close);
    
    candles.push(candle);
    currentTime += intervalMs;
  }
  
  return candles;
}

export function useElliottWave(params: UseElliottWaveParams = {}): UseElliottWaveResult {
  const { timeframe = '1h' } = params;
  const [mode, setMode] = useState<ElliottWaveMode>('idle');
  const [placedPoints, setPlacedPoints] = useState<ElliottWavePoint[]>([]);
  const [simulatedCandles, setSimulatedCandles] = useState<SimulatedCandle[]>([]);
  const [fibLevels, setFibLevels] = useState<{ ratio: number; price: number; label: string }[]>([]);

  const activateMode = useCallback(() => {
    setMode('placing_w0');
    setPlacedPoints([]);
    setSimulatedCandles([]);
    setFibLevels([]);
  }, []);

  const deactivateMode = useCallback(() => {
    setMode('idle');
  }, []);

  const reset = useCallback(() => {
    setMode('placing_w0');
    setPlacedPoints([]);
    setSimulatedCandles([]);
    setFibLevels([]);
  }, []);

  const undo = useCallback(() => {
    setPlacedPoints(prev => {
      const newPoints = prev.slice(0, -1);
      
      // Update mode based on remaining points
      if (newPoints.length === 0) {
        setMode('placing_w0');
        setFibLevels([]);
        setSimulatedCandles([]);
      } else if (newPoints.length === 1) {
        setMode('placing_w1');
        setFibLevels([]);
        setSimulatedCandles([]);
      } else if (newPoints.length === 2) {
        setMode('placing_w2');
        setSimulatedCandles([]);
        // Recalculate fib levels for W1→W2
        const w0 = newPoints[0];
        const w1 = newPoints[1];
        const wave1Range = Math.abs(w1.price - w0.price);
        const direction = w1.price > w0.price ? 'up' : 'down';
        
        const fibRatios = [0.236, 0.382, 0.5, 0.618, 0.786];
        const levels = fibRatios.map(ratio => {
          const retracementPrice = direction === 'up' 
            ? w1.price - (wave1Range * ratio)
            : w1.price + (wave1Range * ratio);
          return {
            ratio,
            price: retracementPrice,
            label: `${(ratio * 100).toFixed(1)}%`
          };
        });
        setFibLevels(levels);
      }
      
      return newPoints;
    });
  }, []);

  const placePoint = useCallback((time: number, price: number, snappedToHigh: boolean, snapType?: 'candle' | 'fib') => {
    setPlacedPoints(prev => {
      // Use the length of prev to determine which point we're placing
      if (prev.length === 0) {
        // Placing W0
        const point: ElliottWavePoint = { time, price, snappedToHigh, label: 'W0' };
        setMode('placing_w1');
        return [point];
      } else if (prev.length === 1) {
        // Placing W1
        const point: ElliottWavePoint = { time, price, snappedToHigh, label: 'W1' };
        
        // Calculate Fibonacci retracement levels for W2
        const w0 = prev[0];
        const w1 = point;
        const wave1Range = Math.abs(w1.price - w0.price);
        const direction = w1.price > w0.price ? 'up' : 'down';
        
        const fibRatios = [0.236, 0.382, 0.5, 0.618, 0.786];
        const levels = fibRatios.map(ratio => {
          const retracementPrice = direction === 'up' 
            ? w1.price - (wave1Range * ratio)
            : w1.price + (wave1Range * ratio);
          return {
            ratio,
            price: retracementPrice,
            label: `${(ratio * 100).toFixed(1)}%`
          };
        });
        setFibLevels(levels);
        setMode('placing_w2');
        return [...prev, point];
      } else if (prev.length === 2) {
        // Placing W2
        const point: ElliottWavePoint = { time, price, snappedToHigh, label: 'W2' };
        
        // Only generate simulated candles if clicked on fib level, NOT on real candle
        if (snapType === 'fib') {
          // Generate simulated W2 ABC correction candles
          const w0 = prev[0];
          const w1 = prev[1];
          const w2 = point;
          
          // Determine pattern type based on fib level clicked
          // Calculate the retracement percentage from W1
          const wave1Range = Math.abs(w1.price - w0.price);
          const w1Direction = w1.price > w0.price ? 'up' : 'down';
          
          // Calculate what percentage of W1 the W2 point represents
          let retracementRatio: number;
          if (w1Direction === 'up') {
            retracementRatio = (w1.price - w2.price) / wave1Range;
          } else {
            retracementRatio = (w2.price - w1.price) / wave1Range;
          }
          
          // Determine pattern: below 50% = zigzag, at/above 50% = flat
          const patternType: 'zigzag' | 'flat' = retracementRatio < 0.5 ? 'zigzag' : 'flat';
          
          console.log(`Elliott Wave Pattern: ${patternType} (retracement: ${(retracementRatio * 100).toFixed(1)}%)`);
          
          // Calculate candle interval from timeframe
          const intervalMs = intervalToMs(timeframe);
          
          // Calculate time span and number of candles proportional to the distance
          const timeSpan = Math.abs(w2.time - w1.time);
          const candleCount = Math.floor(timeSpan / intervalMs);
          
          // Ensure minimum of 12 candles for proper ABC structure (A=4, B=2, C=6 minimum)
          // No maximum limit - let it scale naturally with time distance
          const actualCandles = Math.max(12, candleCount);
          
          // Distribute candles based on pattern type
          let numWaveA: number, numWaveB: number, numWaveC: number;
          if (patternType === 'flat') {
            // Flat: A=30%, B=35%, C=35%
            numWaveA = Math.max(3, Math.floor(actualCandles * 0.30));
            numWaveB = Math.max(3, Math.floor(actualCandles * 0.35));
            numWaveC = actualCandles - numWaveA - numWaveB;
          } else {
            // Zigzag: A=40%, B=20%, C=40%
            numWaveA = Math.max(4, Math.floor(actualCandles * 0.40));
            numWaveB = Math.max(2, Math.floor(actualCandles * 0.20));
            numWaveC = actualCandles - numWaveA - numWaveB;
          }
          
          // Determine direction (W2 retraces opposite to W1)
          const w2Direction = w1Direction === 'up' ? 'down' : 'up';
          
          // Calculate wave endpoints
          // Wave A ends at ~61.8% of W1→W2 move for zigzag, ~50% for flat
          const w2Range = w2.price - w1.price;
          const waveAPercent = patternType === 'flat' ? 0.50 : 0.618;
          const waveAEndPrice = w1.price + w2Range * waveAPercent;
          
          // Wave B retraces based on pattern type
          const waveAMove = waveAEndPrice - w1.price;
          let waveBEndPrice: number;
          if (patternType === 'flat') {
            // Flat: B retraces 78.6%-100% of A (comes back HIGH near W1)
            const bRetrace = 0.786 + Math.random() * 0.214;
            waveBEndPrice = waveAEndPrice - waveAMove * bRetrace;
          } else {
            // Zigzag: B retraces 38.2%-50% of A (stays LOW)
            const bRetrace = 0.382 + Math.random() * 0.118;
            waveBEndPrice = waveAEndPrice - waveAMove * bRetrace;
          }
          
          // Wave C completes to W2
          const waveCEndPrice = w2.price;
          
          const allCandles: SimulatedCandle[] = [];
          let currentTime = w1.time;
          
          // Generate Wave A (5-wave impulse structure for zigzag, 3-wave for flat)
          let waveACandles: SimulatedCandle[];
          if (patternType === 'flat') {
            // Flat Wave A is corrective (3-wave)
            waveACandles = generate3WaveCorrection(
              currentTime,
              w1.price,
              waveAEndPrice,
              numWaveA,
              intervalMs,
              w2Direction,
              'flat'
            );
          } else {
            // Zigzag Wave A is impulsive (5-wave)
            waveACandles = generate5WaveImpulse(
              currentTime,
              w1.price,
              waveAEndPrice,
              numWaveA,
              intervalMs,
              w2Direction
            );
          }
          allCandles.push(...waveACandles);
          currentTime += numWaveA * intervalMs;
          
          // Generate Wave B (3-wave corrective structure - always corrective)
          const waveBDirection = w2Direction === 'down' ? 'up' : 'down';
          const waveBCandles = generate3WaveCorrection(
            currentTime,
            waveAEndPrice,
            waveBEndPrice,
            numWaveB,
            intervalMs,
            waveBDirection,
            patternType
          );
          allCandles.push(...waveBCandles);
          currentTime += numWaveB * intervalMs;
          
          // Generate Wave C (5-wave impulse structure - always impulsive)
          const waveCCandles = generate5WaveImpulse(
            currentTime,
            waveBEndPrice,
            waveCEndPrice,
            numWaveC,
            intervalMs,
            w2Direction
          );
          allCandles.push(...waveCCandles);
          
          // Add labels to endpoint candles
          if (allCandles.length > 0) {
            allCandles[numWaveA - 1].label = 'W2.A';
            allCandles[numWaveA + numWaveB - 1].label = 'W2.B';
            allCandles[allCandles.length - 1].label = 'W2.C';
          }
          
          setSimulatedCandles(allCandles);
        } else {
          // Clicked on real candle - no simulated candles, just trendline + retracement %
          setSimulatedCandles([]);
        }
        
        setMode('complete');
        return [...prev, point];
      }
      
      // If more than 3 points, ignore
      return prev;
    });
  }, [timeframe]);

  const getStatusText = useCallback(() => {
    switch (mode) {
      case 'idle':
        return 'Elliott Wave inactive';
      case 'placing_w0':
        return 'Ready to place W0 - Click candle high/low';
      case 'placing_w1':
        return 'W0 placed - Click for W1';
      case 'placing_w2':
        return 'W1 placed - Click for W2 (candle or fib level)';
      case 'complete':
        return 'W2 complete - Elliott Wave pattern drawn';
      default:
        return '';
    }
  }, [mode]);

  return {
    mode,
    placedPoints,
    simulatedCandles,
    fibLevels,
    activateMode,
    deactivateMode,
    placePoint,
    reset,
    undo,
    getStatusText,
    isActive: mode !== 'idle'
  };
}
