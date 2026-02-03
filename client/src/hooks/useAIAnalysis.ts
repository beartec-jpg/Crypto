import { useState, useCallback } from 'react';

interface AIAnalysis {
  analysis: string | null;
  loading: boolean;
  timestamp: number | null;
  cost: number;
  expanded: boolean;
  setAnalysis: (analysis: string | null) => void;
  setLoading: (loading: boolean) => void;
  setTimestamp: (timestamp: number | null) => void;
  setCost: (cost: number) => void;
  setExpanded: (expanded: boolean) => void;
  toggleExpanded: () => void;
  lastCheck: number;
  setLastCheck: (timestamp: number) => void;
  shouldRefresh: () => boolean;
  clear: () => void;
}

export function useAIAnalysis(): AIAnalysis {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [cost, setCost] = useState<number>(0);
  const [expanded, setExpanded] = useState(false);
  const [lastCheck, setLastCheck] = useState<number>(0);

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const shouldRefresh = useCallback(() => {
    if (!timestamp) return true;
    const hoursSinceAnalysis = (Date.now() - timestamp) / (1000 * 60 * 60);
    return hoursSinceAnalysis >= 1; // Refresh every hour
  }, [timestamp]);

  const clear = useCallback(() => {
    setAnalysis(null);
    setTimestamp(null);
    setCost(0);
    setExpanded(false);
  }, []);

  return {
    analysis,
    loading,
    timestamp,
    cost,
    expanded,
    setAnalysis,
    setLoading,
    setTimestamp,
    setCost,
    setExpanded,
    toggleExpanded,
    lastCheck,
    setLastCheck,
    shouldRefresh,
    clear,
  };
}
