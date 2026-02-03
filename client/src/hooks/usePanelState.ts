import { useState, useCallback } from 'react';

type PanelName = 'marketSummary' | 'cvdTable' | 'oscillatorPanel' | 'alertsPanel';

interface PanelState {
  marketSummary: boolean;
  cvdTable: boolean;
  oscillatorPanel: boolean;
  alertsPanel: boolean;
  togglePanel: (panel: PanelName) => void;
  collapseAll: () => void;
  expandAll: () => void;
}

export function usePanelState(): PanelState {
  const [marketSummary, setMarketSummary] = useState(true);
  const [cvdTable, setCvdTable] = useState(true);
  const [oscillatorPanel, setOscillatorPanel] = useState(false);
  const [alertsPanel, setAlertsPanel] = useState(false);

  const togglePanel = useCallback((panel: PanelName) => {
    switch (panel) {
      case 'marketSummary':
        setMarketSummary(prev => !prev);
        break;
      case 'cvdTable':
        setCvdTable(prev => !prev);
        break;
      case 'oscillatorPanel':
        setOscillatorPanel(prev => !prev);
        break;
      case 'alertsPanel':
        setAlertsPanel(prev => !prev);
        break;
    }
  }, []);

  const collapseAll = useCallback(() => {
    setMarketSummary(true);
    setCvdTable(true);
    setOscillatorPanel(false);
    setAlertsPanel(false);
  }, []);

  const expandAll = useCallback(() => {
    setMarketSummary(false);
    setCvdTable(false);
    setOscillatorPanel(true);
    setAlertsPanel(true);
  }, []);

  return {
    marketSummary,
    cvdTable,
    oscillatorPanel,
    alertsPanel,
    togglePanel,
    collapseAll,
    expandAll,
  };
}
