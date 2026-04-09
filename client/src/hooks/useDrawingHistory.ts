import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Drawing } from '@/types/drawing';

interface DrawingOperation {
  type: 'add' | 'delete';
  drawing: any;
}

interface UseDrawingHistoryParams {
  drawingsPersistence: {
    saveDrawing: (drawing: any) => void;
    deleteDrawing: (drawingId: string) => void;
  };
  setDrawings: Dispatch<SetStateAction<Drawing[]>>;
}

export function useDrawingHistory({ drawingsPersistence, setDrawings }: UseDrawingHistoryParams) {
  const undoStackRef = useRef<DrawingOperation[]>([]);
  const redoStackRef = useRef<DrawingOperation[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const handleUndo = useCallback(() => {
    const operation = undoStackRef.current.pop();
    if (!operation) return;

    redoStackRef.current.push(operation);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);

    if (operation.type === 'add') {
      drawingsPersistence.deleteDrawing(operation.drawing.id);
      setDrawings(previous => previous.filter(drawing => drawing.id !== operation.drawing.id));
    } else {
      drawingsPersistence.saveDrawing(operation.drawing);
      setDrawings(previous => [...previous, operation.drawing]);
    }
  }, [drawingsPersistence, setDrawings]);

  const handleRedo = useCallback(() => {
    const operation = redoStackRef.current.pop();
    if (!operation) return;

    undoStackRef.current.push(operation);
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);

    if (operation.type === 'add') {
      drawingsPersistence.saveDrawing(operation.drawing);
      setDrawings(previous => [...previous, operation.drawing]);
    } else {
      drawingsPersistence.deleteDrawing(operation.drawing.id);
      setDrawings(previous => previous.filter(drawing => drawing.id !== operation.drawing.id));
    }
  }, [drawingsPersistence, setDrawings]);

  const recordAdd = useCallback((drawing: any) => {
    undoStackRef.current.push({ type: 'add', drawing });
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const recordDelete = useCallback((drawing: any) => {
    undoStackRef.current.push({ type: 'delete', drawing });
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  // Update the stored drawing ID in both stacks when the server assigns a new ID
  // (local temp IDs like `drawing-${Date.now()}` are replaced by server-assigned UUIDs)
  const updateDrawingId = useCallback((oldId: string, newId: string) => {
    undoStackRef.current = undoStackRef.current.map(op =>
      op.drawing.id === oldId ? { ...op, drawing: { ...op.drawing, id: newId } } : op
    );
    redoStackRef.current = redoStackRef.current.map(op =>
      op.drawing.id === oldId ? { ...op, drawing: { ...op.drawing, id: newId } } : op
    );
  }, []);

  return {
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    recordAdd,
    recordDelete,
    updateDrawingId,
  };
}
