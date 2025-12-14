import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('📥 Order flow alerts API called');

  try {
    const apiKey = process.env.XAI_API_KEY;
    console.log('🔑 XAI API key configured:', !!apiKey);
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
      orderflowData, liquidationData,
      cci = 0, adx = 0, plusDI = 0, minusDI = 0,
      rsi = 50, macd = 0, macdSignal = 0, macdHistogram = 0,
      obv = 0, obvTrend = 'neutral', mfi = 50
    } = req.body;

    if (!symbol || !currentPrice || !recentBars) {
      return res.status(400).json({ error: 'Missing required data' });
    }

    const last50Bars = recentBars.slice(-50);
    const priceChange = ((currentPrice - last50Bars[0].close) / last50Bars[0].close) * 100;

    // Build comprehensive orderflow analysis section
    let orderflowAnalysis = '';
    if (orderflowData) {
      const oiDelta = orderflowData?.openInterest?.delta || 0;
      const oiTrend = orderflowData?.openInterest?.trend || 'neutral';
      const oiCurrent = orderflowData?.openInterest?.current || 0;
      const fundingValue = orderflowData?.fundingRate?.rate || 0;
      const fundingBias = orderflowData?.fundingRate?.bias || 'neutral';
      const lsRatio = orderflowData?.longShortRatio?.ratio || 1.0;

      orderflowAnalysis = `
**PROFESSIONAL ORDERFLOW DATA:**
- Open Interest: ${oiCurrent > 0 ? oiCurrent.toLocaleString() : 'N/A'} (${oiTrend.toUpperCase()}, ${oiDelta > 0 ? '+' : ''}${oiDelta.toFixed(2)}% change)
- Funding Rate: ${fundingValue.toFixed(4)}% (${fundingBias.toUpperCase()} bias)
- Long/Short Ratio: ${lsRatio.toFixed(2)} (${lsRatio > 1.2 ? 'LONGS DOMINANT' : lsRatio < 0.8 ? 'SHORTS DOMINANT' : 'BALANCED'})`;
    }

    // Build liquidation analysis section
    let liquidationAnalysis = '';
    if (liquidationData && liquidationData.topClusters && liquidationData.topClusters.length > 0) {
      const clusters = liquidationData.topClusters;
      const clusterList = clusters.map((c: any, i: number) => 
        `  ${i + 1}. $${c.price.toFixed(4)} (vol: ${c.volume.toFixed(0)})`
      ).join('\n');
      
      liquidationAnalysis = `
**LIQUIDATION HEATMAP:**
- Price position: ${liquidationData.currentPricePosition === 'upper_half' ? 'UPPER HALF' : 'LOWER HALF'} of range
- Highest liquidation cluster: $${liquidationData.highestCluster?.price.toFixed(4) || 'N/A'}
- Top liquidation levels:
${clusterList}
- INTERPRETATION: Price often moves toward liquidity clusters to trigger stops before reversing`;
    }

    // Interpret RSI
    const rsiInterpretation = rsi > 70 ? 'OVERBOUGHT' : rsi < 30 ? 'OVERSOLD' : 'NEUTRAL';
    
    // Interpret MACD
    const macdInterpretation = macdHistogram > 0 && macd > macdSignal ? 'BULLISH MOMENTUM' : 
                               macdHistogram < 0 && macd < macdSignal ? 'BEARISH MOMENTUM' : 'MIXED';
    
    // Interpret MFI
    const mfiInterpretation = mfi > 80 ? 'OVERBOUGHT (money flowing out)' : 
                              mfi < 20 ? 'OVERSOLD (money flowing in)' : 'NEUTRAL';
    
    // Interpret ADX
    const adxInterpretation = adx > 40 ? 'STRONG TREND' : adx > 25 ? 'TRENDING' : 'WEAK/RANGING';
    const diInterpretation = plusDI > minusDI ? 'BULLISH' : 'BEARISH';
      
    const prompt = `You are a professional SMC/ICT trader with expertise in order flow analysis. Analyze ${symbol} on the ${interval} timeframe using ALL the data provided below.

**PRICE ACTION:**
- Current Price: $${currentPrice.toFixed(4)}
- Recent Change: ${priceChange.toFixed(2)}%
- Volume Profile POC: $${poc?.toFixed(4) || 'N/A'}
- Value Area High (VAH): $${vah?.toFixed(4) || 'N/A'}
- Value Area Low (VAL): $${val?.toFixed(4) || 'N/A'}

**CUMULATIVE VOLUME DELTA (CVD):**
- Current CVD: ${cvd?.toFixed(0) || 0}
- CVD Trend: ${cvdTrend?.toUpperCase() || 'NEUTRAL'}
- OBV Trend: ${obvTrend.toUpperCase()}
- INTERPRETATION: ${cvdTrend === 'rising' ? 'Buying pressure increasing' : 'Selling pressure increasing'}

**TECHNICAL OSCILLATORS:**
- RSI(14): ${rsi.toFixed(2)} - ${rsiInterpretation}
- MACD: ${macd.toFixed(4)} / Signal: ${macdSignal.toFixed(4)} / Histogram: ${macdHistogram.toFixed(4)} - ${macdInterpretation}
- MFI(14): ${mfi.toFixed(2)} - ${mfiInterpretation}
- CCI(20): ${cci.toFixed(2)} - ${cci > 100 ? 'OVERBOUGHT' : cci < -100 ? 'OVERSOLD' : 'NEUTRAL'}
- ADX(14): ${adx.toFixed(2)} - ${adxInterpretation}
- +DI/-DI: ${plusDI.toFixed(2)}/${minusDI.toFixed(2)} - ${diInterpretation} direction
${orderflowAnalysis}
${liquidationAnalysis}

**SMC/ICT ORDER FLOW SIGNALS:**
- Bullish Order Blocks: ${bullishOBCount || 0}
- Bearish Order Blocks: ${bearishOBCount || 0}
- Bullish Fair Value Gaps: ${bullFVGCount || 0}
- Bearish Fair Value Gaps: ${bearFVGCount || 0}
- Buy Imbalances: ${buyImbalancesCount || 0}
- Sell Imbalances: ${sellImbalancesCount || 0}
- Absorption Events: ${absorptionCount || 0}
- Hidden Divergences: ${hiddenDivergenceCount || 0}
- Liquidity Grabs: ${liquidityGrabCount || 0}

**ANALYSIS REQUIREMENTS:**
1. Evaluate the OVERALL market structure and bias based on ALL indicators
2. Look for CONFLUENCE between multiple signals (OBs + FVGs + oscillators + orderflow)
3. Consider liquidation clusters as potential reversal zones
4. Weight more heavily: RSI extremes, MACD crosses, CVD divergences, and absorption events
5. Only suggest trades with 3+ confluence factors
6. If no high-probability setup exists, say so clearly

Return ONLY valid JSON in this exact format:
{
  "alerts": [
    {
      "grade": "A+/A/B/C/D/E",
      "direction": "LONG/SHORT",
      "entry": "exact price or range",
      "stopLoss": "exact price",
      "targets": ["TP1 price", "TP2 price", "TP3 price"],
      "confluenceSignals": ["signal1", "signal2", "signal3"],
      "confluenceCount": 5,
      "reasoning": "detailed explanation referencing specific indicator values"
    }
  ],
  "marketInsights": {
    "summary": "Comprehensive market analysis covering trend, momentum, and key levels. Reference specific indicator readings.",
    "bias": "BULLISH/BEARISH/NEUTRAL",
    "keyLevels": ["important price level 1", "important price level 2"]
  }
}`;

    const openai = new OpenAI({
      baseURL: 'https://api.x.ai/v1',
      apiKey: apiKey,
    });

    console.log('🤖 Calling xAI Grok for comprehensive order flow analysis...');
    const startTime = Date.now();

    const completion = await openai.chat.completions.create({
      model: 'grok-3-fast',
      messages: [
        { role: 'system', content: 'You are an expert SMC/ICT trader with deep knowledge of order flow, volume analysis, and technical indicators. Provide professional-grade analysis. Return ONLY valid JSON.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 3000,
      temperature: 0.3
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Grok response received in ${duration}ms`);

    const content = completion.choices[0]?.message?.content || '';
    console.log('📝 Grok response length:', content.length);
    
    let result: { alerts: any[]; marketInsights: { summary?: string; bias?: string; keyLevels?: string[]; noTradesReason?: string } } = { 
      alerts: [], 
      marketInsights: {} 
    };
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        result = {
          alerts: Array.isArray(parsed.alerts) ? parsed.alerts.map((a: any) => ({
            grade: a.grade || 'C',
            direction: a.direction || 'NEUTRAL',
            entry: a.entry || 'N/A',
            stopLoss: a.stopLoss || 'N/A',
            targets: Array.isArray(a.targets) ? a.targets : [],
            confluenceSignals: Array.isArray(a.confluenceSignals) ? a.confluenceSignals : [],
            confluenceCount: typeof a.confluenceCount === 'number' ? a.confluenceCount : 0,
            reasoning: a.reasoning || ''
          })) : [],
          marketInsights: {
            summary: parsed.marketInsights?.summary || '',
            bias: parsed.marketInsights?.bias || 'NEUTRAL',
            keyLevels: Array.isArray(parsed.marketInsights?.keyLevels) ? parsed.marketInsights.keyLevels : [],
            noTradesReason: parsed.marketInsights?.noTradesReason || ''
          }
        };
        console.log(`📊 Parsed ${result.alerts.length} alerts, summary length: ${result.marketInsights.summary?.length || 0}`);
      }
    } catch (parseError: any) {
      console.error('❌ Failed to parse Grok response:', parseError.message);
      result = { 
        alerts: [], 
        marketInsights: { summary: content.substring(0, 500) } 
      };
    }

    console.log('📤 Sending response with', result.alerts.length, 'alerts');
    res.json(result);

  } catch (error: any) {
    console.error('Order flow alerts error:', error);
    res.status(500).json({ 
      error: error.message,
      alerts: []
    });
  }
}
