import { useEffect } from 'react';

interface UseElliottWaveKeyboardShortcutsParams {
  elliottWave: {
    isActive: boolean;
    canUndo: boolean;
    undo: () => void;
    deactivateMode: () => void;
  };
  onDeactivateTool: () => void;
  toast: (args: { title: string }) => void;
}

export function useElliottWaveKeyboardShortcuts({
  elliottWave,
  onDeactivateTool,
  toast,
}: UseElliottWaveKeyboardShortcutsParams) {
  useEffect(() => {
    if (!elliottWave.isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Backspace' || event.key === 'Delete') && !event.shiftKey) {
        if (elliottWave.canUndo) {
          elliottWave.undo();
          toast({ title: 'Point removed' });
        }
        event.preventDefault();
      }

      if (event.key === 'Escape') {
        elliottWave.deactivateMode();
        onDeactivateTool();
        toast({ title: 'Wave cleared' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [elliottWave, onDeactivateTool, toast]);
}
