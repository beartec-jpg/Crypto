import { useState } from 'react';
import { Pencil, TrendingUp, Minus, Square, GitBranch, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ChartDrawingTool } from '@/types/drawing';

interface DrawingTool {
  id: ChartDrawingTool;
  icon: React.ReactNode;
  label: string;
  description: string;
}

/** Custom SVG for Fibonacci Retracement – multiple horizontal lines */
function FibIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      className={cn('h-4 w-4', className)}
    >
      <line x1="4" y1="5" x2="20" y2="5" strokeWidth="1.5" />
      <line x1="4" y1="9" x2="20" y2="9" strokeWidth="1.5" strokeDasharray="2 2" />
      <line x1="4" y1="13" x2="20" y2="13" strokeWidth="1.5" />
      <line x1="4" y1="17" x2="20" y2="17" strokeWidth="1.5" strokeDasharray="2 2" />
      <line x1="4" y1="21" x2="20" y2="21" strokeWidth="1.5" />
    </svg>
  );
}

/** Custom SVG for Channel – two parallel diagonal lines */
function ChannelIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      className={cn('h-4 w-4', className)}
    >
      <line x1="2" y1="18" x2="22" y2="6" strokeWidth="1.5" />
      <line x1="2" y1="22" x2="22" y2="10" strokeWidth="1.5" />
    </svg>
  );
}

const DRAWING_TOOLS: DrawingTool[] = [
  {
    id: 'trendline',
    icon: <TrendingUp className="h-4 w-4" />,
    label: 'Trendline',
    description: 'Draw diagonal trendline',
  },
  {
    id: 'horizontal',
    icon: <Minus className="h-4 w-4" />,
    label: 'Horizontal Line',
    description: 'Draw horizontal support/resistance',
  },
  {
    id: 'rectangle',
    icon: <Square className="h-4 w-4" />,
    label: 'Rectangle',
    description: 'Draw price range box',
  },
  {
    id: 'fib_retracement',
    icon: <FibIcon />,
    label: 'Fib Retracement',
    description: 'Fibonacci retracement levels',
  },
  {
    id: 'trend_fib',
    icon: <FibIcon />,
    label: 'Trend Fib',
    description: 'Fibonacci extension from trend',
  },
  {
    id: 'channel',
    icon: <ChannelIcon />,
    label: 'Channel',
    description: 'Parallel price channel',
  },
  {
    id: 'elliott_wave',
    icon: <Activity className="h-4 w-4" />,
    label: 'Elliott Wave',
    description: 'Progressive Elliott Wave analysis',
  },
];

interface DrawingMenuProps {
  activeTool: ChartDrawingTool;
  onSelectTool: (tool: ChartDrawingTool) => void;
  className?: string;
}

export function DrawingMenu({ activeTool, onSelectTool, className }: DrawingMenuProps) {
  const [open, setOpen] = useState(false);

  const handleSelectTool = (toolId: ChartDrawingTool) => {
    // Toggle: clicking an already active tool deselects it
    if (activeTool === toolId) {
      onSelectTool(null);
    } else {
      onSelectTool(toolId);
    }
    setOpen(false);
  };

  const activeTool_ = DRAWING_TOOLS.find(t => t.id === activeTool);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-9 w-9 transition-all',
            activeTool
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30'
              : 'text-slate-300 hover:text-white hover:bg-slate-800',
            className,
          )}
          title={activeTool_ ? `Drawing: ${activeTool_.label}` : 'Drawing Tools'}
          aria-label="Drawing Tools"
        >
          {activeTool_ ? (
            <span className="h-4 w-4 flex items-center justify-center">
              {activeTool_.icon}
            </span>
          ) : (
            <Pencil className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="bottom"
        align="start"
        className="w-52 bg-slate-900 border-slate-700 text-slate-100 p-1"
      >
        {DRAWING_TOOLS.map(tool => (
          <DropdownMenuItem
            key={tool.id}
            onClick={() => handleSelectTool(tool.id)}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors',
              activeTool === tool.id
                ? 'bg-blue-600 text-white'
                : 'hover:bg-slate-800 text-slate-200',
            )}
          >
            <span className="shrink-0 w-4 h-4 flex items-center justify-center">
              {tool.icon}
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium leading-tight">{tool.label}</span>
              <span className="text-xs text-slate-400 leading-tight truncate">
                {tool.description}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
