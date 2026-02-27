import { useState } from 'react';
import { Zap, Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { TRADING_SYSTEMS, type TradingSystemId, type TradingSystem } from '@/types/tradingSystems';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TradingSystemsMenuProps {
  activeSystem: TradingSystemId | null;
  onActivateSystem: (systemId: TradingSystemId) => void;
  onDeactivateSystem: () => void;
  className?: string;
}

function SystemCard({ 
  system, 
  isActive, 
  onSelect 
}: { 
  system: TradingSystem; 
  isActive: boolean; 
  onSelect: () => void;
}) {
  const categoryColors = {
    trend: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    reversal: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
    breakout: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    smc: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  };

  const activeTools = [
    ...Object.entries(system.preset.oscillators || {}).filter(([_, v]) => v?.enabled).map(([k]) => k),
    ...Object.entries(system.preset.indicators || {}).filter(([_, v]) => v?.enabled).map(([k]) => k),
    ...Object.entries(system.preset.smc || {}).filter(([_, v]) => v?.enabled).map(([k]) => k),
    ...Object.entries(system.preset.tools || {}).filter(([_, v]) => v?.enabled).map(([k]) => k),
  ];

  return (
    <div
      onClick={onSelect}
      className={cn(
        'relative p-3 rounded-lg border cursor-pointer transition-all hover:scale-[1.02]',
        isActive 
          ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/20' 
          : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
      )}
    >
      {isActive && (
        <div className="absolute -top-2 -right-2 bg-blue-600 rounded-full p-1">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
      
      <div className="flex items-start gap-3 mb-2">
        <span className="text-2xl">{system.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-white truncate">{system.name}</h3>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-gray-400 flex-shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">{system.description}</p>
                  {system.alerts?.entry && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-semibold text-blue-300">Entry Signals:</p>
                      {system.alerts.entry.map((alert, i) => (
                        <p key={i} className="text-xs text-gray-300">• {alert}</p>
                      ))}
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-xs text-gray-400 line-clamp-2 mb-2">{system.description}</p>
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-[10px] px-2 py-0.5 rounded-full border uppercase font-medium',
              categoryColors[system.category]
            )}>
              {system.category}
            </span>
            <span className="text-[10px] text-gray-500">
              {activeTools.length} tools
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TradingSystemsMenu({
  activeSystem,
  onActivateSystem,
  onDeactivateSystem,
  className,
}: TradingSystemsMenuProps) {
  const [open, setOpen] = useState(false);

  const systems = Object.values(TRADING_SYSTEMS);
  const trendSystems = systems.filter(s => s.category === 'trend');
  const reversalSystems = systems.filter(s => s.category === 'reversal');
  const breakoutSystems = systems.filter(s => s.category === 'breakout');
  const smcSystems = systems.filter(s => s.category === 'smc');

  const handleSelectSystem = (systemId: TradingSystemId) => {
    if (activeSystem === systemId) {
      onDeactivateSystem();
    } else {
      onActivateSystem(systemId);
    }
    setOpen(false);
  };

  const activeSystemData = activeSystem ? TRADING_SYSTEMS[activeSystem] : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'relative h-8 gap-1.5 text-xs',
            activeSystem ? 'text-blue-400 hover:text-blue-300' : 'text-gray-400 hover:text-white',
            className
          )}
        >
          <Zap className={cn(
            'w-4 h-4',
            activeSystem && 'animate-pulse'
          )} />
          <span className="hidden sm:inline">
            {activeSystem ? activeSystemData?.name : 'Trading Systems'}
          </span>
          {activeSystem && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-[600px] max-h-[600px] overflow-y-auto bg-slate-900 border-slate-700 text-white"
        align="start"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between sticky top-0 bg-slate-900 pb-2 border-b border-slate-700">
            <div>
              <h3 className="text-sm font-semibold text-white">Trading Systems</h3>
              <p className="text-xs text-gray-400">Pre-configured indicator presets for specific strategies</p>
            </div>
            {activeSystem && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeactivateSystem();
                  setOpen(false);
                }}
                className="text-xs h-7 border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                Deactivate
              </Button>
            )}
          </div>

          {/* Trend Following Systems */}
          <div>
            <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>📈</span> Trend Following
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {trendSystems.map((system) => (
                <SystemCard
                  key={system.id}
                  system={system}
                  isActive={activeSystem === system.id}
                  onSelect={() => handleSelectSystem(system.id)}
                />
              ))}
            </div>
          </div>

          {/* Reversal Systems */}
          <div>
            <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>🔄</span> Mean Reversion / Reversal
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {reversalSystems.map((system) => (
                <SystemCard
                  key={system.id}
                  system={system}
                  isActive={activeSystem === system.id}
                  onSelect={() => handleSelectSystem(system.id)}
                />
              ))}
            </div>
          </div>

          {/* Breakout Systems */}
          <div>
            <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>🚀</span> Breakout & Momentum
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {breakoutSystems.map((system) => (
                <SystemCard
                  key={system.id}
                  system={system}
                  isActive={activeSystem === system.id}
                  onSelect={() => handleSelectSystem(system.id)}
                />
              ))}
            </div>
          </div>

          {/* Smart Money Systems */}
          <div>
            <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>💎</span> Smart Money Concepts
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {smcSystems.map((system) => (
                <SystemCard
                  key={system.id}
                  system={system}
                  isActive={activeSystem === system.id}
                  onSelect={() => handleSelectSystem(system.id)}
                />
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-500 pt-2 border-t border-slate-700">
            💡 Tip: Activating a system will automatically enable and configure all required indicators
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
