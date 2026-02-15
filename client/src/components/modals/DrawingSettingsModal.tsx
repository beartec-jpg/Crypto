import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DrawingSettingsPanel } from '@/components/drawing-settings/DrawingSettingsPanel';

interface Drawing {
  id: string;
  type: string;
  points: { time: number; value: number }[];
  style: {
    lineColor?: string;
    lineWidth?: number;
    showLabel?: boolean;
    labelText?: string;
  };
}

interface DrawingSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  drawing: Drawing | null;
  onUpdate: (updates: any) => void;
}

/**
 * Modal wrapper for drawing settings
 * Extracted from CryptoIndicators.tsx for Phase 4G-10
 * Auto-centers on screen and stays within viewport
 */
export function DrawingSettingsModal({
  isOpen,
  onClose,
  drawing,
  onUpdate
}: DrawingSettingsModalProps) {
  if (!drawing) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="w-[90vw] max-w-md max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700 fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]"
      >
        <DialogHeader>
          <DialogTitle className="text-white">
            Drawing Settings
          </DialogTitle>
        </DialogHeader>

        <DrawingSettingsPanel
          drawing={drawing}
          onUpdate={onUpdate}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
