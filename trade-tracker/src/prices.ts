export interface PriceData {
  symbol: string;
  price: number;
}

/** Optional in-memory overrides for e2e / tests */
const overrides = new Map<string, number>();

export function setPriceOverride(symbol: string, price: number | null): void {
  const key = symbol.toUpperCase();
  if (price == null) overrides.delete(key);
  else overrides.set(key, price);
}

export function clearPriceOverrides(): void {
  overrides.clear();
}

export async function fetchPrices(symbols: string[]): Promise<PriceData[]> {
  const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  const out: PriceData[] = [];

  for (const symbol of unique) {
    if (overrides.has(symbol)) {
      out.push({ symbol, price: overrides.get(symbol)! });
    }
  }
  const missing = unique.filter((s) => !overrides.has(s));
  if (!missing.length) return out;

  const endpoints = [
    'https://api.binance.com/api/v3/ticker/price',
    'https://api.binance.us/api/v3/ticker/price',
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const all = (await res.json()) as Array<{ symbol: string; price: string }>;
      for (const symbol of missing) {
        if (out.find((p) => p.symbol === symbol)) continue;
        const row = all.find((p) => p.symbol === symbol);
        if (row?.price) out.push({ symbol, price: parseFloat(row.price) });
      }
      if (out.length >= unique.length) return out;
    } catch (err: any) {
      console.warn(`[prices] ${url} failed:`, err?.message || err);
    }
  }

  return out;
}
