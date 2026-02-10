import { TickerSearch } from '../TickerSearch';
import { TickerTable } from '../TickerTable';

interface WatchlistPanelProps {
  tickers: string[];
  onAddTicker: (ticker: string) => void;
  onRemoveTicker: (ticker: string) => void;
  onSelectTicker: (ticker: string) => void;
  selectedTicker: string;
  timeframe: string;
  onTimeframeChange: (timeframe: string) => void;
}

export function WatchlistPanel({ 
  tickers, 
  onAddTicker, 
  onRemoveTicker,
  onSelectTicker,
  selectedTicker,
  timeframe,
  onTimeframeChange
}: WatchlistPanelProps) {
  return (
    <div className="space-y-4">
      <TickerSearch onAddTicker={onAddTicker} existingTickers={tickers} />
      <TickerTable 
        tickers={tickers}
        onRemoveTicker={onRemoveTicker}
        onSelectTicker={onSelectTicker}
        selectedTicker={selectedTicker}
        timeframe={timeframe}
        onTimeframeChange={onTimeframeChange}
      />
    </div>
  );
}
