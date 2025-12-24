import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';
import OpenAI from 'openai';

const xai = new OpenAI({ 
  baseURL: "https://api.x.ai/v1",
  apiKey: process.env.XAI_API_KEY || '',
  timeout: 120000
});

const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache per symbol/timeframe

const MONTHLY_AI_CREDITS: Record<string, number> = {
  free: 0,
  beginner: 0,
  intermediate: 200,
  pro: 400,
  elite: 500,
};

async function verifyAuth(req: VercelRequest): Promise<{ userId: string; email: string } | null> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const secretKey = process.env.CLERK_SECRET_KEY;

    if (!secretKey) {
      console.error('CLERK_SECRET_KEY not set');
      return null;
    }
    
    const payload = await verifyToken(token, { secretKey });
    if (!payload?.sub) {
      return null;
    }

    const clerk = createClerkClient({ secretKey });
    const user = await clerk.users.getUser(payload.sub);
    const email = user.emailAddresses[0]?.emailAddress || '';

    return { userId: payload.sub, email };
  } catch (error) {
    console.error('Auth verification failed:', error);
    return null;
  }
}

async function getDb() {
  const pg = await import('pg');
  const Pool = pg.default?.Pool || pg.Pool;
  const pool = new (Pool as any)({ connectionString: process.env.DATABASE_URL });
  return pool;
}

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

  // Require authentication
  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { email } = auth;
  let pool: any = null;

  try {
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

    if (!symbol || !timeframe) {
      return res.status(400).json({ error: 'Symbol and timeframe required' });
    }

    pool = await getDb();

    // Get user from crypto_users
    const userResult = await pool.query(
      'SELECT id FROM crypto_users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      await pool.end();
      return res.status(404).json({ error: 'User not found' });
    }

    const cryptoUserId = userResult.rows[0].id;

    // Get subscription for tier and credits
    const subResult = await pool.query(
      'SELECT tier, ai_credits, ai_credits_reset_at FROM crypto_subscriptions WHERE user_id = $1',
      [cryptoUserId]
    );

    const subscription = subResult.rows[0];
    const tier = subscription?.tier || 'free';
    const aiLimit = MONTHLY_AI_CREDITS[tier] || 0;
    let aiCreditsUsed = subscription?.ai_credits || 0;
    const resetAt = subscription?.ai_credits_reset_at ? new Date(subscription.ai_credits_reset_at) : null;

    // Check if credits should reset (new month)
    const now = new Date();
    const shouldReset = !resetAt || 
      (resetAt.getMonth() !== now.getMonth() || resetAt.getFullYear() !== now.getFullYear());

    if (shouldReset && subscription) {
      aiCreditsUsed = 0;
      await pool.query(
        'UPDATE crypto_subscriptions SET ai_credits = 0, ai_credits_reset_at = NOW() WHERE user_id = $1',
        [cryptoUserId]
      );
    }

    const aiCreditsRemaining = aiLimit - aiCreditsUsed;

    // Check for cached analysis (1 hour TTL per symbol/timeframe)
    const cacheResult = await pool.query(
      `SELECT alerts, market_insights, orderflow_data, updated_at 
       FROM crypto_ai_analyses 
       WHERE user_id = $1 AND symbol = $2 AND interval = $3`,
      [cryptoUserId, symbol, timeframe]
    );

    const cachedAnalysis = cacheResult.rows[0];
    const cacheAge = cachedAnalysis?.updated_at 
      ? Date.now() - new Date(cachedAnalysis.updated_at).getTime() 
      : Infinity;

    // If cache is valid (within 1 hour), return cached result
    if (cachedAnalysis && cacheAge < CACHE_TTL) {
      await pool.end();
      return res.json({
        analysis: cachedAnalysis.market_insights?.analysis || 'Cached analysis',
        alerts: cachedAnalysis.alerts || [],
        marketInsights: cachedAnalysis.market_insights,
        cached: true,
        cacheAge: Math.round(cacheAge / 1000),
        cacheRemaining: Math.round((CACHE_TTL - cacheAge) / 1000),
        creditsRemaining: aiCreditsRemaining,
        estimatedCost: 0
      });
    }

    // No valid cache - check if user has credits
    if (aiCreditsRemaining <= 0) {
      await pool.end();
      return res.status(403).json({ 
        error: `No AI credits remaining. ${tier} tier has ${aiLimit} credits/month. Upgrade for more.`,
        creditsRemaining: 0,
        creditsLimit: aiLimit,
        tier
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
      model: "grok-4",
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

    // Increment credits used
    const newCreditsUsed = aiCreditsUsed + 1;
    await pool.query(
      'UPDATE crypto_subscriptions SET ai_credits = $1, updated_at = NOW() WHERE user_id = $2',
      [newCreditsUsed, cryptoUserId]
    );

    // Store/update cached analysis (pass stringified JSON for JSONB columns with explicit cast)
    const marketInsights = { analysis, bias: 'neutral', timestamp: Date.now() };
    
    if (cachedAnalysis) {
      await pool.query(
        `UPDATE crypto_ai_analyses 
         SET market_insights = $1::jsonb, updated_at = NOW() 
         WHERE user_id = $2 AND symbol = $3 AND interval = $4`,
        [JSON.stringify(marketInsights), cryptoUserId, symbol, timeframe]
      );
    } else {
      await pool.query(
        `INSERT INTO crypto_ai_analyses (id, user_id, symbol, interval, market_insights, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, NOW(), NOW())`,
        [cryptoUserId, symbol, timeframe, JSON.stringify(marketInsights)]
      );
    }

    await pool.end();

    res.json({
      analysis,
      cached: false,
      cacheAge: 0,
      cacheRemaining: CACHE_TTL / 1000,
      creditsRemaining: aiLimit - newCreditsUsed,
      estimatedCost,
      tokens: {
        input: inputTokens,
        output: outputTokens
      }
    });
  } catch (error: any) {
    console.error('Market analysis error:', error);
    try { await pool?.end(); } catch {}
    res.status(500).json({ 
      error: error.message,
      details: 'AI analysis failed'
    });
  }
}
