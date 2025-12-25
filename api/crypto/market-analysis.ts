import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';
import OpenAI from 'openai';

const xai = new OpenAI({ 
  baseURL: "https://api.x.ai/v1",
  apiKey: process.env.XAI_API_KEY || '',
  timeout: 120000
});

const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache per symbol/timeframe

const ALLOWED_TIERS = ['intermediate', 'pro', 'elite'];
const ADMIN_EMAIL = 'beartec@beartec.uk';

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

  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { email } = auth;
  const isAdmin = email === ADMIN_EMAIL;
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

    let tier = 'free';
    let cryptoUserId: number | null = null;

    try {
      pool = await getDb();

      const userResult = await pool.query(
        'SELECT id FROM crypto_users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length > 0) {
        cryptoUserId = userResult.rows[0].id;

        const subResult = await pool.query(
          'SELECT tier FROM crypto_subscriptions WHERE user_id = $1',
          [cryptoUserId]
        );

        tier = subResult.rows[0]?.tier || 'free';
      }
    } catch (dbError) {
      console.error('DB connection error, continuing with tier check bypass:', dbError);
      if (isAdmin) {
        tier = 'elite';
      }
    }

    if (!isAdmin && !ALLOWED_TIERS.includes(tier)) {
      try { await pool?.end(); } catch {}
      return res.status(403).json({ 
        error: `AI analysis requires Intermediate tier or higher. Current tier: ${tier}`,
        tier
      });
    }

    if (cryptoUserId && pool) {
      try {
        const cacheResult = await pool.query(
          `SELECT market_insights, updated_at 
           FROM crypto_ai_analyses 
           WHERE user_id = $1 AND symbol = $2 AND interval = $3`,
          [cryptoUserId, symbol, timeframe]
        );

        const cachedAnalysis = cacheResult.rows[0];
        const cacheAge = cachedAnalysis?.updated_at 
          ? Date.now() - new Date(cachedAnalysis.updated_at).getTime() 
          : Infinity;

        if (cachedAnalysis && cacheAge < CACHE_TTL) {
          await pool.end();
          return res.json({
            analysis: cachedAnalysis.market_insights?.analysis || 'Cached analysis',
            marketInsights: cachedAnalysis.market_insights,
            cached: true,
            cacheAge: Math.round(cacheAge / 1000),
            cacheRemaining: Math.round((CACHE_TTL - cacheAge) / 1000),
            estimatedCost: 0
          });
        }
      } catch (cacheError) {
        console.error('Cache check failed, proceeding with fresh analysis:', cacheError);
      }
    }

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
      model: "grok-3",
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

    if (cryptoUserId && pool) {
      try {
        const marketInsights = { analysis, bias: 'neutral', timestamp: Date.now() };
        
        const existingCache = await pool.query(
          `SELECT id FROM crypto_ai_analyses WHERE user_id = $1 AND symbol = $2 AND interval = $3`,
          [cryptoUserId, symbol, timeframe]
        );

        if (existingCache.rows.length > 0) {
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
      } catch (cacheWriteError) {
        console.error('Failed to cache analysis:', cacheWriteError);
      }
    }

    try { await pool?.end(); } catch {}

    res.json({
      analysis,
      cached: false,
      cacheAge: 0,
      cacheRemaining: CACHE_TTL / 1000,
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
