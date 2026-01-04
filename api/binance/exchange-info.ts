import type { VercelRequest, VercelResponse } from '@vercel/node';

let cachedSymbols: { value: string; label: string }[] | null = null;
let cacheTime: number = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const now = Date.now();
    
    if (cachedSymbols && (now - cacheTime) < CACHE_TTL) {
      return res.status(200).json(cachedSymbols);
    }

    console.log('📊 Fetching Binance exchange info...');
    
    // Try binance.us first (works from US-based Vercel servers), fall back to binance.com
    let response;
    try {
      response = await fetch('https://api.binance.us/api/v3/exchangeInfo', { 
        signal: AbortSignal.timeout(5000) 
      });
      if (!response.ok) throw new Error('binance.us failed');
    } catch {
      console.log('📊 Falling back to binance.com...');
      response = await fetch('https://api.binance.com/api/v3/exchangeInfo', { 
        signal: AbortSignal.timeout(10000) 
      });
    }
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const usdtPairs = data.symbols
      .filter((s: any) => 
        s.quoteAsset === 'USDT' && 
        s.status === 'TRADING' &&
        s.isSpotTradingAllowed
      )
      .map((s: any) => ({
        value: s.symbol,
        label: `${s.baseAsset}/USDT`
      }))
      .sort((a: any, b: any) => a.label.localeCompare(b.label));
    
    cachedSymbols = usdtPairs;
    cacheTime = now;
    
    console.log(`✅ Found ${usdtPairs.length} USDT trading pairs`);
    
    return res.status(200).json(usdtPairs);
  } catch (error: any) {
    console.error('Error fetching exchange info:', error);
    return res.status(500).json({ error: error.message });
  }
}
