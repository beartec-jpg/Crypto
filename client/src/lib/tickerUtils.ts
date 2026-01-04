export interface Ticker {
  value: string;
  label: string;
}

export const DEFAULT_TICKERS: Ticker[] = [
  { value: 'BTCUSDT', label: 'BTC/USDT' },
  { value: 'ETHUSDT', label: 'ETH/USDT' },
  { value: 'XRPUSDT', label: 'XRP/USDT' },
  { value: 'SOLUSDT', label: 'SOL/USDT' },
  { value: 'ADAUSDT', label: 'ADA/USDT' },
];

const FAVORITES_KEY = 'beartec_favorite_tickers';
const TICKER_CLICKS_KEY = 'beartec_ticker_clicks';

export function getFavorites(): Ticker[] {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    if (!stored) {
      return DEFAULT_TICKERS;
    }
    const favorites = JSON.parse(stored);
    return favorites.length > 0 ? favorites : DEFAULT_TICKERS;
  } catch {
    return DEFAULT_TICKERS;
  }
}

export function addFavorite(ticker: Ticker): Ticker[] {
  try {
    const favorites = getFavorites();
    if (!favorites.some(f => f.value === ticker.value)) {
      const updated = [...favorites, ticker].sort((a, b) => a.label.localeCompare(b.label));
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
      return updated;
    }
    return favorites;
  } catch {
    return getFavorites();
  }
}

export function removeFavorite(tickerValue: string): Ticker[] {
  try {
    const favorites = getFavorites();
    const updated = favorites.filter(f => f.value !== tickerValue);
    const result = updated.length > 0 ? updated : DEFAULT_TICKERS;
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(result));
    return result;
  } catch {
    return getFavorites();
  }
}

export function isFavorite(tickerValue: string): boolean {
  const favorites = getFavorites();
  return favorites.some(f => f.value === tickerValue);
}

export function toggleFavorite(ticker: Ticker): { favorites: Ticker[]; isFavorite: boolean } {
  if (isFavorite(ticker.value)) {
    return { favorites: removeFavorite(ticker.value), isFavorite: false };
  } else {
    return { favorites: addFavorite(ticker), isFavorite: true };
  }
}

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

export function getSortedTickers(): Ticker[] {
  const favorites = getFavorites();
  const clicks = getTickerClicks();
  
  return [...favorites].sort((a, b) => {
    const clicksA = clicks[a.value] || 0;
    const clicksB = clicks[b.value] || 0;
    
    if (clicksA !== clicksB) {
      return clicksB - clicksA;
    }
    return a.label.localeCompare(b.label);
  });
}

export const ALL_TICKERS = DEFAULT_TICKERS;
