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
  label: string; // 'W2.A', 'W2.B', 'W2.C'
}

// Elliott Wave mode states
export type ElliottWaveMode = 'idle' | 'placing_w0' | 'placing_w1' | 'placing_w2' | 'complete';

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
 * Convert interval string to milliseconds
 */
function intervalToMs(interval: string): number {
  const match = interval.match(/^(\d+)([mhd])$/);
  if (!match) return 60 * 60 * 1000; // Default to 1 hour
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 'm': return value * 60 * 1000; // minutes
    case 'h': return value * 60 * 60 * 1000; // hours
    case 'd': return value * 24 * 60 * 60 * 1000; // days
    default: return 60 * 60 * 1000;
  }
}

export function useElliottWave(timeframe: string = '1h'): UseElliottWaveResult {
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
    if (mode === 'placing_w0') {
      const point: ElliottWavePoint = { time, price, snappedToHigh, label: 'W0' };
      setPlacedPoints([point]);
      setMode('placing_w1');
    } else if (mode === 'placing_w1') {
      const point: ElliottWavePoint = { time, price, snappedToHigh, label: 'W1' };
      setPlacedPoints(prev => [...prev, point]);
      
      // Calculate Fibonacci retracement levels for W2
      const w0 = placedPoints[0];
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
    } else if (mode === 'placing_w2') {
      const point: ElliottWavePoint = { time, price, snappedToHigh, label: 'W2' };
      setPlacedPoints(prev => [...prev, point]);
      
      // Only generate simulated candles if clicked on fib level, NOT on real candle
      if (snapType === 'fib') {
        // Generate realistic ABC correction with ~20-30 candles
        const w1 = placedPoints[1];
        const w2 = point;
        const w2Range = Math.abs(w2.price - w1.price);
        const direction = w2.price < w1.price ? 'down' : 'up'; // W2 retraces opposite to W1
        
        // Use actual chart timeframe for candle intervals
        const candleIntervalMs = intervalToMs(timeframe);
        
        // Calculate time span between W1 and W2
        const totalTimeSpan = Math.abs(w2.time - w1.time);
        
        // Determine number of candles to generate (aim for 20-30)
        const targetCandleCount = Math.max(20, Math.min(30, Math.floor(totalTimeSpan / candleIntervalMs)));
        
        // Wave proportions (Fibonacci-based)
        const waveAPercent = 0.618; // Wave A moves 61.8% towards W2
        const waveBRetrace = 0.50; // Wave B retraces 50% of Wave A
        
        // Calculate wave endpoints
        const aEndPrice = direction === 'down'
          ? w1.price - (w2Range * waveAPercent)
          : w1.price + (w2Range * waveAPercent);
        
        const aRange = Math.abs(aEndPrice - w1.price);
        const bEndPrice = direction === 'down'
          ? aEndPrice + (aRange * waveBRetrace)
          : aEndPrice - (aRange * waveBRetrace);
        
        // Distribute candles across ABC waves
        // Wave A: 5-wave impulse, ~40% of candles (8-12 candles)
        // Wave B: 3-wave corrective, ~25% of candles (5-8 candles)
        // Wave C: 5-wave impulse, ~35% of candles (7-10 candles)
        const aCandles = Math.floor(targetCandleCount * 0.40);
        const bCandles = Math.floor(targetCandleCount * 0.25);
        const cCandles = targetCandleCount - aCandles - bCandles;
        
        const candles: SimulatedCandle[] = [];
        let currentTime = w1.time;
        let currentPrice = w1.price;
        
        // Helper to create a candle with realistic OHLC and wicks
        const createCandle = (
          time: number,
          prevClose: number,
          targetClose: number,
          volatility: number,
          label: string
        ): SimulatedCandle => {
          const open = prevClose;
          const close = targetClose;
          const isGreen = close >= open;
          
          // Add wicks (5-15% of candle body)
          const bodySize = Math.abs(close - open);
          const wickSize = bodySize * (0.05 + Math.random() * 0.10);
          
          let high: number, low: number;
          if (direction === 'down') {
            if (isGreen) {
              high = Math.max(open, close) + wickSize;
              low = Math.min(open, close) - wickSize * 0.5;
            } else {
              high = Math.max(open, close) + wickSize * 0.5;
              low = Math.min(open, close) - wickSize;
            }
          } else {
            if (isGreen) {
              high = Math.max(open, close) + wickSize;
              low = Math.min(open, close) - wickSize * 0.5;
            } else {
              high = Math.max(open, close) + wickSize * 0.5;
              low = Math.min(open, close) - wickSize;
            }
          }
          
          return { time, open, high, low, close, label };
        };
        
        // Generate Wave A candles (5-wave impulse)
        for (let i = 0; i < aCandles; i++) {
          currentTime += candleIntervalMs;
          const progress = (i + 1) / aCandles;
          
          // Create 5-wave sub-structure within Wave A
          const subWave = Math.floor(progress * 5);
          const subProgress = (progress * 5) % 1;
          
          // Impulse waves: 1, 3, 5 move with trend; 2, 4 retrace
          let targetPrice: number;
          if (subWave === 0 || subWave === 2 || subWave === 4) {
            // Impulse sub-waves
            targetPrice = w1.price + (aEndPrice - w1.price) * progress;
          } else {
            // Corrective sub-waves (slight retrace)
            const retrace = 0.15; // 15% retrace
            targetPrice = w1.price + (aEndPrice - w1.price) * (progress - retrace * subProgress);
          }
          
          const label = i === aCandles - 1 ? 'W2.A' : '';
          candles.push(createCandle(currentTime, currentPrice, targetPrice, w2Range * 0.02, label));
          currentPrice = targetPrice;
        }
        
        // Generate Wave B candles (3-wave corrective)
        for (let i = 0; i < bCandles; i++) {
          currentTime += candleIntervalMs;
          const progress = (i + 1) / bCandles;
          
          // Create 3-wave sub-structure (ABC correction of the correction)
          const subWave = Math.floor(progress * 3);
          const subProgress = (progress * 3) % 1;
          
          let targetPrice: number;
          if (subWave === 1) {
            // Middle wave retraces more
            targetPrice = currentPrice + (bEndPrice - currentPrice) * (progress + 0.1);
          } else {
            targetPrice = currentPrice + (bEndPrice - currentPrice) * progress;
          }
          
          const label = i === bCandles - 1 ? 'W2.B' : '';
          candles.push(createCandle(currentTime, currentPrice, targetPrice, w2Range * 0.015, label));
          currentPrice = targetPrice;
        }
        
        // Generate Wave C candles (5-wave impulse completing to W2)
        for (let i = 0; i < cCandles; i++) {
          currentTime += candleIntervalMs;
          const progress = (i + 1) / cCandles;
          
          // Create 5-wave sub-structure within Wave C
          const subWave = Math.floor(progress * 5);
          const subProgress = (progress * 5) % 1;
          
          let targetPrice: number;
          if (subWave === 0 || subWave === 2 || subWave === 4) {
            // Impulse sub-waves
            targetPrice = currentPrice + (w2.price - currentPrice) * progress;
          } else {
            // Corrective sub-waves (slight retrace)
            const retrace = 0.15;
            targetPrice = currentPrice + (w2.price - currentPrice) * (progress - retrace * subProgress);
          }
          
          const label = i === cCandles - 1 ? 'W2.C' : '';
          candles.push(createCandle(currentTime, currentPrice, targetPrice, w2Range * 0.02, label));
          currentPrice = targetPrice;
        }
        
        setSimulatedCandles(candles);
      } else {
        // Clicked on real candle - no simulated candles, just trendline + retracement %
        setSimulatedCandles([]);
      }
      
      setMode('complete');
    }
  }, [mode, placedPoints]);

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
