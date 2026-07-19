import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DrawingSettingsPanel } from '@/components/drawing-settings/DrawingSettingsPanel';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Drawing {
  id: string;
  type: string;
  points: { time: number; value: number }[];
  style: {
    lineColor?: string;
    lineWidth?: number;
    showLabel?: boolean;
    labelText?: string;
    label?: string;
    labelPosition?: 'left' | 'right';
    labelColor?: string;
    labelSize?: 'sm' | 'md' | 'lg';
  };
}

interface DrawingSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  drawing: Drawing | null;
  onUpdate: (updates: any) => void;
  autoColorEnabled?: boolean;
  onAutoColorChange?: (enabled: boolean) => void;
  onSaveAsDefault?: (payload: { tool: string; style: any }) => void | Promise<void>;
  onResetDefault?: (tool: string) => void | Promise<void>;
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
  onUpdate,
  autoColorEnabled,
  onAutoColorChange,
  onSaveAsDefault,
  onResetDefault,
}: DrawingSettingsModalProps) {
  if (!drawing) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="w-[90vw] max-w-md max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700 fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]"
      >
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-white">
            Drawing Settings
          </DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DrawingSettingsPanel
          drawing={drawing}
          onUpdate={onUpdate}
          onClose={onClose}
          autoColorEnabled={autoColorEnabled}
          onAutoColorChange={onAutoColorChange}
          onSaveAsDefault={onSaveAsDefault}
          onResetDefault={onResetDefault}
        />
      </DialogContent>
    </Dialog>
  );
}
