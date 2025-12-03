import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ 
        error: 'AI service not configured',
        available: false,
        alerts: []
      });
    }

    const { 
      symbol, interval, currentPrice, cvd, cvdTrend, poc, vah, val, 
      bullishOBCount, bearishOBCount, bullFVGCount, bearFVGCount,
      buyImbalancesCount, sellImbalancesCount, absorptionCount,
      hiddenDivergenceCount, liquidityGrabCount, recentBars,
      bullishOB, bearishOB, bullFVG, bearFVG,
      buyImbalances, sellImbalances, absorption,
      hiddenDivergences, liquidityGrabs,
      orderflowData,
      cci = 0, adx = 0, plusDI = 0, minusDI = 0
    } = req.body;

    if (!symbol || !currentPrice || !recentBars) {
      return res.status(400).json({ error: 'Missing required data' });
    }

    const last50Bars = recentBars.slice(-50);
    const priceChange = ((currentPrice - last50Bars[0].close) / last50Bars[0].close) * 100;
    const highs = last50Bars.map((b: any) => b.high);
    const lows = last50Bars.map((b: any) => b.low);
    const recentHigh = Math.max(...highs.slice(-10));
    const recentLow = Math.min(...lows.slice(-10));

    let orderflowAnalysis = '';
    if (orderflowData) {
      const oiDelta = orderflowData?.openInterest?.delta || 0;
      const oiTrend = orderflowData?.openInterest?.trend || 'neutral';
      const fundingValue = orderflowData?.fundingRate?.rate || 0;
      const fundingBias = orderflowData?.fundingRate?.bias || 'neutral';
      const lsRatio = orderflowData?.longShortRatio?.ratio || 1.0;

      orderflowAnalysis = `\n**PROFESSIONAL ORDERFLOW DATA:**
- Open Interest: ${oiTrend.toUpperCase()} (${oiDelta > 0 ? '+' : ''}${oiDelta.toFixed(2)}% delta)
- Funding Rate: ${fundingValue.toFixed(4)}% (${fundingBias.toUpperCase()})
- Long/Short Ratio: ${lsRatio.toFixed(2)}`;
    }
      
    const prompt = `You are a professional SMC trader analyzing ${symbol} on ${interval}.

**Market Data:**
- Price: ${currentPrice.toFixed(4)}, Change: ${priceChange.toFixed(2)}%
- CVD: ${cvd?.toFixed(0) || 0} (${cvdTrend || 'neutral'})
- POC: ${poc?.toFixed(4) || 0}, VAH: ${vah?.toFixed(4) || 0}, VAL: ${val?.toFixed(4) || 0}
- CCI: ${cci.toFixed(2)}, ADX: ${adx.toFixed(2)}, +DI/-DI: ${plusDI.toFixed(2)}/${minusDI.toFixed(2)}
${orderflowAnalysis}

**Order Flow Signals:**
- Bullish OBs: ${bullishOBCount || 0}, Bearish OBs: ${bearishOBCount || 0}
- Bullish FVGs: ${bullFVGCount || 0}, Bearish FVGs: ${bearFVGCount || 0}
- Buy Imbalances: ${buyImbalancesCount || 0}, Sell Imbalances: ${sellImbalancesCount || 0}
- Absorption: ${absorptionCount || 0}, Hidden Divergences: ${hiddenDivergenceCount || 0}
- Liquidity Grabs: ${liquidityGrabCount || 0}

Identify 1-3 high-probability trade setups. Return JSON:
{
  "alerts": [
    {
      "grade": "A/B/C/D/E",
      "direction": "LONG/SHORT",
      "entry": "price range",
      "stopLoss": "price",
      "targets": ["TP1", "TP2", "TP3"],
      "confluenceSignals": ["signal1", "signal2"],
      "confluenceCount": 5,
      "reasoning": "brief explanation"
    }
  ],
  "marketInsights": {
    "summary": "brief market summary",
    "keyLevels": ["level1", "level2"]
  }
}`;

    const openai = new OpenAI({
      baseURL: 'https://api.x.ai/v1',
      apiKey: apiKey,
    });

    const completion = await openai.chat.completions.create({
      model: 'grok-3-fast',
      messages: [
        { role: 'system', content: 'You are an expert SMC/Order Flow trader. Return ONLY valid JSON.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    const content = completion.choices[0]?.message?.content || '{"alerts":[],"marketInsights":{}}';
    
    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { alerts: [], marketInsights: {} };
    } catch {
      result = { alerts: [], marketInsights: { summary: content } };
    }

    res.json(result);

  } catch (error: any) {
    console.error('Order flow alerts error:', error);
    res.status(500).json({ 
      error: error.message,
      alerts: []
    });
  }
}
