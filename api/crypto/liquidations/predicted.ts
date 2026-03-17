import type { VercelRequest, VercelResponse } from '@vercel/node';

async function fetchCoinalyzeLiquidations(symbol: string): Promise<{ priceList: number[], liquidationMatrix: number[][], source: string }> {
  const coinalyzeKey = process.env.COINALYZE_API_KEY;
  
  if (!coinalyzeKey) {
    console.log('No Coinalyze API key configured');
    return { priceList: [], liquidationMatrix: [], source: 'unavailable' };
  }
  
  try {
    const baseSymbol = symbol.replace('USDT', '').toUpperCase();
    const url = `https://api.coinalyze.net/v1/liquidation-map?symbols=${baseSymbol}_USDT.A&api_key=${coinalyzeKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Coinalyze API error:', response.status, response.statusText);
      return { priceList: [], liquidationMatrix: [], source: 'api_error' };
    }
    
    const data = await response.json();
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      return { priceList: [], liquidationMatrix: [], source: 'no_data' };
    }

    const symbolData = data[0];
    if (!symbolData.levels || !Array.isArray(symbolData.levels)) {
      return { priceList: [], liquidationMatrix: [], source: 'no_levels' };
    }

    const priceList = symbolData.levels.map((l: any) => parseFloat(l.price));
    const liquidationMatrix = symbolData.levels.map((l: any) => [parseFloat(l.liquidation_value || 0)]);
    
    return { priceList, liquidationMatrix, source: 'coinalyze' };
  } catch (error) {
    console.error('Error fetching Coinalyze data:', error);
    return { priceList: [], liquidationMatrix: [], source: 'fetch_error' };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { symbol = 'BTCUSDT', interval = '4h' } = req.query;
    const symbolStr = String(symbol);

    console.log(`Fetching predicted liquidations for ${symbolStr}`);

    const result = await fetchCoinalyzeLiquidations(symbolStr);

    return res.status(200).json({
      symbol: symbolStr,
      interval: String(interval),
      source: result.source,
      timestamp: Date.now(),
      priceList: result.priceList,
      liquidationMatrix: result.liquidationMatrix,
      available: result.priceList.length > 0
    });
  } catch (error: any) {
    console.error('Error in predicted liquidations handler:', error);
    return res.status(200).json({ 
      symbol: String(req.query.symbol || 'BTCUSDT'),
      interval: String(req.query.interval || '4h'),
      source: 'error',
      timestamp: Date.now(),
      priceList: [],
      liquidationMatrix: [],
      available: false,
      error: error.message
    });
  }
}
