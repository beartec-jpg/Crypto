import type { VercelRequest, VercelResponse } from '@vercel/node';

const INTERVAL_MS: Record<string, number> = {
  '1m': 60 * 1000,
  '3m': 3 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { symbol, timeframe } = req.query;
    
    if (!symbol || !timeframe) {
      return res.status(400).json({ error: 'Symbol and timeframe are required' });
    }

    const symbolStr = (symbol as string).toUpperCase().replace('-USD', 'USDT').replace('-', '');
    const intervalStr = timeframe as string;
    
    const binanceInterval = intervalStr === '3m' ? '3m' : 
                           intervalStr === '5m' ? '5m' :
                           intervalStr === '15m' ? '15m' :
                           intervalStr === '30m' ? '30m' :
                           intervalStr === '1h' ? '1h' :
                           intervalStr === '2h' ? '2h' :
                           intervalStr === '4h' ? '4h' :
                           intervalStr === '6h' ? '6h' :
                           intervalStr === '12h' ? '12h' :
                           intervalStr === '1d' ? '1d' :
                           intervalStr === '1w' ? '1w' : '1h';

    const candlesNeeded = 500;
    const intervalMs = INTERVAL_MS[binanceInterval] || 60 * 60 * 1000;
    const endTime = Date.now();
    const startTime = endTime - (candlesNeeded * intervalMs);

    console.log(`📊 Fetching extended history: ${symbolStr} ${binanceInterval}`);

    const allCandles: any[] = [];
    let currentEnd = endTime;

    while (currentEnd > startTime && allCandles.length < candlesNeeded) {
      const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbolStr}&interval=${binanceInterval}&limit=1000&endTime=${currentEnd}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Binance API error: ${response.status}`, errorText);
        throw new Error(`Binance API error: ${response.status}`);
      }
      
      const klines = await response.json();
      
      if (!klines.length) break;
      
      const candles = klines.map((k: any[]) => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));
      
      allCandles.unshift(...candles);
      
      currentEnd = klines[0][0] - 1;
      
      if (klines.length < 1000) break;
    }

    const uniqueCandles = allCandles
      .filter((candle, index, arr) => 
        index === arr.findIndex(c => c.time === candle.time)
      )
      .sort((a, b) => a.time - b.time)
      .slice(-candlesNeeded);

    res.json({
      symbol: symbolStr,
      timeframe: intervalStr,
      candleCount: uniqueCandles.length,
      startTime: uniqueCandles.length > 0 ? uniqueCandles[0].time : null,
      endTime: uniqueCandles.length > 0 ? uniqueCandles[uniqueCandles.length - 1].time : null,
      candles: uniqueCandles,
    });

  } catch (error: any) {
    console.error('Error fetching extended history:', error);
    res.status(500).json({ error: error.message });
  }
}
