import { X, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatTickerDisplay } from '@/lib/chart/priceUtils';

interface FullscreenChartToolbarProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  timeframe: string;
  onTimeframeChange: (tf: string) => void;
  watchlistTickers: string[];
  onClose: () => void;
  onOpenAlerts?: () => void;
}

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'];

export function FullscreenChartToolbar({
  symbol,
  onSymbolChange,
  timeframe,
  onTimeframeChange,
  watchlistTickers,
  onClose,
  onOpenAlerts,
}: FullscreenChartToolbarProps) {
  return (
    <div className="bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onClose} className="gap-2">
          <X className="h-4 w-4" />
          Close
        </Button>

        {onOpenAlerts && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenAlerts}
            className="gap-2 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:border-blue-500"
          >
            <Bell className="h-4 w-4" />
            Alerts
          </Button>
        )}
      </div>

      <div className="flex-1 text-center">
        <span className="text-lg font-semibold text-white">{formatTickerDisplay(symbol)}</span>
      </div>

      <Select value={symbol} onValueChange={onSymbolChange}>
        <SelectTrigger className="w-40 bg-slate-800 text-white border-slate-600 hover:bg-slate-700 focus:ring-slate-500">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-600">
          {watchlistTickers.map((ticker) => (
            <SelectItem key={ticker} value={ticker} className="text-white hover:bg-slate-700 focus:bg-slate-700 cursor-pointer">
              {formatTickerDisplay(ticker)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={timeframe} onValueChange={onTimeframeChange}>
        <SelectTrigger className="w-24 bg-slate-800 text-white border-slate-600 hover:bg-slate-700 focus:ring-slate-500">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-600">
          {TIMEFRAMES.map((tf) => (
            <SelectItem key={tf} value={tf} className="text-white hover:bg-slate-700 focus:bg-slate-700 cursor-pointer">
              {tf}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
