import { useCallback } from 'react';

interface UseSaveDrawingWithUndoParams {
  saveDrawing: (drawing: any, options?: { onSuccess?: (data: any) => void }) => void;
  recordAdd: (drawing: any) => void;
  updateDrawingId: (oldId: string, newId: string) => void;
}

export function useSaveDrawingWithUndo({ saveDrawing, recordAdd, updateDrawingId }: UseSaveDrawingWithUndoParams) {
  return useCallback((drawing: any) => {
    recordAdd(drawing);
    saveDrawing(drawing, {
      onSuccess: (serverDrawing: any) => {
        if (drawing.id && serverDrawing?.id && serverDrawing.id !== drawing.id) {
          updateDrawingId(drawing.id, serverDrawing.id);
        }
      },
    });
  }, [recordAdd, saveDrawing, updateDrawingId]);
}
