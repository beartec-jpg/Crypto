import { useCallback, useMemo } from 'react';
import type { Drawing } from '@/types/drawing';

interface UseFullscreenModalHelpersParams {
  selectedDrawingId: string | null;
  drawings: Drawing[];
  setSettingsModalOpen: (open: boolean) => void;
}

export function useFullscreenModalHelpers({
  selectedDrawingId,
  drawings,
  setSettingsModalOpen,
}: UseFullscreenModalHelpersParams) {
  const handleOpenSettings = useCallback(() => setSettingsModalOpen(true), [setSettingsModalOpen]);
  const handleCloseSettings = useCallback(() => setSettingsModalOpen(false), [setSettingsModalOpen]);

  const selectedDrawingForModal = useMemo(() => {
    if (!selectedDrawingId) return null;
    const drawing = drawings.find(item => item.id === selectedDrawingId);
    if (!drawing) return null;
    return {
      ...drawing,
      points: drawing.points.map(point => ({ time: point.time, value: point.price })),
    };
  }, [selectedDrawingId, drawings]);

  return {
    handleOpenSettings,
    handleCloseSettings,
    selectedDrawingForModal,
  };
}
