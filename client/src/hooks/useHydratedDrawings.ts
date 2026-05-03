import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Drawing } from '@/types/drawing';

interface UseHydratedDrawingsParams {
  persistedDrawings: any[] | undefined;
  ewLabels: any[] | undefined;
  setDrawings: Dispatch<SetStateAction<Drawing[]>>;
}

/**
 * Return the expected wave-point labels for a given patternType.
 * Used as a fallback when saved points don't carry their own label field.
 */
function derivePointLabels(patternType: string): string[] {
  switch (patternType) {
    case 'internal_abc':
    case 'zigzag':
    case 'flat':
    case 'combination':
    case 'wxy':
      return ['0', 'a', 'b', 'c'];
    case 'triangle':
      return ['0', 'a', 'b', 'c', 'd', 'e'];
    case 'undefined_3_numeric':
    case 'undefined_3_numeric_measured':
      return ['0', '1', '2', '3'];
    case 'undefined_3_alpha':
    case 'undefined_3_alpha_measured':
      return ['0', 'A', 'B', 'C'];
    case 'undefined_5_numeric':
    case 'undefined_5_numeric_measured':
      return ['0', '1', '2', '3', '4', '5'];
    case 'undefined_5_alpha':
    case 'undefined_5_alpha_measured':
      return ['0', 'A', 'B', 'C', 'D', 'E'];
    case 'impulse':
    case 'leading_diagonal':
    case 'ending_diagonal':
    case 'truncated':
    default:
      return ['0', '1', '2', '3', '4', '5'];
  }
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
      .map((label: any): Drawing => {
        const patternType: string = label.patternType ?? label.pattern_type ?? 'impulse';
        const fallbackLabels = derivePointLabels(patternType);

        return {
          id: label.id,
          type: 'elliott_wave',
          points: label.points.map((point: any, i: number) => ({
            time: point.time,
            price: point.price,
            // Use saved label when present; fall back to pattern-derived label so
            // the settings panel always shows meaningful wave labels instead of "0,1,2,3".
            label: point.label ?? fallbackLabels[i] ?? String(i),
            isMidAir: point.isMidAir ?? false,
            snapType: point.snapType ?? 'high',
          })),
          style: {
            color: label.metadata?.impulseColor ?? label.metadata?.color ?? '#00CED1',
            lineWidth: 2,
            waveType: patternType,
            degreeLabel: label.metadata?.degreeLabel ?? label.degree ?? 'Minor',
            waveLabel: label.metadata?.waveLabel ?? '',
            impulseColor: label.metadata?.impulseColor ?? label.metadata?.color ?? '#00CED1',
            impulseOpacity: label.metadata?.impulseOpacity,
            impulseWidth: label.metadata?.impulseWidth,
            impulseStyle: label.metadata?.impulseStyle,
            zigzagColor: label.metadata?.zigzagColor ?? '#808080',
            zigzagOpacity: label.metadata?.zigzagOpacity,
            zigzagStyle: label.metadata?.zigzagStyle,
            showLabel: label.metadata?.showLabel ?? true,
            fontSize: label.metadata?.fontSize ?? '12px',
            showFuturePredictions: label.metadata?.showFuturePredictions ?? true,
            // Restore per-point label overrides and visibility toggles saved via PATCH
            customPointLabels: label.metadata?.customPointLabels,
            hiddenPointLabels: label.metadata?.hiddenPointLabels,
          },
        };
      });

    // Merge server wave drawings with existing local state to preserve any locally-set
    // style properties (e.g. showFuturePredictions: false) that may not yet be reflected
    // in the server data due to in-flight PATCH requests.
    setDrawings(prev => {
      const mergedWaveDrawings = waveDrawings.map(newDrawing => {
        const existing = prev.find(d => d.id === newDrawing.id && d.type === 'elliott_wave');
        if (existing) {
          // Preserve local style which may contain unsaved updates
          return { ...newDrawing, style: existing.style };
        }
        return newDrawing;
      });
      return [...regularDrawings, ...mergedWaveDrawings];
    });
  }, [persistedDrawings, ewLabels, setDrawings]);
}
