import { Minus, TrendingUp, Square, Divide, GitBranch, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type DrawingTool = 'trendline' | 'horizontal' | 'rectangle' | 'fib_retracement' | 'trend_fib' | 'channel' | null;

interface ToolConfig {
  id: DrawingTool;
  icon: LucideIcon;
  label: string;
  description: string;
}

const TOOLS: ToolConfig[] = [
  {
    id: 'trendline',
    icon: TrendingUp,
    label: 'Trendline',
    description: 'Draw diagonal trendline',
  },
  {
    id: 'horizontal',
    icon: Minus,
    label: 'Horizontal Line',
    description: 'Draw horizontal support/resistance',
  },
  {
    id: 'rectangle',
    icon: Square,
    label: 'Rectangle',
    description: 'Draw price range box',
  },
  {
    id: 'fib_retracement',
    icon: Divide,
    label: 'Fib Retracement',
    description: 'Fibonacci retracement levels',
  },
  {
    id: 'trend_fib',
    icon: TrendingUp,
    label: 'Trend Fib',
    description: 'Fibonacci extension from trend',
  },
  {
    id: 'channel',
    icon: GitBranch,
    label: 'Channel',
    description: 'Parallel price channel',
  },
];

interface VerticalDrawingToolbarProps {
  activeTool: DrawingTool;
  onSelectTool: (tool: DrawingTool) => void;
}

export function VerticalDrawingToolbar({
  activeTool,
  onSelectTool,
}: VerticalDrawingToolbarProps) {
  const handleToolClick = (toolId: DrawingTool) => {
    // Toggle behavior: if already active, deselect it
    if (activeTool === toolId) {
      onSelectTool(null);
    } else {
      onSelectTool(toolId);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-2 shadow-xl">
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
                    h-10 w-10 transition-all
                    ${isActive 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/50' 
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }
                  `}
                  aria-label={tool.label}
                  aria-pressed={isActive}
                >
                  <Icon className="h-5 w-5" />
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
        
        {/* Active indicator */}
        {activeTool && (
          <div className="mt-2 pt-2 border-t border-slate-700">
            <div className="text-xs text-center text-slate-400 px-1">
              Drawing mode
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
