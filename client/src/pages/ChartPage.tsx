import { useLocation } from 'wouter';
import { ChartFullscreenPage } from './ChartFullscreenPage';

export default function ChartPage() {
  const [, navigate] = useLocation();
  
  // Parse URL parameters
  const params = new URLSearchParams(window.location.search);
  const symbol = params.get('symbol') || 'XRPUSDT';
  const timeframe = params.get('timeframe') || '1h';
  
  // Get watchlist from localStorage or default
  let watchlistTickers: string[];
  try {
    watchlistTickers = JSON.parse(
      localStorage.getItem('watchlistTickers') || '["XRPUSDT", "BTCUSDT", "ETHUSDT"]'
    );
  } catch (error) {
    // Fall back to default if localStorage contains malformed JSON
    watchlistTickers = ['XRPUSDT', 'BTCUSDT', 'ETHUSDT'];
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
