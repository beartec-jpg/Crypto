import { useState, useCallback } from 'react';
import { TickerSearch } from '@/components/TickerSearch';
import { TickerTable } from '@/components/TickerTable';
import { useWatchlistState } from '@/hooks/useWatchlistState';
import { useWatchlistBiasSettings } from '@/hooks/useWatchlistBiasSettings';
import { WatchlistSettingsPanel } from '@/components/watchlist/WatchlistSettingsPanel';

/**
 * Clean-page watchlist wrapper:
 * - Owns selected ticker and timeframe state
 * - Uses useWatchlistBiasSettings for global watchlist bias settings (pivot + EMA lengths) with persistence
 * - Uses useWatchlistState for tickers and add/remove
 * - Keeps CryptoIndicatorsClean free of inline handlers / watchlist logic
 */
export function CleanWatchlist() {
  const watchlist = useWatchlistState();
  const biasSettings = useWatchlistBiasSettings();

  // Which row in the table is selected
  const [selectedSymbol, setSelectedSymbol] = useState('XRPUSDT');

  // Timeframe for watchlist bias calculations (drives TickerTable Select)
  const [tableTimeframe, setTableTimeframe] = useState<'1m' | '5m' | '15m' | '1h' | '4h' | '1d'>('1h');

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

  const handleChangeStructurePivot = useCallback(
    (length: number) => {
      biasSettings.updateSettings({ structurePivotLength: length });
    },
    [biasSettings]
  );

  const handleChangeEmaLength = useCallback(
    (index: number, length: number) => {
      const newEmaLengths = [...biasSettings.settings.emaLengths];
      newEmaLengths[index] = length;
      biasSettings.updateSettings({ emaLengths: newEmaLengths });
    },
    [biasSettings]
  );

  // ----- Render -----

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <TickerSearch
        onAddTicker={handleAddTicker}
        existingTickers={watchlist.watchlistTickers}
      />

      {/* Settings panel for bias configuration */}
      <WatchlistSettingsPanel
        structurePivotLength={biasSettings.settings.structurePivotLength}
        emaLengths={biasSettings.settings.emaLengths}
        onChangeStructurePivot={handleChangeStructurePivot}
        onChangeEmaLength={handleChangeEmaLength}
      />

      {/* Watchlist table + timeframe selector (inside TickerTable) */}
      <TickerTable
        tickers={watchlist.watchlistTickers}
        onRemoveTicker={handleRemoveTicker}
        onSelectTicker={handleSelectTicker}
        selectedTicker={selectedSymbol}
        timeframe={tableTimeframe}
        onTimeframeChange={handleTimeframeChange}
        structurePivotLength={biasSettings.settings.structurePivotLength}
        emaLengths={biasSettings.settings.emaLengths}
      />
    </div>
  );
}
