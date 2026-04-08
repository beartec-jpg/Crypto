import type { ChartDrawingTool } from '@/types/drawing';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

interface UseFullscreenKeyboardShortcutsParams {
  activeTool: ChartDrawingTool;
  setActiveTool: (tool: ChartDrawingTool) => void;
  activeToolRef: React.MutableRefObject<ChartDrawingTool>;
  lastUsedToolRef?: React.MutableRefObject<ChartDrawingTool>;
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
  lastUsedToolRef,
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
        const tool = lastUsedToolRef?.current || 'trendline';
        setActiveTool(tool);
        activeToolRef.current = tool;
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
