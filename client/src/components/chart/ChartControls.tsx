interface ChartControlsProps {
  symbol: string;
  interval: string;
  onSymbolChange: (symbol: string) => void;
  onIntervalChange: (interval: string) => void;
  watchlistTickers: string[];
  isFullscreen?: boolean;
}

export function ChartControls({
  symbol,
  interval,
  onSymbolChange,
  onIntervalChange,
  watchlistTickers,
  isFullscreen = false
}: ChartControlsProps) {
  if (!isFullscreen) {
    return null;
  }

  return (
    <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
      {/* Ticker Dropdown */}
      <select
        value={symbol}
        onChange={(e) => {
          const newSymbol = e.target.value;
          if (newSymbol && newSymbol !== symbol) {
            onSymbolChange(newSymbol);
          }
        }}
        className="px-3 py-2 bg-slate-800/90 text-white rounded-lg border border-slate-600 hover:bg-slate-700 transition-all text-sm font-medium"
      >
        {watchlistTickers.map(ticker => (
          <option key={ticker} value={ticker}>
            {ticker.replace('USDT', '/USDT')}
          </option>
        ))}
      </select>
      
      {/* Timeframe Dropdown */}
      <select
        value={interval}
        onChange={(e) => onIntervalChange(e.target.value)}
        className="px-3 py-2 bg-slate-800/90 text-white rounded-lg border border-slate-600 hover:bg-slate-700 transition-all text-sm font-medium"
      >
        <option value="1m">1m</option>
        <option value="3m">3m</option>
        <option value="5m">5m</option>
        <option value="15m">15m</option>
        <option value="30m">30m</option>
        <option value="1h">1h</option>
        <option value="2h">2h</option>
        <option value="4h">4h</option>
        <option value="6h">6h</option>
        <option value="8h">8h</option>
        <option value="12h">12h</option>
        <option value="1d">1D</option>
        <option value="3d">3D</option>
        <option value="1w">1W</option>
        <option value="1M">1M</option>
      </select>
    </div>
  );
}
