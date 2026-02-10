import { useState, useCallback } from 'react';
import { TickerSearch } from '@/components/TickerSearch';
import { TickerTable } from '@/components/TickerTable';
import { useWatchlistState } from '@/hooks/useWatchlistState';

/**
 * Clean-page watchlist wrapper:
 * - Owns selected ticker and timeframe state
 * - Owns global watchlist bias settings (pivot + EMA lengths) for now (local only)
 * - Uses useWatchlistState for tickers and add/remove
 * - Keeps CryptoIndicatorsClean free of inline handlers / watchlist logic
 */
export function CleanWatchlist() {
  const watchlist = useWatchlistState();

  // Which row in the table is selected
  const [selectedSymbol, setSelectedSymbol] = useState('XRPUSDT');

  // Timeframe for watchlist bias calculations (drives TickerTable Select)
  const [tableTimeframe, setTableTimeframe] = useState<'1m' | '5m' | '15m' | '1h' | '4h' | '1d'>('1h');

  // NEW: global watchlist bias settings (local version for now)
  const [structurePivotLength, setStructurePivotLength] = useState<number>(5);
  const [emaLengths, setEmaLengths] = useState<number[]>([21, 50, 200]);

  // ----- Handlers (non-inline) -----

  const handleAddTicker = useCallback(
    (ticker: string) => {
      watchlist.handleAddTicker(ticker, setSelectedSymbol);
    },
    [watchlist]
  );

  const handleRemoveTicker = useCallback(
    (ticker: string) => {
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

  // TEMP simple setters for bias settings (we will add UI + persistence later)
  const setPivot = useCallback((pivot: number) => {
    setStructurePivotLength(pivot);
  }, []);

  const setMainEma = useCallback((length: number) => {
    setEmaLengths((prev) => [length, ...(prev.slice(1) || [])]);
  }, []);

  // ----- Render -----

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <TickerSearch
        onAddTicker={handleAddTicker}
        existingTickers={watchlist.watchlistTickers}
      />

      {/* TODO: next step – add a small UI to adjust pivot + EMA via setPivot/setMainEma */}

      {/* Watchlist table + timeframe selector (inside TickerTable) */}
      <TickerTable
        tickers={watchlist.watchlistTickers}
        onRemoveTicker={handleRemoveTicker}
        onSelectTicker={handleSelectTicker}
        selectedTicker={selectedSymbol}
        timeframe={tableTimeframe}
        onTimeframeChange={handleTimeframeChange}
        structurePivotLength={structurePivotLength}
        emaLengths={emaLengths}
      />
    </div>
  );
}
