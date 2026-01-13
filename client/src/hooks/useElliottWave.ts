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
 * Generate realistic OHLC candle with wicks
 */
function generateCandle(
  time: number,
  open: number,
  close: number,
  direction: 'up' | 'down'
): { time: number; open: number; high: number; low: number; close: number; label: string } {
  // Body size
  const bodySize = Math.abs(close - open);
  
  // Wicks: 5-15% of body size (or minimum 0.1% of open price if body is very small)
  const minWickSize = Math.max(bodySize * 0.05, open * 0.001);
  const maxWickSize = Math.max(bodySize * 0.15, open * 0.002);
  const upperWickSize = minWickSize + Math.random() * (maxWickSize - minWickSize);
  const lowerWickSize = minWickSize + Math.random() * (maxWickSize - minWickSize);
  
  const high = Math.max(open, close) + upperWickSize;
  const low = Math.min(open, close) - lowerWickSize;
  
  return { time, open, high, low, close, label: '' };
}

/**
 * Generate 5-wave impulse structure for Wave A or Wave C
 * Returns array of candles with realistic sub-wave structure
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
    const nextPrice = startPrice + (w1EndPrice - startPrice) * progress;
    candles.push(generateCandle(currentTime, currentPrice, nextPrice, direction));
    currentTime += intervalMs;
    currentPrice = nextPrice;
  }
  
  // Wave 2: Correction (retraces ~38% of W1)
  const w2EndPrice = w1EndPrice - (w1EndPrice - startPrice) * 0.38;
  const w2Direction = direction === 'down' ? 'up' : 'down';
  for (let i = 0; i < candleDistribution[1]; i++) {
    const progress = (i + 1) / candleDistribution[1];
    const nextPrice = currentPrice + (w2EndPrice - currentPrice) * progress;
    candles.push(generateCandle(currentTime, currentPrice, nextPrice, w2Direction));
    currentTime += intervalMs;
    currentPrice = nextPrice;
  }
  
  // Wave 3: Largest impulse (moves from W2 end to 70% of total move)
  const w3EndPrice = startPrice + totalMove * 0.70;
  for (let i = 0; i < candleDistribution[2]; i++) {
    const progress = (i + 1) / candleDistribution[2];
    const nextPrice = currentPrice + (w3EndPrice - currentPrice) * progress;
    candles.push(generateCandle(currentTime, currentPrice, nextPrice, direction));
    currentTime += intervalMs;
    currentPrice = nextPrice;
  }
  
  // Wave 4: Correction (retraces ~23% of W3)
  const w4EndPrice = w3EndPrice - (w3EndPrice - w2EndPrice) * 0.23;
  for (let i = 0; i < candleDistribution[3]; i++) {
    const progress = (i + 1) / candleDistribution[3];
    const nextPrice = currentPrice + (w4EndPrice - currentPrice) * progress;
    candles.push(generateCandle(currentTime, currentPrice, nextPrice, w2Direction));
    currentTime += intervalMs;
    currentPrice = nextPrice;
  }
  
  // Wave 5: Final impulse (completes to end price)
  for (let i = 0; i < candleDistribution[4]; i++) {
    const progress = (i + 1) / candleDistribution[4];
    const nextPrice = currentPrice + (endPrice - currentPrice) * progress;
    candles.push(generateCandle(currentTime, currentPrice, nextPrice, direction));
    currentTime += intervalMs;
    currentPrice = nextPrice;
  }
  
  return candles;
}

/**
 * Generate 3-wave corrective structure for Wave B
 * Returns array of candles with realistic ABC sub-structure
 */
