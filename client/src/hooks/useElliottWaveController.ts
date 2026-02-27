import { useCallback } from 'react';
import { getDegreeConfiguration } from '@/components/elliottWave/DegreePicker';
import type { ChartDrawingTool } from '@/types/drawing';

interface UseElliottWaveControllerParams {
  activeTool: ChartDrawingTool;
  elliottWave: {
    canSave: boolean;
    points: Array<{ time: number; price: number; label?: string; isMidAir?: boolean; snapType?: 'high' | 'low' | 'none' }>;
    activateMode: (patternType: string, degree: string, waveLabel: string) => void;
    deactivateMode: () => void;
  };
  waveSelection: {
    clearSelection: () => void;
  };
  symbol: string;
  timeframe: string;
  selectedWaveDegree: string;
  selectedWaveLabel: string;
  selectedWavePatternType: string;
  setShowDegreePicker: (show: boolean) => void;
  setSelectedWaveDegree: (degree: string) => void;
  setSelectedWaveLabel: (label: string) => void;
  setSelectedWavePatternType: (patternType: string) => void;
  setActiveTool: (tool: ChartDrawingTool) => void;
  activeToolRef: React.MutableRefObject<ChartDrawingTool>;
  saveEWLabelMutation: {
    mutate: (payload: any) => void;
  };
}

export function useElliottWaveController({
  activeTool,
  elliottWave,
  waveSelection,
  symbol,
  timeframe,
  selectedWaveDegree,
  selectedWaveLabel,
  selectedWavePatternType,
  setShowDegreePicker,
  setSelectedWaveDegree,
  setSelectedWaveLabel,
  setSelectedWavePatternType,
  setActiveTool,
  activeToolRef,
  saveEWLabelMutation,
}: UseElliottWaveControllerParams) {
  const deactivateTool = useCallback(() => {
    setActiveTool(null);
    activeToolRef.current = null;
  }, [setActiveTool, activeToolRef]);

  const handleSelectTool = useCallback((tool: ChartDrawingTool) => {
    if (activeTool === 'elliott_wave' && tool !== 'elliott_wave') {
      elliottWave.deactivateMode();
    }

    if (tool === 'elliott_wave' && activeTool !== 'elliott_wave') {
      setShowDegreePicker(true);
      return;
    }

    waveSelection.clearSelection();
    setActiveTool(tool);
    activeToolRef.current = tool;
  }, [activeTool, elliottWave, setShowDegreePicker, waveSelection, setActiveTool, activeToolRef]);

  const handleDegreeSelect = useCallback((degree: string, waveLabel: string, patternType: string) => {
    setSelectedWaveDegree(degree);
    setSelectedWaveLabel(waveLabel);
    setSelectedWavePatternType(patternType);
    setShowDegreePicker(false);
    waveSelection.clearSelection();
    elliottWave.activateMode(patternType, degree, waveLabel);
    setActiveTool('elliott_wave');
    activeToolRef.current = 'elliott_wave';
  }, [elliottWave, waveSelection, setSelectedWaveDegree, setSelectedWaveLabel, setSelectedWavePatternType, setShowDegreePicker, setActiveTool, activeToolRef]);

  const handleElliottWaveSave = useCallback(() => {
    if (!elliottWave.canSave) return;

    const degreeConfig = getDegreeConfiguration(selectedWaveDegree);
    saveEWLabelMutation.mutate({
      symbol,
      timeframe,
      degree: selectedWaveDegree.toLowerCase().replace(/\s+/g, '_'),
      patternType: selectedWavePatternType,
      points: elliottWave.points.map(point => ({
        time: point.time,
        price: point.price,
        label: point.label,
        isMidAir: point.isMidAir ?? false,
        snapType: point.snapType ?? 'none',
      })),
      isComplete: true,
      metadata: {
        waveType: selectedWavePatternType,
        color: degreeConfig.impulse.color,
        degreeLabel: selectedWaveDegree,
        waveLabel: selectedWaveLabel,
        impulseColor: degreeConfig.impulse.color,
        zigzagColor: degreeConfig.correction.color,
      },
    });

    elliottWave.deactivateMode();
    deactivateTool();
  }, [elliottWave, selectedWaveDegree, saveEWLabelMutation, symbol, timeframe, selectedWavePatternType, selectedWaveLabel, deactivateTool]);

  return {
    deactivateTool,
    handleSelectTool,
    handleDegreeSelect,
    handleElliottWaveSave,
  };
}
