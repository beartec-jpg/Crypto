import { useState, useCallback, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { TickerSearch } from '@/components/TickerSearch';
import { TickerTable } from '@/components/TickerTable';
import { ChartPreview } from '@/components/ChartPreview';
import { useWatchlistState } from '@/hooks/useWatchlistState';
import { useWatchlistBiasSettings } from '@/hooks/useWatchlistBiasSettings';
import { WatchlistSettingsPanel } from '@/components/watchlist/WatchlistSettingsPanel';

/**
 * Clean-page watchlist wrapper:
 * - Owns selected ticker and timeframe state
 * - Uses useWatchlistBiasSettings for global watchlist bias settings (pivot + EMA lengths) with persistence
 * - Uses useWatchlistState for tickers and add/remove
 * - Shows bias settings in a modal triggered from TickerTable header
 * - Keeps CryptoIndicatorsClean free of inline handlers / watchlist logic
 */
export function CleanWatchlist() {
  const watchlist = useWatchlistState();
  const biasSettings = useWatchlistBiasSettings();

  // Which row in the table is selected
  const [selectedSymbol, setSelectedSymbol] = useState('XRPUSDT');

  // Timeframe for watchlist bias calculations (drives TickerTable Select)
  const [tableTimeframe, setTableTimeframe] = useState<'1m' | '5m' | '15m' | '1h' | '4h' | '1d'>('1h');

  // Modal state for settings
  const [showSettings, setShowSettings] = useState(false);

  // Chart state
  const [chartTimeframe, setChartTimeframe] = useState<'1m' | '5m' | '15m' | '1h' | '4h' | '1d'>('1h');
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Sync chart timeframe with table timeframe
  useEffect(() => {
    setChartTimeframe(tableTimeframe);
  }, [tableTimeframe]);

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
    [biasSettings.updateSettings]
  );

  const handleChangeEmaLength = useCallback(
    (index: number, length: number) => {
      const newEmaLengths = [...biasSettings.settings.emaLengths];
      newEmaLengths[index] = length;
      biasSettings.updateSettings({ emaLengths: newEmaLengths });
    },
    [biasSettings.updateSettings, biasSettings.settings.emaLengths]
  );

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  const handleChartTimeframeChange = useCallback(
    (tf: string) => {
      const allowed = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
      if (!allowed.includes(tf as any)) return;
      setChartTimeframe(tf as (typeof allowed)[number]);
    },
    []
  );

  const handleExpandChart = useCallback(() => {
    console.log('Expand chart to fullscreen - to be implemented');
  }, []);

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
        structurePivotLength={biasSettings.settings.structurePivotLength}
        emaLengths={biasSettings.settings.emaLengths}
        onOpenSettings={handleOpenSettings}
      />

      {/* Chart Preview - only show when ticker selected and tickers exist */}
      {watchlist.watchlistTickers.length > 0 && selectedSymbol && (
        <div className="mt-4">
          <ChartPreview
            symbol={selectedSymbol}
            timeframe={chartTimeframe}
            onTimeframeChange={handleChartTimeframeChange}
            onExpand={handleExpandChart}
            chartContainerRef={chartContainerRef}
          />
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div 
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={handleCloseSettings}
        >
          <div 
            className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-w-sm w-full p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={handleCloseSettings}
              className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors"
              aria-label="Close settings"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Title */}
            <h3 className="text-lg font-semibold text-white mb-2">Bias Settings</h3>
            <p className="text-xs text-slate-400 mb-4">
              Configure EMA lengths and structure pivot for bias calculations. Settings are saved automatically.
            </p>

            {/* Settings panel */}
            <WatchlistSettingsPanel
              structurePivotLength={biasSettings.settings.structurePivotLength}
              emaLengths={biasSettings.settings.emaLengths}
              onChangeStructurePivot={handleChangeStructurePivot}
              onChangeEmaLength={handleChangeEmaLength}
            />
          </div>
        </div>
      )}
    </div>
  );
}
