import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { symbol, interval } = req.query;
    const symbolStr = (symbol as string)?.toUpperCase() || 'BTCUSDT';
    const intervalStr = (interval as string) || '15m';
    
    const baseUrl = `https://${req.headers.host}`;
    
    const safeFetch = async (url: string) => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`API call failed: ${url} - ${response.status}`);
          return null;
        }
        return await response.json();
      } catch (error) {
        console.warn(`API call error: ${url}`, error);
        return null;
      }
    };
    
    const [multiExchange, openInterest, fundingRate, longShortRatio] = await Promise.all([
      safeFetch(`${baseUrl}/api/crypto/multi-exchange-orderflow?symbol=${symbolStr}&interval=${intervalStr}`),
      safeFetch(`${baseUrl}/api/crypto/orderflow/open-interest?symbol=${symbolStr}&interval=${intervalStr}`),
      safeFetch(`${baseUrl}/api/crypto/orderflow/funding-rate?symbol=${symbolStr}`),
      safeFetch(`${baseUrl}/api/crypto/orderflow/long-short-ratio?symbol=${symbolStr}&interval=${intervalStr}`)
    ]);
    
    res.json({
      cvd: multiExchange ? { history: multiExchange.cvd || [] } : { history: [] },
      openInterest: openInterest || { history: [] },
      fundingRate: fundingRate || { history: [] },
      longShortRatio: longShortRatio || { current: { ratio: 1.0 } },
      symbol: symbolStr,
      interval: intervalStr,
      timestamp: Date.now()
    });

  } catch (error: any) {
    console.error('❌ Error fetching professional orderflow:', error);
    res.status(500).json({
      error: 'Failed to fetch professional orderflow data',
      details: error.message
    });
  }
}
