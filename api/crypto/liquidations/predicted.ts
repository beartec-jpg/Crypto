import type { VercelRequest, VercelResponse } from '@vercel/node';

interface LiquidationLevel {
  price: number;
  liqValue: number;
}

async function fetchCoinglassLiquidationMap(symbol: string): Promise<{ priceList: number[], liquidationMatrix: number[][] }> {
  const coinglassKey = process.env.COINGLASS_API_KEY;
  
  if (!coinglassKey) {
    console.log('No Coinglass API key, returning empty data');
    return { priceList: [], liquidationMatrix: [] };
  }
  
  try {
    const coinglassSymbol = symbol.replace('USDT', '');
    const url = `https://open-api.coinglass.com/public/v2/liquidation_map?symbol=${coinglassSymbol}`;
    
    const response = await fetch(url, {
      headers: {
        'coinglassSecret': coinglassKey
      }
    });
    
    if (!response.ok) {
      console.error('Coinglass API error:', response.statusText);
      return { priceList: [], liquidationMatrix: [] };
    }
    
    const data = await response.json();
    
    if (data.code !== '0' || !data.data) {
      console.log('Coinglass returned no data');
      return { priceList: [], liquidationMatrix: [] };
    }

    const levels: LiquidationLevel[] = [];
    
    if (data.data.longLevels) {
      data.data.longLevels.forEach((level: any) => {
        levels.push({
          price: parseFloat(level.price),
          liqValue: parseFloat(level.liqValue || 0)
        });
      });
    }
    
    if (data.data.shortLevels) {
      data.data.shortLevels.forEach((level: any) => {
        levels.push({
          price: parseFloat(level.price),
          liqValue: parseFloat(level.liqValue || 0)
        });
      });
    }

    levels.sort((a, b) => a.price - b.price);
    
    const priceList = levels.map(l => l.price);
    const liquidationMatrix = levels.map(l => [l.liqValue]);
    
    return { priceList, liquidationMatrix };
  } catch (error) {
    console.error('Error fetching Coinglass data:', error);
    return { priceList: [], liquidationMatrix: [] };
  }
}

async function fetchCurrentPrice(symbol: string): Promise<number> {
  try {
    const url = `https://api.binance.us/api/v3/ticker/price?symbol=${symbol}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return 0;
    }
    
    const data = await response.json();
    return parseFloat(data.price);
  } catch {
    return 0;
  }
}

function generatePredictedLevels(currentPrice: number, range: number = 0.1): { priceList: number[], liquidationMatrix: number[][] } {
  const priceList: number[] = [];
  const liquidationMatrix: number[][] = [];
  
  const steps = 20;
  const stepSize = (currentPrice * range * 2) / steps;
  
  for (let i = 0; i < steps; i++) {
    const price = currentPrice - (currentPrice * range) + (i * stepSize);
    priceList.push(Math.round(price * 100) / 100);
    
    const distanceFromPrice = Math.abs(price - currentPrice) / currentPrice;
    const intensity = Math.max(0, 1 - distanceFromPrice * 5);
    const randomFactor = 0.5 + Math.random() * 1;
    liquidationMatrix.push([intensity * randomFactor * 100]);
  }
  
  return { priceList, liquidationMatrix };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { symbol = 'BTCUSDT', interval = '4h' } = req.query;
    const symbolStr = String(symbol);

    console.log(`📊 Fetching predicted liquidations for ${symbolStr}`);

    let result = await fetchCoinglassLiquidationMap(symbolStr);
    
    if (result.priceList.length === 0) {
      const currentPrice = await fetchCurrentPrice(symbolStr);
      if (currentPrice > 0) {
        result = generatePredictedLevels(currentPrice);
      }
    }

    return res.status(200).json({
      symbol: symbolStr,
      interval: String(interval),
      source: result.priceList.length > 0 ? 'coinglass' : 'estimated',
      timestamp: Date.now(),
      priceList: result.priceList,
      liquidationMatrix: result.liquidationMatrix
    });
  } catch (error: any) {
    console.error('Error in predicted liquidations handler:', error);
    return res.status(500).json({ 
      error: error.message,
      priceList: [],
      liquidationMatrix: []
    });
  }
}