function generate3WaveCorrection(
  startTime: number,
  startPrice: number,
  endPrice: number,
  numCandles: number,
  intervalMs: number,
  direction: 'down' | 'up'
): SimulatedCandle[] {
  const candles: SimulatedCandle[] = [];
  const totalMove = endPrice - startPrice;
  
  // 3-wave ABC structure: A=45%, B=25% retrace, C=30%
  // Distribute candles: A=40%, B=25%, C=35%
  const candleDistribution = [
    Math.max(2, Math.floor(numCandles * 0.40)),  // A
    Math.max(1, Math.floor(numCandles * 0.25)),  // B
    0  // C gets remainder
  ];
  candleDistribution[2] = numCandles - candleDistribution[0] - candleDistribution[1];
  
  let currentTime = startTime;
  let currentPrice = startPrice;
  
  // Sub-wave A (45% of total correction move)
  const aEndPrice = startPrice + totalMove * 0.45;
  for (let i = 0; i < candleDistribution[0]; i++) {
    const progress = (i + 1) / candleDistribution[0];
    const nextPrice = startPrice + (aEndPrice - startPrice) * progress;
    candles.push(generateCandle(currentTime, currentPrice, nextPrice, direction));
    currentTime += intervalMs;
    currentPrice = nextPrice;
  }
  
  // Sub-wave B (retraces ~50% of sub-wave A)
  const bEndPrice = aEndPrice - (aEndPrice - startPrice) * 0.50;
  const bDirection = direction === 'down' ? 'up' : 'down';
  for (let i = 0; i < candleDistribution[1]; i++) {
    const progress = (i + 1) / candleDistribution[1];
    const nextPrice = currentPrice + (bEndPrice - currentPrice) * progress;
    candles.push(generateCandle(currentTime, currentPrice, nextPrice, bDirection));
    currentTime += intervalMs;
    currentPrice = nextPrice;
  }
  
  // Sub-wave C (completes to end price)
  for (let i = 0; i < candleDistribution[2]; i++) {
    const progress = (i + 1) / candleDistribution[2];
    const nextPrice = currentPrice + (endPrice - currentPrice) * progress;
    candles.push(generateCandle(currentTime, currentPrice, nextPrice, direction));
    currentTime += intervalMs;
    currentPrice = nextPrice;
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
          const w1 = prev[1];
          const w2 = point;
          
          // Calculate candle interval from timeframe
          const intervalMs = intervalToMs(timeframe);
          
          // Calculate time span and number of candles proportional to the distance
          const timeSpan = Math.abs(w2.time - w1.time);
          const candleCount = Math.floor(timeSpan / intervalMs);
          
          // Ensure minimum of 12 candles for proper ABC structure (A=4, B=2, C=6 minimum)
          // No maximum limit - let it scale naturally with time distance
          const actualCandles = Math.max(12, candleCount);
          
          // Distribute candles: Wave A ~38%, Wave B ~24%, Wave C ~38%
          const numWaveA = Math.max(4, Math.floor(actualCandles * 0.38));
          const numWaveB = Math.max(2, Math.floor(actualCandles * 0.24));
          const numWaveC = actualCandles - numWaveA - numWaveB;
          
          // Determine direction (W2 retraces opposite to W1)
          const w1Direction = w1.price > prev[0].price ? 'up' : 'down';
          const w2Direction = w1Direction === 'up' ? 'down' : 'up';
          
          // Calculate wave endpoints
          // Wave A ends at ~61.8% of W1→W2 move
          const w2Range = w2.price - w1.price;
          const waveAEndPrice = w1.price + w2Range * 0.618;
          
          // Wave B retraces ~50% of Wave A (back towards W1)
          const waveAMove = waveAEndPrice - w1.price;
          const waveBEndPrice = waveAEndPrice - waveAMove * 0.50;
          
          // Wave C completes to W2
          const waveCEndPrice = w2.price;
          
          const allCandles: SimulatedCandle[] = [];
          let currentTime = w1.time;
          
          // Generate Wave A (5-wave impulse structure)
          const waveACandles = generate5WaveImpulse(
            currentTime,
            w1.price,
            waveAEndPrice,
            numWaveA,
            intervalMs,
            w2Direction
          );
          allCandles.push(...waveACandles);
          currentTime += numWaveA * intervalMs;
          
          // Generate Wave B (3-wave corrective structure)
          const waveBDirection = w2Direction === 'down' ? 'up' : 'down';
          const waveBCandles = generate3WaveCorrection(
            currentTime,
            waveAEndPrice,
            waveBEndPrice,
            numWaveB,
            intervalMs,
            waveBDirection
          );
          allCandles.push(...waveBCandles);
          currentTime += numWaveB * intervalMs;
          
          // Generate Wave C (5-wave impulse structure)
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
