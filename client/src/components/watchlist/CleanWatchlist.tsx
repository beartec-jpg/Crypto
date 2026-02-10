import { useState, useCallback } from 'react';
import { TickerSearch } from '@/components/TickerSearch';
import { TickerTable } from '@/components/TickerTable';
import { useWatchlistState } from '@/hooks/useWatchlistState';

/**
 * Clean-page watchlist wrapper:
 * - Owns selected ticker and timeframe state
 * - Uses useWatchlistState for tickers and add/remove
 * - Keeps CryptoIndicatorsClean free of inline handlers / watchlist logic
 */
export function CleanWatchlist() {
  const watchlist = useWatchlistState();

  // Which row in the table is selected
  const [selectedSymbol, setSelectedSymbol] = useState('XRPUSDT');

  // Timeframe for watchlist bias calculations (drives TickerTable Select)
  const [tableTimeframe, setTableTimeframe] = useState<'1m' | '5m' | '15m' | '1h' | '4h' | '1d'>('1h');

  // ----- Handlers (non-inline) -----

  const handleAddTicker = useCallback(
    (ticker: string) => {
      // useWatchlistState already handles persistence etc.
      watchlist.handleAddTicker(ticker, setSelectedSymbol);
    },
    [watchlist]
  );

  const handleRemoveTicker = useCallback(
    (ticker: string) => {
      // Keeps selectedSymbol in sync when removing
      watchlist.handleRemoveTicker(ticker, selectedSymbol, setSelectedSymbol);
    },
    [watchlist, selectedSymbol]
  );

  const handleSelectTicker = useCallback(
    (ticker: string) => {
      setSelectedSymbol(ticker);
    },
    []
  );

  const handleTimeframeChange = useCallback(
    (tf: string) => {
      const allowed = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
      if (!allowed.includes(tf as any)) return;
      setTableTimeframe(tf as (typeof allowed)[number]);
    },
    []
  );

  // ----- Render -----

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <TickerSearch
        onAddTicker={handleAddTicker}
        existingTickers={watchlist.watchlistTickers}
      />

      {/* Watchlist table + timeframe selector (inside TickerTable) */}
      <TickerTable
        tickers={watchlist.watchlistTickers}
        onRemoveTicker={handleRemoveTicker}
        onSelectTicker={handleSelectTicker}
        selectedTicker={selectedSymbol}
        timeframe={tableTimeframe}
        onTimeframeChange={handleTimeframeChange}
      />
    </div>
  );
}
