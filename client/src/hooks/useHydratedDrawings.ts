import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Drawing } from '@/types/drawing';

interface UseHydratedDrawingsParams {
  persistedDrawings: any[] | undefined;
  ewLabels: any[] | undefined;
  setDrawings: Dispatch<SetStateAction<Drawing[]>>;
}

export function useHydratedDrawings({ persistedDrawings, ewLabels, setDrawings }: UseHydratedDrawingsParams) {
  useEffect(() => {
    const regularDrawings = (persistedDrawings ?? [])
      .map((drawing: any): Drawing | null => {
        try {
          if (!drawing.id) return null;
          const drawingType = drawing.drawingType || drawing.drawing_type || drawing.tool || 'trendline';
          if (drawingType === 'elliott_wave') return null;
          return {
            id: drawing.id,
            type: drawingType,
            points: drawing.coordinates?.points || drawing.points || [],
            style: { color: drawing.style?.color || '#3b82f6', lineWidth: drawing.style?.lineWidth || 2, ...drawing.style },
          };
        } catch {
          return null;
        }
      })
      .filter((drawing): drawing is Drawing => drawing !== null && drawing.points.length > 0);

    const waveDrawings: Drawing[] = (ewLabels ?? [])
      .filter((label: any) => Array.isArray(label.points) && label.points.length > 0)
      .map((label: any): Drawing => ({
        id: label.id,
        type: 'elliott_wave',
        points: label.points.map((point: any) => ({
          time: point.time,
          price: point.price,
          label: point.label,
          isMidAir: point.isMidAir ?? false,
          snapType: point.snapType ?? 'high',
        })),
        style: {
          color: label.metadata?.impulseColor ?? label.metadata?.color ?? '#00CED1',
          lineWidth: 2,
          waveType: label.patternType ?? label.pattern_type ?? 'EW',
          degreeLabel: label.metadata?.degreeLabel ?? label.degree ?? 'Minor',
          waveLabel: label.metadata?.waveLabel ?? '',
          impulseColor: label.metadata?.impulseColor ?? label.metadata?.color ?? '#00CED1',
          zigzagColor: label.metadata?.zigzagColor ?? '#808080',
          showLabel: label.metadata?.showLabel ?? true,
          fontSize: label.metadata?.fontSize ?? '12px',
          showFuturePredictions: label.metadata?.showFuturePredictions ?? true,
        },
      }));

    setDrawings([...regularDrawings, ...waveDrawings]);
  }, [persistedDrawings, ewLabels, setDrawings]);
}
