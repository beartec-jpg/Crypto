import { useState, useEffect, useRef } from 'react';
import { CandleData } from '@/types/chart.types';

/**
 * Hook for managing replay mode controls and state
 * Extracted from CryptoIndicators.tsx for Phase 2
 */

export interface ReplayModeState {
  isReplayMode: boolean;
  setIsReplayMode: (val: boolean) => void;
  replayIndex: number;
  setReplayIndex: (val: number) => void;
  replaySpeed: number;
  setReplaySpeed: (val: number) => void;
  isReplayPlaying: boolean;
  setIsReplayPlaying: (val: boolean) => void;
  fullCandleData: CandleData[];
  setFullCandleData: (val: CandleData[]) => void;
  
  // Control methods
  reset: () => void;
  stepBackward: (steps: number) => void;
  stepForward: (steps: number) => void;
  togglePlayback: () => void;
}

export function useReplayMode(): ReplayModeState {
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState(100);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [fullCandleData, setFullCandleData] = useState<CandleData[]>([]);
  
  const replayIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-play effect based on speed
  useEffect(() => {
    if (isReplayPlaying && isReplayMode && fullCandleData.length > 0) {
      // Clear any existing interval
      if (replayIntervalRef.current) {
        clearInterval(replayIntervalRef.current);
      }
      
      // Calculate interval based on speed (1x = 1000ms, 2x = 500ms, etc.)
      const interval = 1000 / replaySpeed;
      
      replayIntervalRef.current = setInterval(() => {
        setReplayIndex(prevIndex => {
          // Check bounds
          if (prevIndex >= fullCandleData.length - 1) {
            setIsReplayPlaying(false);
            return prevIndex;
          }
          return prevIndex + 1;
        });
      }, interval);
    } else {
      // Clear interval when not playing
      if (replayIntervalRef.current) {
        clearInterval(replayIntervalRef.current);
        replayIntervalRef.current = null;
      }
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (replayIntervalRef.current) {
        clearInterval(replayIntervalRef.current);
        replayIntervalRef.current = null;
      }
    };
  }, [isReplayPlaying, isReplayMode, replaySpeed, fullCandleData.length]);

  // Control methods
  const reset = () => {
    setReplayIndex(100);
    setIsReplayPlaying(false);
  };

  const stepBackward = (steps: number = 1) => {
    setReplayIndex(prevIndex => Math.max(100, prevIndex - steps));
    setIsReplayPlaying(false);
  };

  const stepForward = (steps: number = 1) => {
    setReplayIndex(prevIndex => 
      Math.min(fullCandleData.length - 1, prevIndex + steps)
    );
    setIsReplayPlaying(false);
  };

  const togglePlayback = () => {
    setIsReplayPlaying(prev => !prev);
  };

  return {
    isReplayMode,
    setIsReplayMode,
    replayIndex,
    setReplayIndex,
    replaySpeed,
    setReplaySpeed,
    isReplayPlaying,
    setIsReplayPlaying,
    fullCandleData,
    setFullCandleData,
    reset,
    stepBackward,
    stepForward,
    togglePlayback,
  };
}
