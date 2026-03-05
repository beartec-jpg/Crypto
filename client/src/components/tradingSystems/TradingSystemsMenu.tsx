import { useState, useEffect, useRef } from 'react';
import { Zap, Check, Activity, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { TRADING_SYSTEMS, type TradingSystemId, type TradingSystem } from '@/types/tradingSystems';

interface TradingSystemsMenuProps {
  activeSystem: TradingSystemId | null;
  onActivateSystem: (systemId: TradingSystemId) => void;
  onDeactivateSystem: () => void;
  confluenceSnapshot: {
    score: number;
    longCount: number;
    shortCount: number;
    neutralCount: number;
    updatedAt: number;
  } | null;
  onToggleFloatingMonitor: () => void;
  className?: string;
}

const categoryColors: Record<TradingSystem['category'], string> = {
  trend: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  reversal: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
  breakout: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
  smc: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
};

function countTools(preset: TradingSystem['preset']): number {
  let count = 0;
  if (preset.oscillators) count += Object.values(preset.oscillators).filter(o => o?.enabled).length;
  if (preset.indicators) count += Object.values(preset.indicators).filter(i => i?.enabled).length;
  if (preset.smc) count += Object.values(preset.smc).filter(s => s?.enabled).length;
  if (preset.tools) count += Object.values(preset.tools).filter(t => t?.enabled).length;
  return count;
}

function AccordionSystem({
  system,
  isActive,
  isExpanded,
  onToggle,
  onActivate,
}: {
  system: TradingSystem;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onActivate: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-3 hover:bg-slate-800/50 rounded-lg transition-colors min-h-[48px]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl flex-shrink-0">{system.icon}</span>
          <span className="text-sm font-medium text-white truncate">{system.name}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          {isActive && <Check className="w-4 h-4 text-green-500" />}
          <ChevronRight
            className={cn(
              'w-4 h-4 text-slate-400 transition-transform duration-200',
              isExpanded && 'rotate-90'
            )}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
          <p className="text-xs text-slate-400 leading-relaxed">{system.description}</p>
          <div className="flex items-center gap-2 text-xs">
            <span className={cn('px-2 py-0.5 rounded-full border uppercase font-medium text-[10px]', categoryColors[system.category])}>
              {system.category}
            </span>
            <span className="text-slate-500">{countTools(system.preset)} tools</span>
          </div>
          <Button
            onClick={onActivate}
            className="w-full"
            variant={isActive ? 'outline' : 'default'}
            disabled={isActive}
            size="sm"
          >
            {isActive ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Active
              </>
            ) : (
              'Activate System'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export function TradingSystemsMenu({
  activeSystem,
  onActivateSystem,
  onDeactivateSystem,
  confluenceSnapshot,
  onToggleFloatingMonitor,
  className,
}: TradingSystemsMenuProps) {
  const [open, setOpen] = useState(false);
  const [expandedSystemId, setExpandedSystemId] = useState<TradingSystemId | null>(null);
  const popoverContentRef = useRef<HTMLDivElement>(null);

  // Close menu when chart is clicked
  useEffect(() => {
    if (!open) return;

    const handleChartClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Check if click is inside the popover content
      if (popoverContentRef.current && popoverContentRef.current.contains(target)) {
        return;
      }

      // Check if click is on the trigger button
      const triggerButton = document.querySelector('[data-testid="btn-trading-systems"]');
      if (triggerButton && triggerButton.contains(target)) {
        return;
      }

      // Close menu on any other click (including chart clicks)
      setOpen(false);
    };

    // Add listener with slight delay to avoid immediate closure
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleChartClick);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleChartClick);
    };
  }, [open]);

  const systems = Object.values(TRADING_SYSTEMS);
  const trendSystems = systems.filter(s => s.category === 'trend');
  const reversalSystems = systems.filter(s => s.category === 'reversal');
  const breakoutSystems = systems.filter(s => s.category === 'breakout');
  const smcSystems = systems.filter(s => s.category === 'smc');

  const toggleExpand = (systemId: TradingSystemId) => {
    setExpandedSystemId(prev => prev === systemId ? null : systemId);
  };

  const handleActivateSystem = (systemId: TradingSystemId) => {
    onActivateSystem(systemId);
    setExpandedSystemId(null);
    setOpen(false);
  };

  const activeSystemData = activeSystem ? TRADING_SYSTEMS[activeSystem] : null;

  const confluenceColorClass = !confluenceSnapshot
    ? 'text-slate-300'
    : confluenceSnapshot.score >= 0.35
      ? 'text-emerald-300'
      : confluenceSnapshot.score >= 0.1
        ? 'text-lime-300'
        : confluenceSnapshot.score <= -0.35
          ? 'text-rose-300'
          : confluenceSnapshot.score <= -0.1
            ? 'text-orange-300'
            : 'text-yellow-300';

  const renderCategory = (
    label: string,
    icon: string,
    headerClass: string,
    categorySystems: TradingSystem[]
  ) => (
    <div className="space-y-0.5">
      <h4 className={cn('text-xs font-bold uppercase tracking-wider px-3 py-2', headerClass)}>
        {icon} {label}
      </h4>
      {categorySystems.map((system) => (
        <AccordionSystem
          key={system.id}
          system={system}
          isActive={activeSystem === system.id}
          isExpanded={expandedSystemId === system.id}
          onToggle={() => toggleExpand(system.id)}
          onActivate={() => handleActivateSystem(system.id)}
        />
      ))}
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-testid="btn-trading-systems"
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
        ref={popoverContentRef}
        className="w-[calc(100vw-2rem)] sm:w-[400px] max-h-[80vh] overflow-y-auto overflow-x-hidden bg-slate-900 border-slate-700 text-white p-0"
        align="start"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Trading Systems</h3>
            <p className="text-xs text-gray-400">Pre-configured indicator presets for specific strategies</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-6 w-6 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-2 space-y-1">
          {/* Confluence Monitor */}
          <button
            type="button"
            onClick={onToggleFloatingMonitor}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-left transition-all hover:border-slate-500 hover:bg-slate-800 mb-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-300" />
                <span className="text-xs font-semibold text-blue-300">Multi System Confluence Monitor</span>
              </div>
              <span className={cn('text-xs font-semibold', confluenceColorClass)}>
                {confluenceSnapshot ? `${confluenceSnapshot.score > 0 ? '+' : ''}${confluenceSnapshot.score.toFixed(2)}` : 'N/A'}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Combined average status across all trading systems (read-only)
            </div>
          </button>

          {renderCategory('Trend Following', '📈', 'text-blue-400', trendSystems)}
          {renderCategory('Mean Reversion / Reversal', '🎯', 'text-purple-400', reversalSystems)}
          {renderCategory('Breakout & Momentum', '🚀', 'text-orange-400', breakoutSystems)}
          {renderCategory('Smart Money Concepts', '💎', 'text-emerald-400', smcSystems)}

          <div className="text-xs text-gray-500 px-3 pt-2 pb-1 border-t border-slate-700">
            💡 Tip: Activating a system will automatically enable and configure all required indicators
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
