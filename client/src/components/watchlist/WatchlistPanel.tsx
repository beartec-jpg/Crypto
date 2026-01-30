import { TickerSearch } from '../TickerSearch';
import { TickerTable } from '../TickerTable';

interface WatchlistPanelProps {
  tickers: string[];
  onAddTicker: (ticker: string) => void;
  onRemoveTicker: (ticker: string) => void;
  timeframe: string;
}

export function WatchlistPanel({ 
  tickers, 
  onAddTicker, 
  onRemoveTicker, 
  timeframe 
}: WatchlistPanelProps) {
  return (
    <div className="space-y-4">
      <TickerSearch onAddTicker={onAddTicker} existingTickers={tickers} />
      <TickerTable 
        tickers={tickers}
        onRemoveTicker={onRemoveTicker}
        timeframe={timeframe}
      />
    </div>
  );
}
