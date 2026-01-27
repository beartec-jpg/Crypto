import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, TrendingUp, Minus, Square, Ruler, GitBranch } from 'lucide-react';

interface ChartFullscreenProps {
  symbol: string;
  timeframe: string;
  onTimeframeChange: (timeframe: string) => void;
  onClose: () => void;
  chartContainerRef: React.RefObject<HTMLDivElement>;
  activeTool: string | null;
  onToolSelect: (tool: string) => void;
}

/**
 * Fullscreen chart component
 * Features:
 * - Full viewport chart with all drawing tools active
 * - Trendline, Horizontal line, Rectangle, Fibonacci retracement, Trend Fibonacci, Channel
 * - All enabled overlays visible (EMA, VWAP, BOS, FVG, etc.)
 * - Magnet mode and auto-color available
 * - Close button to return to preview mode
 */
export function ChartFullscreen({
  symbol,
  timeframe,
  onTimeframeChange,
  onClose,
  chartContainerRef,
  activeTool,
  onToolSelect,
}: ChartFullscreenProps) {
  const tools = [
    { id: 'trendline', label: 'Trend', icon: <TrendingUp className="h-4 w-4" /> },
    { id: 'horizontal', label: 'Horiz', icon: <Minus className="h-4 w-4" /> },
    { id: 'rectangle', label: 'Rect', icon: <Square className="h-4 w-4" /> },
    { id: 'fib_retracement', label: 'Fib', icon: <Ruler className="h-4 w-4" /> },
    { id: 'trend_fib', label: 'TFib', icon: <TrendingUp className="h-4 w-4" /> },
    { id: 'channel', label: 'Channel', icon: <GitBranch className="h-4 w-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              CLOSE
            </Button>
            <div className="text-lg font-semibold">
              {symbol.replace('USDT', '/USDT')}
            </div>
          </div>
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
        </div>

        {/* Drawing tools toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-t">
          {tools.map((tool) => (
            <Button
              key={tool.id}
              variant={activeTool === tool.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => onToolSelect(tool.id)}
              className="gap-2"
            >
              {tool.icon}
              {tool.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={chartContainerRef}
          className="absolute inset-0"
        >
          {/* The actual chart will be rendered here by lightweight-charts */}
        </div>
      </div>

      {/* Oscillator tabs (minimized by default) */}
      <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Oscillators:</span>
          <Button variant="outline" size="sm" className="text-xs">+ RSI</Button>
          <Button variant="outline" size="sm" className="text-xs">+ MACD</Button>
          <Button variant="outline" size="sm" className="text-xs">+ Vol</Button>
          <Button variant="outline" size="sm" className="text-xs">+ CVD</Button>
          <Button variant="outline" size="sm" className="text-xs">+ OBV</Button>
          <Button variant="outline" size="sm" className="text-xs">+ MFI</Button>
          <span className="text-xs text-muted-foreground ml-auto">
            Click a tab to expand (only one at a time)
          </span>
        </div>
      </div>
    </div>
  );
}
