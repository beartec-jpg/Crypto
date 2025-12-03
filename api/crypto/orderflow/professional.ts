import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';
    const interval = (req.query.interval as string) || '15m';
    
    const baseUrl = `https://${req.headers.host}`;
    
    const [cvdRes, oiRes, fundingRes, lsRatioRes] = await Promise.all([
      fetch(`${baseUrl}/api/crypto/multi-exchange-orderflow?symbol=${symbol}&interval=${interval}`).then(r => r.json()),
      fetch(`${baseUrl}/api/crypto/orderflow/open-interest?symbol=${symbol}&interval=${interval}`).then(r => r.json()),
      fetch(`${baseUrl}/api/crypto/orderflow/funding-rate?symbol=${symbol}`).then(r => r.json()),
      fetch(`${baseUrl}/api/crypto/orderflow/long-short-ratio?symbol=${symbol}&interval=${interval}`).then(r => r.json())
    ]);
    
    res.json({
      cvd: cvdRes.cvd || [],
      openInterest: oiRes,
      fundingRate: fundingRes,
      longShortRatio: lsRatioRes,
      symbol,
      interval,
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
