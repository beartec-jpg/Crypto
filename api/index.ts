import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const path = req.url?.split('?')[0] || '';
  
  if (path === '/api/health' || path === '/api') {
    return res.status(200).json({ 
      status: 'ok', 
      environment: 'vercel',
      message: 'Vercel serverless API is running',
      endpoints: [
        '/api/crypto/data',
        '/api/crypto/market-structure',
        '/api/orderflow',
        '/api/binance/klines'
      ]
    });
  }

  return res.status(404).json({ 
    error: 'Not found',
    message: `Endpoint ${path} not found. Use dedicated endpoints for crypto analytics.`,
    availableEndpoints: [
      '/api/crypto/data - Technical indicators and price data',
      '/api/crypto/market-structure - FVG, swing points, BOS/ChoCh',
      '/api/orderflow - CVD, VWAP, volume profile',
      '/api/binance/klines - Raw Binance kline data'
    ]
  });
}
