import { TrendingUp, Minus, Square, Divide } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DrawingSelectionModalProps {
  open: boolean;
  drawings: Array<{ id: string; type: string; label?: string }>;
  onSelect: (drawingId: string) => void;
  onClose: () => void;
}

const TOOL_ICONS: Record<string, any> = {
  trendline: TrendingUp,
  horizontal: Minus,
  rectangle: Square,
  fib_retracement: Divide,
  trend_fib: TrendingUp,
  channel: TrendingUp,
};

const TOOL_NAMES: Record<string, string> = {
  trendline: 'Trendline',
  horizontal: 'Horizontal Line',
  rectangle: 'Rectangle',
  fib_retracement: 'Fib Retracement',
  trend_fib: 'Trend-Based Fib',
  channel: 'Channel',
};

export function DrawingSelectionModal({ open, drawings, onSelect, onClose }: DrawingSelectionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle>Select Drawing</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <div className="text-sm text-slate-400 mb-3">
            {drawings.length} drawing{drawings.length !== 1 ? 's' : ''} found
          </div>
          
          <div className="space-y-2">
            {drawings.map((drawing, index) => {
              const Icon = TOOL_ICONS[drawing.type] || Square;
              const name = drawing.label || TOOL_NAMES[drawing.type] || drawing.type;
              
              return (
                <Button
                  key={drawing.id}
                  variant="ghost"
                  onClick={() => { onSelect(drawing.id); onClose(); }}
                  className="w-full justify-start gap-3 h-auto py-3 hover:bg-slate-800"
                >
                  <Icon className="h-5 w-5 text-blue-400" />
                  <div>
                    <div className="font-medium">{name}</div>
                    <div className="text-xs text-slate-500">Drawing #{index + 1}</div>
                  </div>
                </Button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
