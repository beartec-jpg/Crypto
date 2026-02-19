import { cn } from '@/lib/utils';

interface IndicatorIconToolbarProps {
  onOpenOscillators: () => void;
  onOpenEmaSma: () => void;
  onOpenSmc: () => void;
  isVertical?: boolean;
  className?: string;
}

export function IndicatorIconToolbar({
  onOpenOscillators,
  onOpenEmaSma,
  onOpenSmc,
  isVertical = false,
  className,
}: IndicatorIconToolbarProps) {
  return (
    <div
      className={cn(
        "flex gap-2 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-2 shadow-xl",
        isVertical ? "flex-col" : "flex-row",
        className
      )}
    >
      {/* Oscillator Button */}
      <button
        onClick={onOpenOscillators}
        className="h-10 w-10 rounded-lg overflow-hidden bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 transition-all"
        title="Oscillators"
        aria-label="Oscillators"
      >
        <img
          src="/grok_image_1771510818185.jpg"
          alt="Oscillators"
          className="h-full w-full object-contain"
        />
      </button>

      {/* EMA Button */}
      <button
        onClick={onOpenEmaSma}
        className="h-10 w-10 rounded-lg overflow-hidden bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 transition-all"
        title="EMA / SMA"
        aria-label="EMA / SMA"
      >
        <img
          src="/grok_image_1771511033696.jpg"
          alt="EMA / SMA"
          className="h-full w-full object-contain"
        />
      </button>

      {/* SMC Button */}
      <button
        onClick={onOpenSmc}
        className="h-10 w-10 rounded-lg overflow-hidden bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 transition-all"
        title="SMC Controls"
        aria-label="SMC Controls"
      >
        <img
          src="/grok_image_1771510990333.jpg"
          alt="SMC"
          className="h-full w-full object-contain"
        />
      </button>
    </div>
  );
}

/** Preview component for minimized state - shows first icon */
export function IndicatorIconToolbarPreview() {
  return (
    <div className="h-10 w-10 rounded overflow-hidden opacity-60">
      <img
        src="/grok_image_1771510818185.jpg"
        alt="Indicators"
        className="h-full w-full object-contain"
      />
    </div>
  );
}
