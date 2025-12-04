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
    
    const cvdHistory = multiExchange?.cvd?.map((item: any) => ({
      timestamp: (item.time || item.timestamp) * 1000,
      value: item.cvd || item.value || 0
    })) || [];
    
    const oiHistory = openInterest?.history?.map((item: any) => ({
      timestamp: item.timestamp,
      value: item.value || item.oi || 0
    })) || [];
    
    const frHistory = fundingRate?.history?.map((item: any) => ({
      timestamp: item.timestamp,
      value: item.value || item.rate || 0
    })) || [];
    
    res.json({
      cvd: { history: cvdHistory },
      openInterest: { 
        history: oiHistory,
        current: openInterest?.current || null,
        delta: oiHistory.length > 1 ? oiHistory[oiHistory.length - 1].value - oiHistory[oiHistory.length - 2].value : 0,
        trend: oiHistory.length > 1 ? (oiHistory[oiHistory.length - 1].value > oiHistory[oiHistory.length - 2].value ? 'rising' : 'falling') : 'neutral'
      },
      fundingRate: { 
        history: frHistory,
        current: fundingRate?.current || null,
        rate: frHistory.length > 0 ? frHistory[frHistory.length - 1].value : 0,
        bias: frHistory.length > 0 ? (frHistory[frHistory.length - 1].value > 0.01 ? 'bullish' : frHistory[frHistory.length - 1].value < -0.01 ? 'bearish' : 'neutral') : 'neutral'
      },
      longShortRatio: longShortRatio || { current: { ratio: 1.0 }, ratio: 1.0 },
      footprint: multiExchange?.footprint || [],
      orderflowTable: multiExchange?.orderflowTable || [],
      metadata: multiExchange?.metadata || { symbol: symbolStr, interval: intervalStr, exchange: 'binance' },
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
