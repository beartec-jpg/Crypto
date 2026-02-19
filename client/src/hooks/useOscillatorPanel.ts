import { useState, useCallback, useMemo } from 'react';
import { OSCILLATOR_PANEL_HEIGHT_PER } from '@/lib/constants/layout';

type OscillatorDisplayMode = 'bottom' | 'mini' | 'popout' | 'off';

interface UseOscillatorPanelReturn {
  selectedOscillators: Set<string>;
  poppedOutOscillators: Set<string>;
  dockedCount: number;
  totalHeight: number;
  toggleOscillator: (id: string, mode?: OscillatorDisplayMode) => void;
  popoutOscillator: (id: string) => void;
  showSelector: boolean;
  setShowSelector: (show: boolean) => void;
}

export function useOscillatorPanel(): UseOscillatorPanelReturn {
  const [selectedOscillators, setSelectedOscillators] = useState<Set<string>>(new Set());
  const [poppedOutOscillators, setPoppedOutOscillators] = useState<Set<string>>(new Set());
  const [showSelector, setShowSelector] = useState(false);

  const dockedCount = useMemo(() => {
    return Array.from(selectedOscillators).filter(osc => !poppedOutOscillators.has(osc)).length;
  }, [selectedOscillators, poppedOutOscillators]);

  const totalHeight = useMemo(() => {
    return dockedCount > 0 ? dockedCount * OSCILLATOR_PANEL_HEIGHT_PER : 0;
  }, [dockedCount]);

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
    } else if (mode === 'bottom') {
      setSelectedOscillators(prev => { const next = new Set(prev); next.add(oscillator); return next; });
      setPoppedOutOscillators(prev => { const next = new Set(prev); next.delete(oscillator); return next; });
    } else if (mode === 'mini' || mode === 'popout') {
      setSelectedOscillators(prev => { const next = new Set(prev); next.add(oscillator); return next; });
      setPoppedOutOscillators(prev => { const next = new Set(prev); next.add(oscillator); return next; });
    }
  }, []);

  return {
    selectedOscillators,
    poppedOutOscillators,
    dockedCount,
    totalHeight,
    toggleOscillator,
    popoutOscillator,
    showSelector,
    setShowSelector,
  };
}
