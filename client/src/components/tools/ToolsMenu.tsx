import { useState } from 'react';
import { Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface ToolsMenuProps {
  divergenceScannerEnabled: boolean;
  onToggleDivergenceScanner: (enabled: boolean) => void;
  className?: string;
}

export function ToolsMenu({
  divergenceScannerEnabled,
  onToggleDivergenceScanner,
  className,
}: ToolsMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative h-9 w-9 transition-all',
            divergenceScannerEnabled
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30'
              : 'text-slate-300 hover:text-white hover:bg-slate-800',
            className,
          )}
          title="Tools"
          aria-label="Tools"
        >
          <Wrench className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        className="w-56 p-0 bg-slate-900 border-slate-700 text-slate-100"
      >
        <div className="p-2">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide px-1 mb-1">
            Tools
          </div>
          <div className="flex items-center justify-between py-1.5 px-1">
            <div className="min-w-0 mr-3">
              <div className="text-sm font-medium text-slate-100 leading-tight">
                Divergence Scanner
              </div>
              <div className="text-xs text-slate-400 leading-tight">
                Scan all 7 oscillators
              </div>
            </div>
            <Switch
              checked={divergenceScannerEnabled}
              onCheckedChange={onToggleDivergenceScanner}
              className="shrink-0 data-[state=checked]:bg-blue-600"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
