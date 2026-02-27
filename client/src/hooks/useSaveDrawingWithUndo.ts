import { useCallback } from 'react';

interface UseSaveDrawingWithUndoParams {
  saveDrawing: (drawing: any) => void;
  recordAdd: (drawing: any) => void;
}

export function useSaveDrawingWithUndo({ saveDrawing, recordAdd }: UseSaveDrawingWithUndoParams) {
  return useCallback((drawing: any) => {
    recordAdd(drawing);
    saveDrawing(drawing);
  }, [recordAdd, saveDrawing]);
}
