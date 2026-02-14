import { Maximize2 } from 'lucide-react';
import { useSimpleChart } from '@/hooks/useSimpleChart';

interface ChartPreviewProps {
  symbol: string;
  timeframe: string;
  onExpand: () => void;
  chartContainerRef: React.RefObject<HTMLDivElement>;
}

/**
 * Chart preview component
 * - Clean, borderless chart view with watchlist timeframe
 * - Horizontal scroll-only navigation (zoom disabled)
 * - Small expand button in top-right corner
 * - No UI clutter - just the chart
 */
export function ChartPreview({
  symbol,
  timeframe,
  onExpand,
  chartContainerRef,
}: ChartPreviewProps) {
  // Use the simple chart hook for candlestick visualization
  useSimpleChart({
    containerRef: chartContainerRef,
    symbol,
    timeframe,
  });

  return (
    <div className="relative w-full h-[500px]">
      {/* Chart canvas - takes full space */}
      <div ref={chartContainerRef} className="absolute inset-0" />
      
      {/* Floating expand button - small, discreet, top-right corner */}
      <button
        onClick={onExpand}
        className="absolute top-2 right-2 z-10 p-2 rounded-md bg-slate-800/80 hover:bg-slate-700/90 text-slate-300 hover:text-white transition-all shadow-lg"
        title="Expand to fullscreen"
        aria-label="Expand chart to fullscreen"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
    </div>
  );
}
