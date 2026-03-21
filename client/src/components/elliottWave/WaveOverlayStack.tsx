import type { FibLevel } from '@/lib/elliottWave/fibCalculator';
import type { Drawing, ChartDrawingTool } from '@/types/drawing';
import { WaveStatusPanels } from '@/components/elliottWave/WaveStatusPanels';
import { WaveFibLayers } from '@/components/elliottWave/WaveFibLayers';
import { WaveClickOverlay } from '@/components/elliottWave/WaveClickOverlay';
import { FullscreenDrawingLayer } from '@/components/drawings/FullscreenDrawingLayer';

interface WaveOverlayStackProps {
  elliottWave: {
    isComplete: boolean;
    isValid: boolean;
    isDrawing: boolean;
    isActive: boolean;
    validationErrors: string[];
    fibProjections: FibLevel[];
    invalidationLevels: FibLevel[];
    reset: () => void;
    deactivateMode: () => void;
  };
  activeTool: ChartDrawingTool;
  onDeactivateTool: () => void;

  selectedWaveId: string | null;
  selectedWaveFibs: FibLevel[];
  futurePredictionLines: FibLevel[];
  chartViewVersion: number;
  drawings: Drawing[];
  chart: any;
  candleSeries: any;
  onDeselectWave: () => void;
  onWaveClick: (waveId: string, event: React.MouseEvent) => void;

  tempDrawing: { points: { time: number; price: number; snapType?: 'high' | 'low' | 'none' }[] } | null;
  quickMenuPosition: { x: number; y: number } | null;
  selectedDrawingId: string | null;
  onOpenDrawingSettings: () => void;
  onOpenDrawingAlerts?: () => void;
  onMoveDrawing?: () => void;
  onDeleteDrawing: () => void;
  onCloseQuickMenu: () => void;
}

export function WaveOverlayStack({
  elliottWave,
  activeTool,
  onDeactivateTool,
  selectedWaveId,
  selectedWaveFibs,
  futurePredictionLines,
  chartViewVersion,
  drawings,
  chart,
  candleSeries,
  onDeselectWave,
  onWaveClick,
  tempDrawing,
  quickMenuPosition,
  selectedDrawingId,
  onOpenDrawingSettings,
  onOpenDrawingAlerts,
  onMoveDrawing,
  onDeleteDrawing,
  onCloseQuickMenu,
}: WaveOverlayStackProps) {
  return (
    <>
      <WaveStatusPanels
        isComplete={elliottWave.isComplete}
        isValid={elliottWave.isValid}
        isDrawing={elliottWave.isDrawing}
        validationErrors={elliottWave.validationErrors}
        onReset={elliottWave.reset}
        onCancel={() => {
          elliottWave.deactivateMode();
          onDeactivateTool();
        }}
        onDeleteInvalid={() => {
          elliottWave.deactivateMode();
          onDeactivateTool();
        }}
      />

      <WaveFibLayers
        activeTool={activeTool}
        isActive={elliottWave.isActive}
        fibProjections={elliottWave.fibProjections}
        invalidationLevels={elliottWave.invalidationLevels}
        selectedWaveId={selectedWaveId}
        selectedWaveFibs={selectedWaveFibs}
        futurePredictionLines={futurePredictionLines}
        chart={chart}
        candleSeries={candleSeries}
      />

      <WaveClickOverlay
        chartViewVersion={chartViewVersion}
        drawings={drawings}
        chart={chart}
        candleSeries={candleSeries}
        selectedWaveId={selectedWaveId}
        activeTool={activeTool}
        onDeselect={onDeselectWave}
        onWaveClick={onWaveClick}
      />

      <FullscreenDrawingLayer
        tempDrawing={tempDrawing}
        chart={chart}
        candleSeries={candleSeries}
        quickMenuPosition={quickMenuPosition}
        selectedDrawingId={selectedDrawingId}
        onSettings={onOpenDrawingSettings}
        onAlert={onOpenDrawingAlerts}
        onMove={onMoveDrawing}
        onDelete={onDeleteDrawing}
        onCloseQuickMenu={onCloseQuickMenu}
      />
    </>
  );
}
