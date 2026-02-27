import { useCallback } from 'react';
import { authenticatedApiRequest } from '@/lib/apiAuth';
import type { Dispatch, SetStateAction } from 'react';
import type { Drawing } from '@/types/drawing';

interface UseFullscreenDrawingActionsParams {
  selectedDrawingId: string | null;
  drawings: Drawing[];
  setDrawings: Dispatch<SetStateAction<Drawing[]>>;
  drawingsPersistence: {
    deleteDrawing: (id: string) => void;
    updateDrawing: (payload: { id: string; updates: { style: Partial<Drawing['style']> } }) => void;
  };
  deleteEWLabelMutation: {
    mutate: (id: string) => void;
  };
  recordDelete: (drawing: Drawing) => void;
  setSelectedDrawingId: (id: string | null) => void;
}

export function useFullscreenDrawingActions({
  selectedDrawingId,
  drawings,
  setDrawings,
  drawingsPersistence,
  deleteEWLabelMutation,
  recordDelete,
  setSelectedDrawingId,
}: UseFullscreenDrawingActionsParams) {
  const handleDeleteDrawing = useCallback(() => {
    const id = selectedDrawingId;
    if (!id) return;

    const drawing = drawings.find(item => item.id === id);
    if (drawing?.type === 'elliott_wave') {
      deleteEWLabelMutation.mutate(id);
      setDrawings(previous => previous.filter(item => item.id !== id));
    } else {
      if (drawing) {
        recordDelete(drawing);
      }
      drawingsPersistence.deleteDrawing(id);
      setDrawings(previous => previous.filter(item => item.id !== id));
    }

    setSelectedDrawingId(null);
  }, [selectedDrawingId, drawings, deleteEWLabelMutation, setDrawings, recordDelete, drawingsPersistence, setSelectedDrawingId]);

  const handleUpdateDrawing = useCallback((updates: { style: Partial<Drawing['style']> }) => {
    const selectedId = selectedDrawingId;
    if (!selectedId || selectedId.startsWith('drawing-')) return;

    const drawing = drawings.find(item => item.id === selectedId);
    setDrawings(previous => previous.map(item => (
      item.id === selectedId
        ? { ...item, style: { ...item.style, ...updates.style } }
        : item
    )));

    if (drawing?.type === 'elliott_wave') {
      authenticatedApiRequest('PATCH', `/api/crypto/elliott-wave/labels/${selectedId}`, { metadata: updates.style })
        .catch(error => console.warn('[EW] Failed to update wave style:', error));
    } else {
      drawingsPersistence.updateDrawing({ id: selectedId, updates: { style: updates.style } });
    }
  }, [selectedDrawingId, drawings, setDrawings, drawingsPersistence]);

  return {
    handleDeleteDrawing,
    handleUpdateDrawing,
  };
}
