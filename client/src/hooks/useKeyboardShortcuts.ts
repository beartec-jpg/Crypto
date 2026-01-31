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
}

export function useKeyboardShortcuts({
  onToggleDrawingMode,
  onSelectTool,
  onToggleFullscreen,
  onOpenSettings,
  onDeleteSelected,
  onDeselectAll
}: KeyboardShortcutsConfig) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
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

      // Deselect: Escape
      if (e.key === 'Escape') {
        onDeselectAll?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleDrawingMode, onSelectTool, onToggleFullscreen, onOpenSettings, onDeleteSelected, onDeselectAll]);
}
