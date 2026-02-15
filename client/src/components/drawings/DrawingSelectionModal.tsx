import { TrendingUp, Minus, Square, Divide, GitBranch } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DrawingSelectionModalProps {
  open: boolean;
  drawings: Array<{ 
    id: string; 
    type: string; 
    label?: string;
    color?: string;
    points?: { time: number; price: number }[];
  }>;
  onSelect: (drawingId: string) => void;
  onClose: () => void;
}

const TOOL_ICONS: Record<string, any> = {
  trendline: TrendingUp,
  horizontal: Minus,
  rectangle: Square,
  fib_retracement: Divide,
  trend_fib: TrendingUp,
  channel: GitBranch,
};

const TOOL_NAMES: Record<string, string> = {
  trendline: 'Trendline',
  horizontal: 'Horizontal Line',
  rectangle: 'Rectangle',
  fib_retracement: 'Fib Retracement',
  trend_fib: 'Trend-Based Fib',
  channel: 'Channel',
};

// Visual preview component for each drawing type
function DrawingPreview({ type, color = '#3b82f6' }: { type: string; color?: string }) {
  const baseStyle = {
    width: '60px',
    height: '40px',
    position: 'relative' as const,
  };

  switch (type) {
    case 'horizontal':
      return (
        <svg width="60" height="40" style={baseStyle}>
          <line x1="0" y1="20" x2="60" y2="20" stroke={color} strokeWidth="2" />
        </svg>
      );
    
    case 'trendline':
      return (
        <svg width="60" height="40" style={baseStyle}>
          <line x1="5" y1="35" x2="55" y2="5" stroke={color} strokeWidth="2" />
        </svg>
      );
    
    case 'rectangle':
      return (
        <svg width="60" height="40" style={baseStyle}>
          <rect x="5" y="5" width="50" height="30" fill="none" stroke={color} strokeWidth="2" />
        </svg>
      );
    
    case 'fib_retracement':
      return (
        <svg width="60" height="40" style={baseStyle}>
          <line x1="10" y1="5" x2="50" y2="5" stroke={color} strokeWidth="1" strokeDasharray="2,2" opacity="0.6" />
          <line x1="10" y1="13" x2="50" y2="13" stroke={color} strokeWidth="1" strokeDasharray="2,2" opacity="0.8" />
          <line x1="10" y1="20" x2="50" y2="20" stroke={color} strokeWidth="2" />
          <line x1="10" y1="27" x2="50" y2="27" stroke={color} strokeWidth="1" strokeDasharray="2,2" opacity="0.8" />
          <line x1="10" y1="35" x2="50" y2="35" stroke={color} strokeWidth="1" strokeDasharray="2,2" opacity="0.6" />
        </svg>
      );
    
    case 'trend_fib':
      return (
        <svg width="60" height="40" style={baseStyle}>
          <line x1="5" y1="30" x2="20" y2="10" stroke={color} strokeWidth="1" strokeDasharray="2,2" opacity="0.4" />
          <line x1="25" y1="5" x2="55" y2="5" stroke={color} strokeWidth="1" strokeDasharray="2,2" opacity="0.6" />
          <line x1="25" y1="13" x2="55" y2="13" stroke={color} strokeWidth="1" strokeDasharray="2,2" opacity="0.8" />
          <line x1="25" y1="20" x2="55" y2="20" stroke={color} strokeWidth="2" />
          <line x1="25" y1="27" x2="55" y2="27" stroke={color} strokeWidth="1" strokeDasharray="2,2" opacity="0.8" />
        </svg>
      );
    
    case 'channel':
      return (
        <svg width="60" height="40" style={baseStyle}>
          <line x1="5" y1="30" x2="55" y2="10" stroke="#22c55e" strokeWidth="2" />
          <line x1="5" y1="35" x2="55" y2="15" stroke={color} strokeWidth="1" strokeDasharray="2,2" opacity="0.6" />
          <line x1="5" y1="25" x2="55" y2="5" stroke="#ef4444" strokeWidth="2" />
        </svg>
      );
    
    default:
      return (
        <svg width="60" height="40" style={baseStyle}>
          <line x1="5" y1="20" x2="55" y2="20" stroke={color} strokeWidth="2" />
        </svg>
      );
  }
}

export function DrawingSelectionModal({ open, drawings, onSelect, onClose }: DrawingSelectionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle>Select Drawing</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <div className="text-sm text-slate-400 mb-3">
            {drawings.length} drawing{drawings.length !== 1 ? 's' : ''} found at this location
          </div>
          
          <div className="space-y-2">
            {drawings.map((drawing, index) => {
              const Icon = TOOL_ICONS[drawing.type] || Square;
              const name = drawing.label || TOOL_NAMES[drawing.type] || drawing.type;
              const color = drawing.color || '#3b82f6';
              
              return (
                <Button
                  key={drawing.id}
                  variant="ghost"
                  onClick={() => { onSelect(drawing.id); onClose(); }}
                  className="w-full justify-start gap-3 h-auto py-3 px-3 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 transition-all"
                >
                  {/* Visual Preview */}
                  <div className="flex-shrink-0 bg-slate-950 rounded p-1 border border-slate-700">
                    <DrawingPreview type={drawing.type} color={color} />
                  </div>
                  
                  {/* Text Info */}
                  <div className="flex-1 text-left">
                    <div className="font-medium flex items-center gap-2">
                      <Icon className="h-4 w-4" style={{ color }} />
                      {name}
                    </div>
                    <div className="text-xs text-slate-500">Drawing #{index + 1}</div>
                  </div>
                  
                  {/* Color indicator */}
                  <div 
                    className="w-4 h-4 rounded-full border border-slate-600 flex-shrink-0" 
                    style={{ backgroundColor: color }}
                  />
                </Button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
