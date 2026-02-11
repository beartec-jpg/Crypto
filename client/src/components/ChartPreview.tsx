import { useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Maximize2 } from 'lucide-react';
import { useSimpleChart } from '@/hooks/useSimpleChart';

interface ChartPreviewProps {
  symbol: string;
  timeframe: string;
  onTimeframeChange: (timeframe: string) => void;
  onExpand: () => void;
  chartContainerRef: React.RefObject<HTMLDivElement>;
}

/**
 * Chart preview component
 * - Smaller chart view below the table
 * - Shows all enabled overlays (EMA, VWAP, BOS, FVG, etc.)
 * - Entire chart area is clickable to expand to fullscreen
 * - Independent timeframe selector
 */
export function ChartPreview({
  symbol,
  timeframe,
  onTimeframeChange,
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
    <Card className="w-full">
      <CardContent className="p-4">
        {/* Header with timeframe selector */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">📊 CHART PREVIEW</h3>
            <span className="text-sm text-muted-foreground">
              {symbol.replace('USDT', '/USDT')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Select value={timeframe} onValueChange={onTimeframeChange}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1m">1m</SelectItem>
                <SelectItem value="5m">5m</SelectItem>
                <SelectItem value="15m">15m</SelectItem>
                <SelectItem value="1h">1H</SelectItem>
                <SelectItem value="4h">4H</SelectItem>
                <SelectItem value="1d">1D</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={onExpand}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
              title="Expand to fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Chart container - wrapper with relative positioning */}
        <div className="relative w-full h-[400px] border rounded-lg overflow-hidden hover:border-primary/50 transition-colors group">
          {/* Inner div for the chart */}
          <div ref={chartContainerRef} className="absolute inset-0">
            {/* The actual chart will be rendered here by lightweight-charts */}
          </div>
          
          {/* Clickable overlay - positioned above the chart */}
          <div
            onClick={onExpand}
            className="absolute inset-0 z-10 cursor-pointer"
          />
          
          {/* Hover overlay with expand hint */}
          <div className="absolute inset-0 flex items-center justify-center bg-background/95 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
            <div className="text-center space-y-2">
              <Maximize2 className="h-8 w-8 mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">Click to expand fullscreen</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-2">
          👆 Click anywhere on the chart to expand to fullscreen mode
        </p>
      </CardContent>
    </Card>
  );
}
