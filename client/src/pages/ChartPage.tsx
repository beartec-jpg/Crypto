import { useLocation } from 'wouter';
import { ChartFullscreenPage } from './ChartFullscreenPage';

export default function ChartPage() {
  const [, navigate] = useLocation();
  
  // Parse URL parameters; fall back to last chart view so a refresh of /chart
  // without query params does not dump the user on a default ticker.
  const params = new URLSearchParams(window.location.search);
  let saved: { symbol?: string; timeframe?: string } = {};
  try {
    saved = JSON.parse(localStorage.getItem('chartLastView') || '{}') || {};
  } catch {
    saved = {};
  }
  const symbol = params.get('symbol') || saved.symbol || 'BTCUSDT';
  const timeframe = params.get('timeframe') || saved.timeframe || '1h';
  
  // Get watchlist from localStorage (empty for new users — no pre-seeded majors)
  let watchlistTickers: string[];
  try {
    watchlistTickers = JSON.parse(localStorage.getItem('watchlistTickers') || '[]');
    if (!Array.isArray(watchlistTickers)) watchlistTickers = [];
  } catch {
    watchlistTickers = [];
  }
  
  const handleClose = () => {
    navigate('/cryptoindicators'); // Go back to main page
  };
  
  return (
    <ChartFullscreenPage
      onClose={handleClose}
      initialSymbol={symbol}
      initialTimeframe={timeframe}
      watchlistTickers={watchlistTickers}
    />
  );
}
