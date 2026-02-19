import { useState, useCallback, useMemo } from 'react';
import { 
  OSCILLATOR_PANEL_HEIGHT_PER,
  SINGLE_OSCILLATOR_PERCENT,
  MULTI_OSCILLATOR_PERCENT_EACH,
  MAX_OSCILLATOR_TOTAL_PERCENT,
  MIN_CHART_PERCENT
} from '@/lib/constants/layout';

type OscillatorDisplayMode = 'bottom' | 'mini' | 'popout' | 'off';

interface UseOscillatorPanelReturn {
  selectedOscillators: Set<string>;
  poppedOutOscillators: Set<string>;
  miniOscillators: Set<string>;
  dockedCount: number;
  miniCount: number;
  totalHeight: number;
  toggleOscillator: (id: string, mode?: OscillatorDisplayMode) => void;
  popoutOscillator: (id: string) => void;
  toggleMini: (id: string) => void;
  showSelector: boolean;
  setShowSelector: (show: boolean) => void;
  // NEW percentage-based values:
  totalPercentage: number;
  chartPercentage: number;
  perOscillatorPercentage: number;
}

export function useOscillatorPanel(): UseOscillatorPanelReturn {
  const [selectedOscillators, setSelectedOscillators] = useState<Set<string>>(new Set());
  const [poppedOutOscillators, setPoppedOutOscillators] = useState<Set<string>>(new Set());
  const [miniOscillators, setMiniOscillators] = useState<Set<string>>(new Set());
  const [showSelector, setShowSelector] = useState(false);

  const miniCount = useMemo(() => miniOscillators.size, [miniOscillators]);

  const dockedCount = useMemo(() => {
    return Array.from(selectedOscillators).filter(
      osc => !poppedOutOscillators.has(osc) && !miniOscillators.has(osc)
    ).length;
  }, [selectedOscillators, poppedOutOscillators, miniOscillators]);

  const totalHeight = useMemo(() => {
    return dockedCount > 0 ? dockedCount * OSCILLATOR_PANEL_HEIGHT_PER : 0;
  }, [dockedCount]);

  const totalPercentage = useMemo(() => {
    if (dockedCount === 0) return 0;
    if (dockedCount === 1) return SINGLE_OSCILLATOR_PERCENT;
    const multiPercent = dockedCount * MULTI_OSCILLATOR_PERCENT_EACH;
    return Math.min(multiPercent, MAX_OSCILLATOR_TOTAL_PERCENT);
  }, [dockedCount]);

  const chartPercentage = useMemo(() => {
    return Math.max(100 - totalPercentage, MIN_CHART_PERCENT);
  }, [totalPercentage]);

  const perOscillatorPercentage = useMemo(() => {
    if (dockedCount === 0) return 0;
    return totalPercentage / dockedCount;
  }, [totalPercentage, dockedCount]);

  const popoutOscillator = useCallback((oscillatorId: string) => {
    setPoppedOutOscillators(prev => {
      const next = new Set(prev);
      if (next.has(oscillatorId)) {
        next.delete(oscillatorId);
      } else {
        next.add(oscillatorId);
      }
      return next;
    });
  }, []);

  const toggleMini = useCallback((oscillatorId: string) => {
    setMiniOscillators(prev => {
      const next = new Set(prev);
      if (next.has(oscillatorId)) {
        next.delete(oscillatorId);
      } else {
        // Remove from popped if adding to mini
        setPoppedOutOscillators(p => { const n = new Set(p); n.delete(oscillatorId); return n; });
        next.add(oscillatorId);
      }
      return next;
    });
    // Ensure it's selected
    setSelectedOscillators(prev => { const next = new Set(prev); next.add(oscillatorId); return next; });
  }, []);

  const toggleOscillator = useCallback((oscillator: string, mode?: OscillatorDisplayMode) => {
    if (!mode) {
      // Toggle between off and bottom for backward compatibility
      setSelectedOscillators(prev => {
        const next = new Set(prev);
        if (next.has(oscillator)) {
          next.delete(oscillator);
        } else {
          next.add(oscillator);
        }
        return next;
      });
      return;
    }

    if (mode === 'off') {
      setSelectedOscillators(prev => { const next = new Set(prev); next.delete(oscillator); return next; });
      setPoppedOutOscillators(prev => { const next = new Set(prev); next.delete(oscillator); return next; });
      setMiniOscillators(prev => { const next = new Set(prev); next.delete(oscillator); return next; });
    } else if (mode === 'bottom') {
      setSelectedOscillators(prev => { const next = new Set(prev); next.add(oscillator); return next; });
      setPoppedOutOscillators(prev => { const next = new Set(prev); next.delete(oscillator); return next; });
      setMiniOscillators(prev => { const next = new Set(prev); next.delete(oscillator); return next; });
    } else if (mode === 'mini') {
      setSelectedOscillators(prev => { const next = new Set(prev); next.add(oscillator); return next; });
      setPoppedOutOscillators(prev => { const next = new Set(prev); next.delete(oscillator); return next; });
      setMiniOscillators(prev => { const next = new Set(prev); next.add(oscillator); return next; });
    } else if (mode === 'popout') {
      setSelectedOscillators(prev => { const next = new Set(prev); next.add(oscillator); return next; });
      setPoppedOutOscillators(prev => { const next = new Set(prev); next.add(oscillator); return next; });
      setMiniOscillators(prev => { const next = new Set(prev); next.delete(oscillator); return next; });
    }
  }, []);

  return {
    selectedOscillators,
    poppedOutOscillators,
    miniOscillators,
    dockedCount,
    miniCount,
    totalHeight,
    toggleOscillator,
    popoutOscillator,
    toggleMini,
    showSelector,
    setShowSelector,
    totalPercentage,
    chartPercentage,
    perOscillatorPercentage,
  };
}
