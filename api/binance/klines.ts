import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { symbol, interval, limit, endTime } = req.query;
    
    if (!symbol || !interval) {
      return res.status(400).json({ error: 'symbol and interval are required' });
    }

    let url = `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit || 1000}`;
    if (endTime) {
      url += `&endTime=${endTime}`;
    }
    
    console.log('📊 Vercel: Fetching Binance data:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Binance API error:', errorText);
      return res.status(response.status).json({ error: `Binance API error: ${errorText}` });
    }
    
    const data = await response.json();
    console.log('✅ Binance data received, array length:', data.length);
    
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('Error fetching Binance data:', error);
    return res.status(500).json({ error: error.message });
  }
}
