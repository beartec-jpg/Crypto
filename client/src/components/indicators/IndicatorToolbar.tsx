import { TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface IndicatorToolbarProps {
  onOpenEmaSma: () => void;
}

export function IndicatorToolbar({ onOpenEmaSma }: IndicatorToolbarProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-row gap-2 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-2 shadow-xl">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenEmaSma}
              className="h-10 w-10 text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
              aria-label="EMA/SMA Settings"
            >
              <TrendingUp className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-slate-800 text-white border-slate-600">
            <div className="flex flex-col gap-1">
              <span className="font-semibold">EMA / SMA</span>
              <span className="text-xs text-slate-400">Configure moving averages</span>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
