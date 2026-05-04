import type { LucideIcon } from 'lucide-react';
import { Activity, Type, ArrowUpDown, Hash, Spline } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ChartDrawingTool } from '@/types/drawing';

interface ToolConfig {
  id: ChartDrawingTool;
  icon?: LucideIcon;
  imageSrc?: string;
  label: string;
  description: string;
}

const TOOLS: ToolConfig[] = [
  {
    id: 'trendline',
    imageSrc: '/grok_image_1771520120762.jpg',
    label: 'Trendline',
    description: 'Draw diagonal trendline',
  },
  {
    id: 'horizontal',
    imageSrc: '/grok_image_1771520273030.jpg',
    label: 'Horizontal Line',
    description: 'Draw horizontal support/resistance',
  },
  {
    id: 'vertical',
    icon: ArrowUpDown,
    label: 'Vertical Line',
    description: 'Draw vertical time marker',
  },
  {
    id: 'rectangle',
    imageSrc: '/grok_image_1771526019906.jpg',
    label: 'Rectangle',
    description: 'Draw price range box',
  },
  {
    id: 'fib_retracement',
    imageSrc: '/grok_image_1771521978179.jpg',
    label: 'Fib Retracement',
    description: 'Fibonacci retracement levels',
  },
  {
    id: 'trend_fib',
    imageSrc: '/grok_image_1771522020838.jpg',
    label: 'Trend Fib',
    description: 'Fibonacci extension from trend',
  },
  {
    id: 'channel',
    imageSrc: '/grok_image_1771520978164.jpg',
    label: 'Channel',
    description: 'Parallel price channel',
  },
  {
    id: 'text',
    icon: Type,
    label: 'Text Label',
    description: 'Place text annotation on chart',
  },
  {
    id: 'number_label',
    icon: Hash,
    label: 'Number Label',
    description: 'Drop sequential numbered labels (1, 2, 3…)',
  },
  {
    id: 'free_draw',
    icon: Spline,
    label: 'Free Draw',
    description: 'Freehand stroke – free / line / curve assisted',
  },
  {
    id: 'elliott_wave',
    icon: Activity,
    label: 'Elliott Wave',
    description: 'Progressive Elliott Wave analysis',
  },
];

interface VerticalDrawingToolbarProps {
  activeTool: ChartDrawingTool;
  onSelectTool: (tool: ChartDrawingTool) => void;
  isVertical?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function VerticalDrawingToolbar({
  activeTool,
  onSelectTool,
  isVertical = false,
  className,
  style,
}: VerticalDrawingToolbarProps) {
  const handleToolClick = (toolId: ChartDrawingTool) => {
    // Toggle behavior: if already active, deselect it
    if (activeTool === toolId) {
      onSelectTool(null);
    } else {
      onSelectTool(toolId);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div 
        className={cn(
          "flex gap-0",
          isVertical ? "flex-col" : "flex-row",
          "bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-0 shadow-xl",
          className
        )}
        style={style}
      >
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          
          return (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={isActive ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => handleToolClick(tool.id)}
                  className={`
                    h-20 w-20 p-0 transition-all
                    ${isActive 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/50' 
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }
                  `}
                  aria-label={tool.label}
                  title={tool.label}
                  aria-pressed={isActive}
                >
                  {tool.imageSrc ? (
                    <img src={tool.imageSrc} alt={tool.label} className="h-full w-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  ) : Icon ? (
                    <Icon className="h-full w-full" />
                  ) : null}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-slate-800 text-white border-slate-600">
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">{tool.label}</span>
                  <span className="text-xs text-slate-400">{tool.description}</span>
                  {isActive && (
                    <span className="text-xs text-blue-400 mt-1">
                      Click again to deselect
                    </span>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

/** Preview component for minimized state - shows first tool icon */
export function DrawingToolbarPreview() {
  return (
    <div className="h-10 w-10 flex items-center justify-center text-slate-400 opacity-60 overflow-hidden">
      <img src="/grok_image_1771520120762.jpg" alt="Trendline" className="h-10 w-10 object-contain" />
    </div>
  );
}
