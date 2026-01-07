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

export function useElliottWave(): UseElliottWaveResult {
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
        // Generate simulated W2 ABC correction candles
        const w1 = placedPoints[1];
        const w2 = point;
        const w2Range = Math.abs(w2.price - w1.price);
        const direction = w2.price < w1.price ? 'down' : 'up'; // W2 retraces opposite to W1
        
        // Create 3 simulated candles for A, B, C waves
        // Simple approximation: A = 61.8% of W2 move, B = 50% retrace of A, C completes to W2
        const timePerCandle = 60 * 60 * 1000; // 1 hour per candle (arbitrary)
        
        const aEndPrice = direction === 'down' 
          ? w1.price - (w2Range * 0.618)
          : w1.price + (w2Range * 0.618);
        
        const bRange = Math.abs(aEndPrice - w1.price) * 0.5;
        const bEndPrice = direction === 'down'
          ? aEndPrice + bRange
          : aEndPrice - bRange;
        
        const candles: SimulatedCandle[] = [
          {
            time: w1.time + timePerCandle,
            open: w1.price,
            high: direction === 'down' ? w1.price : aEndPrice,
            low: direction === 'down' ? aEndPrice : w1.price,
            close: aEndPrice,
            label: 'W2.A'
          },
          {
            time: w1.time + timePerCandle * 2,
            open: aEndPrice,
            high: direction === 'down' ? bEndPrice : aEndPrice,
            low: direction === 'down' ? aEndPrice : bEndPrice,
            close: bEndPrice,
            label: 'W2.B'
          },
          {
            time: w1.time + timePerCandle * 3,
            open: bEndPrice,
            high: direction === 'down' ? bEndPrice : w2.price,
            low: direction === 'down' ? w2.price : bEndPrice,
            close: w2.price,
            label: 'W2.C'
          }
        ];
        
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
