export const ALL_TICKERS = [
  { value: 'BTCUSDT', label: 'BTC/USDT' },
  { value: 'ETHUSDT', label: 'ETH/USDT' },
  { value: 'XRPUSDT', label: 'XRP/USDT' },
  { value: 'SOLUSDT', label: 'SOL/USDT' },
  { value: 'ADAUSDT', label: 'ADA/USDT' },
  { value: 'DOGEUSDT', label: 'DOGE/USDT' },
  { value: 'DOTUSDT', label: 'DOT/USDT' },
  { value: 'LINKUSDT', label: 'LINK/USDT' },
  { value: 'AVAXUSDT', label: 'AVAX/USDT' },
  { value: 'MATICUSDT', label: 'MATIC/USDT' },
  { value: 'LTCUSDT', label: 'LTC/USDT' },
  { value: 'BNBUSDT', label: 'BNB/USDT' },
  { value: 'ATOMUSDT', label: 'ATOM/USDT' },
  { value: 'NEARUSDT', label: 'NEAR/USDT' },
  { value: 'AAVEUSDT', label: 'AAVE/USDT' },
];

const TICKER_CLICKS_KEY = 'beartec_ticker_clicks';

export function getTickerClicks(): Record<string, number> {
  try {
    const stored = localStorage.getItem(TICKER_CLICKS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function incrementTickerClick(ticker: string): void {
  try {
    const clicks = getTickerClicks();
    clicks[ticker] = (clicks[ticker] || 0) + 1;
    localStorage.setItem(TICKER_CLICKS_KEY, JSON.stringify(clicks));
  } catch {
  }
}

export function getSortedTickers(): typeof ALL_TICKERS {
  const clicks = getTickerClicks();
  
  return [...ALL_TICKERS].sort((a, b) => {
    const clicksA = clicks[a.value] || 0;
    const clicksB = clicks[b.value] || 0;
    
    if (clicksA !== clicksB) {
      return clicksB - clicksA;
    }
    return a.label.localeCompare(b.label);
  });
}
