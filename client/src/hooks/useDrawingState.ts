import { useState, useCallback, useRef } from 'react';
import type {
  DrawingTool,
  TrendlineData,
  HorizontalLineData,
  ChannelData,
  HorizontalChannelData,
  SlopedChannelData,
  FibRetracementData,
  TrendFibExtensionData,
  TextLabelData,
  DrawingState
} from '@/types/drawing';

/**
 * Custom hook for managing all drawing state in the crypto chart
 * Centralizes state management, undo/redo, and drawing operations
 */
export function useDrawingState() {
  // All drawing data arrays
  const [trendlines, setTrendlines] = useState<TrendlineData[]>([]);
  const [horizontals, setHorizontals] = useState<HorizontalLineData[]>([]);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [hchannels, setHChannels] = useState<HorizontalChannelData[]>([]);
  const [schannels, setSChannels] = useState<SlopedChannelData[]>([]);
  const [fibs, setFibs] = useState<FibRetracementData[]>([]);
  const [trendfibs, setTrendFibs] = useState<TrendFibExtensionData[]>([]);
  const [labels, setLabels] = useState<TextLabelData[]>([]);

  // Selection state - unified for all drawing types
  const [selectedDrawing, setSelectedDrawing] = useState<{ id: string; type: DrawingTool } | null>(null);

  // Undo/Redo state
  const [history, setHistory] = useState<DrawingState[]>([{
    trendlines: [],
    horizontals: [],
    channels: [],
    hchannels: [],
    schannels: [],
    fibs: [],
    trendfibs: [],
    labels: []
  }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoRef = useRef(false); // Track if change is from undo/redo

  // Helper to get current state snapshot
  const getCurrentState = useCallback((): DrawingState => ({
    trendlines,
    horizontals,
    channels,
    hchannels,
    schannels,
    fibs,
    trendfibs,
    labels
  }), [trendlines, horizontals, channels, hchannels, schannels, fibs, trendfibs, labels]);

  // Save to history
  const saveToHistory = useCallback((state: DrawingState) => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(state);
      // Keep last 50 states
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  // Restore state from history
  const restoreState = useCallback((state: DrawingState) => {
    isUndoRedoRef.current = true;
    setTrendlines(state.trendlines);
    setHorizontals(state.horizontals);
    setChannels(state.channels);
    setHChannels(state.hchannels || []);
    setSChannels(state.schannels || []);
    setFibs(state.fibs || []);
    setTrendFibs(state.trendfibs || []);
    setLabels(state.labels);
  }, []);

  // Add a new drawing
  const addDrawing = useCallback((type: DrawingTool, data: any) => {
    let newState: DrawingState;

    switch (type) {
      case 'trendline':
        const newTrendlines = [...trendlines, data as TrendlineData];
        setTrendlines(newTrendlines);
        newState = { ...getCurrentState(), trendlines: newTrendlines };
        break;

      case 'horizontal':
        const newHorizontals = [...horizontals, data as HorizontalLineData];
        setHorizontals(newHorizontals);
        newState = { ...getCurrentState(), horizontals: newHorizontals };
        break;

      case 'channel':
        const newChannels = [...channels, data as ChannelData];
        setChannels(newChannels);
        newState = { ...getCurrentState(), channels: newChannels };
        break;

      case 'hchannel':
        const newHChannels = [...hchannels, data as HorizontalChannelData];
        setHChannels(newHChannels);
        newState = { ...getCurrentState(), hchannels: newHChannels };
        break;

      case 'schannel':
        const newSChannels = [...schannels, data as SlopedChannelData];
        setSChannels(newSChannels);
        newState = { ...getCurrentState(), schannels: newSChannels };
        break;

      case 'fibretracement':
        const newFibs = [...fibs, data as FibRetracementData];
        setFibs(newFibs);
        newState = { ...getCurrentState(), fibs: newFibs };
        break;

      case 'trendfib':
        const newTrendFibs = [...trendfibs, data as TrendFibExtensionData];
        setTrendFibs(newTrendFibs);
        newState = { ...getCurrentState(), trendfibs: newTrendFibs };
        break;

      case 'label':
        const newLabels = [...labels, data as TextLabelData];
        setLabels(newLabels);
        newState = { ...getCurrentState(), labels: newLabels };
        break;

      default:
        return; // No state change for unknown types
    }

    saveToHistory(newState);
  }, [trendlines, horizontals, channels, hchannels, schannels, fibs, trendfibs, labels, getCurrentState, saveToHistory]);

  // Update an existing drawing
  const updateDrawing = useCallback((type: DrawingTool, id: string, updates: any) => {
    let newState: DrawingState;

    switch (type) {
      case 'trendline':
        const updatedTrendlines = trendlines.map(item => 
          item.id === id ? { ...item, ...updates } : item
        );
        setTrendlines(updatedTrendlines);
        newState = { ...getCurrentState(), trendlines: updatedTrendlines };
        break;

      case 'horizontal':
        const updatedHorizontals = horizontals.map(item =>
          item.id === id ? { ...item, ...updates } : item
        );
        setHorizontals(updatedHorizontals);
        newState = { ...getCurrentState(), horizontals: updatedHorizontals };
        break;

      case 'channel':
        const updatedChannels = channels.map(item =>
          item.id === id ? { ...item, ...updates } : item
        );
        setChannels(updatedChannels);
        newState = { ...getCurrentState(), channels: updatedChannels };
        break;

      case 'hchannel':
        const updatedHChannels = hchannels.map(item =>
          item.id === id ? { ...item, ...updates } : item
        );
        setHChannels(updatedHChannels);
        newState = { ...getCurrentState(), hchannels: updatedHChannels };
        break;

      case 'schannel':
        const updatedSChannels = schannels.map(item =>
          item.id === id ? { ...item, ...updates } : item
        );
        setSChannels(updatedSChannels);
        newState = { ...getCurrentState(), schannels: updatedSChannels };
        break;

      case 'fibretracement':
        const updatedFibs = fibs.map(item =>
          item.id === id ? { ...item, ...updates } : item
        );
        setFibs(updatedFibs);
        newState = { ...getCurrentState(), fibs: updatedFibs };
        break;

      case 'trendfib':
        const updatedTrendFibs = trendfibs.map(item =>
          item.id === id ? { ...item, ...updates } : item
        );
        setTrendFibs(updatedTrendFibs);
        newState = { ...getCurrentState(), trendfibs: updatedTrendFibs };
        break;

      case 'label':
        const updatedLabels = labels.map(item =>
          item.id === id ? { ...item, ...updates } : item
        );
        setLabels(updatedLabels);
        newState = { ...getCurrentState(), labels: updatedLabels };
        break;

      default:
        return; // No state change for unknown types
    }

    saveToHistory(newState);
  }, [trendlines, horizontals, channels, hchannels, schannels, fibs, trendfibs, labels, getCurrentState, saveToHistory]);

  // Delete a drawing
  const deleteDrawing = useCallback((type: DrawingTool, id: string) => {
    let newState: DrawingState;

    switch (type) {
      case 'trendline':
        const filteredTrendlines = trendlines.filter(item => item.id !== id);
        setTrendlines(filteredTrendlines);
        newState = { ...getCurrentState(), trendlines: filteredTrendlines };
        break;

      case 'horizontal':
        const filteredHorizontals = horizontals.filter(item => item.id !== id);
        setHorizontals(filteredHorizontals);
        newState = { ...getCurrentState(), horizontals: filteredHorizontals };
        break;

      case 'channel':
        const filteredChannels = channels.filter(item => item.id !== id);
        setChannels(filteredChannels);
        newState = { ...getCurrentState(), channels: filteredChannels };
        break;

      case 'hchannel':
        const filteredHChannels = hchannels.filter(item => item.id !== id);
        setHChannels(filteredHChannels);
        newState = { ...getCurrentState(), hchannels: filteredHChannels };
        break;

      case 'schannel':
        const filteredSChannels = schannels.filter(item => item.id !== id);
        setSChannels(filteredSChannels);
        newState = { ...getCurrentState(), schannels: filteredSChannels };
        break;

      case 'fibretracement':
        const filteredFibs = fibs.filter(item => item.id !== id);
        setFibs(filteredFibs);
        newState = { ...getCurrentState(), fibs: filteredFibs };
        break;

      case 'trendfib':
        const filteredTrendFibs = trendfibs.filter(item => item.id !== id);
        setTrendFibs(filteredTrendFibs);
        newState = { ...getCurrentState(), trendfibs: filteredTrendFibs };
        break;

      case 'label':
        const filteredLabels = labels.filter(item => item.id !== id);
        setLabels(filteredLabels);
        newState = { ...getCurrentState(), labels: filteredLabels };
        break;

      default:
        return; // No state change for unknown types
    }

    saveToHistory(newState);
  }, [trendlines, horizontals, channels, hchannels, schannels, fibs, trendfibs, labels, getCurrentState, saveToHistory]);

  // Clear all drawings
  const clearAllDrawings = useCallback(() => {
    const emptyState: DrawingState = {
      trendlines: [],
      horizontals: [],
      channels: [],
      hchannels: [],
      schannels: [],
      fibs: [],
      trendfibs: [],
      labels: []
    };

    setTrendlines([]);
    setHorizontals([]);
    setChannels([]);
    setHChannels([]);
    setSChannels([]);
    setFibs([]);
    setTrendFibs([]);
    setLabels([]);

    saveToHistory(emptyState);
  }, [saveToHistory]);

  // Undo last action
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const state = history[newIndex];
      setHistoryIndex(newIndex);
      restoreState(state);
    }
  }, [historyIndex, history, restoreState]);

  // Redo last undone action
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const state = history[newIndex];
      setHistoryIndex(newIndex);
      restoreState(state);
    }
  }, [historyIndex, history, restoreState]);

  // Select a drawing
  const selectDrawing = useCallback((id: string, type: DrawingTool) => {
    setSelectedDrawing({ id, type });
  }, []);

  // Deselect current drawing
  const deselectDrawing = useCallback(() => {
    setSelectedDrawing(null);
  }, []);

  // Return all state and actions
  return {
    // State getters
    state: {
      trendlines,
      horizontals,
      channels,
      hchannels,
      schannels,
      fibs,
      trendfibs,
      labels,
      selectedDrawing
    },

    // State setters (for advanced use cases where direct control is needed)
    setState: {
      setTrendlines,
      setHorizontals,
      setChannels,
      setHChannels,
      setSChannels,
      setFibs,
      setTrendFibs,
      setLabels,
      setSelectedDrawing
    },

    // Action methods
    addDrawing,
    updateDrawing,
    deleteDrawing,
    clearAllDrawings,

    // Undo/Redo
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,

    // Selection
    selectDrawing,
    deselectDrawing,

    // History management (for advanced use cases)
    saveToHistory,
    getCurrentState
  };
}
