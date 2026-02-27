import type { ChartDrawingTool } from '@/types/drawing';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

interface UseFullscreenKeyboardShortcutsParams {
  activeTool: ChartDrawingTool;
  setActiveTool: (tool: ChartDrawingTool) => void;
  activeToolRef: React.MutableRefObject<ChartDrawingTool>;
  onSelectTool: (tool: ChartDrawingTool) => void;
  onDeleteSelected: () => void;
  onDeselectAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function useFullscreenKeyboardShortcuts({
  activeTool,
  setActiveTool,
  activeToolRef,
  onSelectTool,
  onDeleteSelected,
  onDeselectAll,
  onUndo,
  onRedo,
}: UseFullscreenKeyboardShortcutsParams) {
  useKeyboardShortcuts({
    onToggleDrawingMode: () => {
      if (activeTool) {
        setActiveTool(null);
        activeToolRef.current = null;
      } else {
        setActiveTool('trendline');
        activeToolRef.current = 'trendline';
      }
    },
    onTurnOffDrawing: () => {
      setActiveTool(null);
      activeToolRef.current = null;
    },
    onSelectTool: (tool) => onSelectTool(tool as ChartDrawingTool),
    onDeleteSelected,
    onDeselectAll,
    onUndo,
    onRedo,
  });
}
