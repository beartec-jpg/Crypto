import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');

  try {
    const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';

    const baseSymbol = symbol.endsWith('USDT')
      ? symbol.slice(0, -4)
      : symbol.endsWith('USD')
        ? symbol.slice(0, -3)
        : symbol;

    const productId = `${baseSymbol}-USD`;

    let coinbasePrice = 0;
    let binancePrice = 0;
    let binanceSource = 'binance-global';

    const coinbaseResponse = await fetch(`https://api.exchange.coinbase.com/products/${productId}/ticker`, { signal: AbortSignal.timeout(5000) });
    if (!coinbaseResponse.ok) {
      throw new Error(`Coinbase API error: ${coinbaseResponse.status}`);
    }
    const coinbaseData = await coinbaseResponse.json();
    coinbasePrice = parseFloat(coinbaseData.price || '0');

    const binanceGlobalResponse = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, { signal: AbortSignal.timeout(5000) });
    if (binanceGlobalResponse.ok) {
      const binanceGlobalData = await binanceGlobalResponse.json();
      binancePrice = parseFloat(binanceGlobalData.price || '0');
    } else {
      const binanceUsResponse = await fetch(`https://api.binance.us/api/v3/ticker/price?symbol=${symbol}`, { signal: AbortSignal.timeout(5000) });
      if (!binanceUsResponse.ok) {
        throw new Error(`Binance API error: global=${binanceGlobalResponse.status}, us=${binanceUsResponse.status}`);
      }
      const binanceUsData = await binanceUsResponse.json();
      binancePrice = parseFloat(binanceUsData.price || '0');
      binanceSource = 'binance-us';
    }

    if (!Number.isFinite(coinbasePrice) || coinbasePrice <= 0 || !Number.isFinite(binancePrice) || binancePrice <= 0) {
      throw new Error('Invalid price data for premium calculation');
    }

    const premiumPct = ((coinbasePrice - binancePrice) / binancePrice) * 100;

    return res.status(200).json({
      symbol,
      source: 'coinbase-vs-binance',
      timestamp: Date.now(),
      current: { value: premiumPct },
      coinbase: { product: productId, price: coinbasePrice },
      binance: { symbol, source: binanceSource, price: binancePrice },
    });
  } catch (error: any) {
    console.error('❌ Error fetching Coinbase Premium:', error);
    return res.status(500).json({
      error: 'Failed to fetch Coinbase Premium data',
      details: error.message,
    });
  }
}
