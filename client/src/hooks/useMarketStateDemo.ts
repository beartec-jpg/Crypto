import { useState, useEffect } from 'react';

type MarketState = 'bullish' | 'bearish';

interface UseMarketStateDemoReturn {
  targetMarketState: MarketState;
  isInitialLoad: boolean;
  setTargetMarketState: (state: MarketState) => void;
  setIsInitialLoad: (isInitial: boolean) => void;
}

/**
 * Demo hook for video sequence player state.
 * Simulates market state changes for demonstration.
 */
export function useMarketStateDemo(): UseMarketStateDemoReturn {
  const [targetMarketState, setTargetMarketState] = useState<MarketState>('bearish');
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Simulate market state change after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setTargetMarketState('bullish');
      setIsInitialLoad(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  return {
    targetMarketState,
    isInitialLoad,
    setTargetMarketState,
    setIsInitialLoad,
  };
}
