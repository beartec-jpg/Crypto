import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

const xai = new OpenAI({ 
  baseURL: "https://api.x.ai/v1",
  apiKey: process.env.XAI_API_KEY || '',
  timeout: 120000
});

let marketAnalysisCache: { analysis: string; timestamp: number; cost: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if XAI API key is configured
    if (!process.env.XAI_API_KEY) {
      return res.status(503).json({ 
        error: 'AI analysis service not configured',
        available: false 
      });
    }

    const { candles, bos, choch, vwap, symbol, timeframe } = req.body;

    if (!candles || !Array.isArray(candles) || candles.length === 0) {
      return res.status(400).json({ error: 'Invalid candle data' });
    }

    // Check cache first
    const now = Date.now();
    if (marketAnalysisCache && (now - marketAnalysisCache.timestamp) < CACHE_TTL) {
      return res.json({
        analysis: marketAnalysisCache.analysis,
        cached: true,
        cacheAge: Math.round((now - marketAnalysisCache.timestamp) / 1000),
        estimatedCost: 0
      });
    }

    // Prepare concise market summary for Grok
    const recentCandles = candles.slice(-50);
    const currentPrice = recentCandles[recentCandles.length - 1].close;
    const priceChange24h = ((currentPrice - recentCandles[0].close) / recentCandles[0].close) * 100;
    
    const recentBOS = bos?.filter((b: any) => b.breakTime > recentCandles[0].time).length || 0;
    const recentCHoCH = choch?.filter((c: any) => c.breakTime > recentCandles[0].time).length || 0;
    const liqSweeps = [...(bos || []), ...(choch || [])].filter((e: any) => e.isLiquidityGrab).length || 0;

    const prompt = `You are a professional crypto market analyst. Analyze the current market conditions for ${symbol} (${timeframe} timeframe):

**Price Action:**
- Current: $${currentPrice.toFixed(4)}
- 24h Change: ${priceChange24h > 0 ? '+' : ''}${priceChange24h.toFixed(2)}%
- High: $${Math.max(...recentCandles.map((c: any) => c.high)).toFixed(4)}
- Low: $${Math.min(...recentCandles.map((c: any) => c.low)).toFixed(4)}

**Market Structure (recent ${timeframe} period):**
- BOS (Breaks of Structure): ${recentBOS}
- CHoCH (Change of Character): ${recentCHoCH}
- Liquidity Sweeps: ${liqSweeps}

**VWAP Position:**
- Price vs VWAP: ${vwap?.current ? (currentPrice > vwap.current ? 'Above' : 'Below') : 'N/A'}

Provide a brief, actionable market analysis (3-4 sentences) covering:
1. Current trend and momentum
2. Key support/resistance levels
3. Trading bias (bullish/bearish/neutral) with reasoning
4. Risk factors to watch

Be concise and direct.`;

    const response = await xai.chat.completions.create({
      model: "grok-2-1212",
      messages: [
        {
          role: "system",
          content: "You are a professional cryptocurrency market analyst. Provide concise, actionable insights based on technical analysis."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const analysis = response.choices[0].message.content || "Analysis unavailable";

    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const estimatedCost = (inputTokens / 1_000_000 * 2) + (outputTokens / 1_000_000 * 10);

    // Update cache
    marketAnalysisCache = {
      analysis,
      timestamp: now,
      cost: estimatedCost
    };

    res.json({
      analysis,
      cached: false,
      cacheAge: 0,
      estimatedCost,
      tokens: {
        input: inputTokens,
        output: outputTokens
      }
    });
  } catch (error: any) {
    console.error('Market analysis error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'AI analysis failed'
    });
  }
}
