import { TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface IndicatorToolbarProps {
  onOpenEmaSma: () => void;
  className?: string;
}

export function IndicatorToolbar({ onOpenEmaSma, className }: IndicatorToolbarProps) {
  return (
    <div className={cn(
      "flex flex-row gap-2 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-2 shadow-xl",
      className
    )}>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenEmaSma}
              className="h-20 w-20 text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
              aria-label="EMA/SMA Settings"
            >
              <TrendingUp className="h-20 w-20" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-slate-800 text-white border-slate-600">
            <div className="flex flex-col gap-1">
              <span className="font-semibold">EMA / SMA</span>
              <span className="text-xs text-slate-400">Configure moving averages</span>
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Future buttons will go here in Phase 2+ */}
        {/* 📊 Oscillators, 🎯 SMC, 📈 Trend, 📊 Vol, ⚙️ Settings */}
      </TooltipProvider>
    </div>
  );
}
