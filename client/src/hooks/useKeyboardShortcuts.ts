import { useEffect } from 'react';

/**
 * Hook for managing keyboard shortcuts in the chart interface
 * Extracted from CryptoIndicators.tsx for Phase 4G-7
 */

interface KeyboardShortcutsConfig {
  onToggleDrawingMode?: () => void;
  onSelectTool?: (tool: string) => void;
  onToggleFullscreen?: () => void;
  onOpenSettings?: () => void;
  onDeleteSelected?: () => void;
  onDeselectAll?: () => void;
  onTurnOffDrawing?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function useKeyboardShortcuts({
  onToggleDrawingMode,
  onSelectTool,
  onToggleFullscreen,
  onOpenSettings,
  onDeleteSelected,
  onDeselectAll,
  onTurnOffDrawing,
  onUndo,
  onRedo,
}: KeyboardShortcutsConfig) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Undo: Ctrl/Cmd + Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo?.();
        } else {
          onUndo?.();
        }
        return;
      }

      // Redo: Ctrl/Cmd + Y
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        onRedo?.();
        return;
      }

      // Fullscreen: F11
      if (e.key === 'F11') {
        e.preventDefault();
        onToggleFullscreen?.();
        return;
      }

      // Settings: Ctrl/Cmd + ,
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        onOpenSettings?.();
        return;
      }

      // Drawing mode: D
      if (e.key === 'd' || e.key === 'D') {
        onToggleDrawingMode?.();
        return;
      }

      // Drawing tools
      const toolMap: Record<string, string> = {
        't': 'trendline',
        'h': 'horizontal',
        'v': 'vertical',
        'r': 'rectangle',
        'f': 'fib_retracement',
        'c': 'channel'
      };

      if (toolMap[e.key.toLowerCase()]) {
        onSelectTool?.(toolMap[e.key.toLowerCase()]);
        return;
      }

      // Delete selected: Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDeleteSelected?.();
        return;
      }

      // Escape: turn off drawing mode and deselect all
      if (e.key === 'Escape') {
        onTurnOffDrawing?.();
        onDeselectAll?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleDrawingMode, onSelectTool, onToggleFullscreen, onOpenSettings, onDeleteSelected, onDeselectAll, onTurnOffDrawing, onUndo, onRedo]);
}
