import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { authenticatedApiRequest } from '@/lib/apiAuth';
import { calcRetracementLevels } from '@/lib/elliottWave/fibCalculator';
import { calculateFuturePredictions } from '@/lib/elliottWave/futurePredictions';
import type { Drawing } from '@/types/drawing';
import type { FibLevel } from '@/lib/elliottWave/fibCalculator';

interface ProjectionLine {
  id: string;
  structureId: string;
  levelLabel: string;
  price: number;
  waveType: string;
  color: string;
}

interface UseWaveSelectionParams {
  drawings: Drawing[];
  candles: Array<{ time: number }>;
  drawingInteraction: {
    setSelectedDrawingId: (id: string | null) => void;
    setQuickMenuPosition: (position: { x: number; y: number } | null) => void;
  };
}

export function useWaveSelection({
  drawings,
  candles,
  drawingInteraction,
}: UseWaveSelectionParams) {
  const [selectedWaveId, setSelectedWaveId] = useState<string | null>(null);
  const [selectedWaveFibs, setSelectedWaveFibs] = useState<FibLevel[]>([]);
  const [futurePredictionLines, setFuturePredictionLines] = useState<FibLevel[]>([]);

  const clearSelection = useCallback(() => {
    setSelectedWaveId(null);
    setSelectedWaveFibs([]);
  }, []);

  const handleWaveClick = useCallback(async (waveId: string, event: MouseEvent) => {
    event.stopPropagation();

    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }

    if (selectedWaveId === waveId) {
      clearSelection();
      drawingInteraction.setSelectedDrawingId(null);
      return;
    }

    drawingInteraction.setSelectedDrawingId(waveId);
    drawingInteraction.setQuickMenuPosition({ x: event.clientX, y: event.clientY });

    setSelectedWaveId(waveId);
    setSelectedWaveFibs([]);

    const wave = drawings.find(drawing => drawing.id === waveId);
    if (wave && wave.points.length >= 2) {
      const startPrice = wave.points[0].price;
      const endPrice = wave.points[wave.points.length - 1].price;
      const fibs = calcRetracementLevels(startPrice, endPrice, [0.236, 0.382, 0.5, 0.618, 0.786]);
      setSelectedWaveFibs(fibs);
    }

    try {
      const response = await authenticatedApiRequest(
        'GET',
        `/api/crypto/projection-lines?structureId=${encodeURIComponent(waveId)}`,
      );
      const projections: ProjectionLine[] = await response.json();
      if (projections.length > 0) {
        const fibs: FibLevel[] = projections.map(projection => {
          const match = projection.levelLabel?.match(/([\d.]+)%/);
          const ratio = match ? parseFloat(match[1]) / 100 : 1;
          return {
            ratio,
            price: projection.price,
            label: projection.levelLabel ?? `${(ratio * 100).toFixed(1)}%`,
            isRetrace: false,
          };
        });
        setSelectedWaveFibs(fibs);
      }
    } catch (error) {
      console.warn('[EW] Failed to fetch projection lines:', error);
    }
  }, [selectedWaveId, drawings, drawingInteraction, clearSelection]);

  const handleDeselect = useCallback(() => {
    if (selectedWaveId) {
      clearSelection();
    }
  }, [selectedWaveId, clearSelection]);

  useEffect(() => {
    const candleInterval =
      candles.length >= 2 ? Math.abs(candles[1].time - candles[0].time) : 3600;
    const allPredictions: FibLevel[] = [];

    for (const drawing of drawings.filter(d => d.type === 'elliott_wave')) {
      if ((drawing.style as any)?.showFuturePredictions !== false) {
        allPredictions.push(...calculateFuturePredictions(drawing, candleInterval));
      }
    }

    setFuturePredictionLines(allPredictions);
  }, [drawings, candles, calculateFuturePredictions]);

  return {
    selectedWaveId,
    selectedWaveFibs,
    futurePredictionLines,
    handleWaveClick,
    handleDeselect,
    clearSelection,
  };
}
