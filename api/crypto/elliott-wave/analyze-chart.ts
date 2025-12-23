import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';
import OpenAI from 'openai';

const ADMIN_EMAIL = 'beartec@beartec.uk';

const MONTHLY_ELLIOTT_CREDITS: Record<string, number> = {
  elite: 150,
  addon: 50,
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { email } = auth;
  let pool: any = null;

  console.log('📥 Elliott Wave Chart analyze called for:', email);

  try {
    const { symbol = 'BTCUSDT', timeframe = '1h', pivots = [], priceRange = {} } = req.body;

    if (!process.env.XAI_API_KEY) {
      return res.status(500).json({ error: 'XAI_API_KEY missing' });
    }

    pool = await getDb();

    const userResult = await pool.query(
      'SELECT id FROM crypto_users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      await pool.end();
      return res.status(404).json({ error: 'User not found' });
    }

    const cryptoUserId = userResult.rows[0].id;

    const subResult = await pool.query(
      'SELECT tier, has_elliott_addon, elliott_ai_credits, elliott_ai_credits_reset_at FROM crypto_subscriptions WHERE user_id = $1',
      [cryptoUserId]
    );

    const subscription = subResult.rows[0];
    const isAdmin = email === ADMIN_EMAIL;
    
    if (!subscription && !isAdmin) {
      await pool.end();
      return res.status(403).json({ 
        error: 'No subscription found',
        message: 'Please set up a subscription to access Elliott Wave AI analysis'
      });
    }

    const tier = subscription?.tier || 'free';
    const hasElliottAddon = subscription?.has_elliott_addon || false;
    let elliottCreditsUsed = subscription?.elliott_ai_credits || 0;
    const resetAt = subscription?.elliott_ai_credits_reset_at ? new Date(subscription.elliott_ai_credits_reset_at) : null;

    const hasElliottAccess = isAdmin || tier === 'elite' || hasElliottAddon;
    if (!hasElliottAccess) {
      await pool.end();
      return res.status(403).json({ 
        error: 'Elliott Wave AI requires Elite tier or Elliott Wave add-on',
        message: 'Please upgrade to Elite tier or purchase the Elliott Wave add-on to access AI analysis'
      });
    }

    const elliottLimit = isAdmin ? 999 : (tier === 'elite' ? MONTHLY_ELLIOTT_CREDITS.elite : MONTHLY_ELLIOTT_CREDITS.addon);

    const now = new Date();
    const shouldReset = !resetAt || 
      (resetAt.getMonth() !== now.getMonth() || resetAt.getFullYear() !== now.getFullYear());

    if (shouldReset && subscription) {
      elliottCreditsUsed = 0;
      await pool.query(
        'UPDATE crypto_subscriptions SET elliott_ai_credits = 0, elliott_ai_credits_reset_at = NOW() WHERE user_id = $1',
        [cryptoUserId]
      );
    }

    const elliottCreditsRemaining = elliottLimit - elliottCreditsUsed;

    if (elliottCreditsRemaining <= 0 && !isAdmin) {
      await pool.end();
      return res.status(403).json({ 
        error: 'No Elliott Wave AI credits remaining',
        message: `You've used all ${elliottLimit} Elliott Wave AI credits for this month. Credits reset on the 1st.`,
        creditsRemaining: 0,
        creditsLimit: elliottLimit
      });
    }

    if (!pivots || pivots.length < 5) {
      await pool.end();
      return res.json({
        success: false,
        analysis: { synopsis: 'Not enough pivot points detected. Need at least 5 pivots for pattern detection.' },
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.XAI_API_KEY!,
      baseURL: 'https://api.x.ai/v1',
      timeout: 120000,
    });

    const pivotSummary = pivots.slice(-20).map((p: any, i: number) => 
      `${p.type === 'H' ? 'High' : 'Low'}: $${p.price.toFixed(4)}`
    ).join(', ');

    const prompt = `Analyze this ${symbol} ${timeframe} chart for Elliott Wave patterns based on price pivots:

PRICE RANGE:
High: $${priceRange.high?.toFixed(4) || 'N/A'}
Low: $${priceRange.low?.toFixed(4) || 'N/A'}
Start: $${priceRange.start?.toFixed(4) || 'N/A'}
End: $${priceRange.end?.toFixed(4) || 'N/A'}

RECENT PIVOTS (${pivots.length} total):
${pivotSummary}

Based on these pivot points, identify the most likely Elliott Wave pattern. Provide JSON response:
{
  "synopsis": "2-3 sentence analysis of the visible price action",
  "bestFitPattern": "impulse" | "correction" | "diagonal" | "triangle" | "flat" | "zigzag" | "unclear",
  "confidence": 0-100,
  "direction": "bullish" | "bearish" | "sideways",
  "possiblePatterns": [
    {"pattern": "Pattern name", "probability": 0-100, "reasoning": "Brief explanation"}
  ],
  "possibleOutcomes": [
    {"scenario": "Bullish continuation", "target": "$X.XX", "probability": 0-100},
    {"scenario": "Bearish reversal", "target": "$X.XX", "probability": 0-100}
  ],
  "fibonacciLevels": [
    {"level": "38.2%", "price": 1.85, "type": "support/resistance"}
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: 'grok-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert Elliott Wave analyst. Analyze price action patterns and respond ONLY with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 1500,
      temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content || '';
    console.log('GROK CHART RESPONSE:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Grok response');

    const result = JSON.parse(jsonMatch[0]);

    const newCreditsUsed = elliottCreditsUsed + 1;
    if (!isAdmin && subscription) {
      await pool.query(
        'UPDATE crypto_subscriptions SET elliott_ai_credits = $1, updated_at = NOW() WHERE user_id = $2',
        [newCreditsUsed, cryptoUserId]
      );
    }

    await pool.end();

    console.log(`📤 Sending chart analysis, credits remaining: ${elliottLimit - newCreditsUsed}`);
    return res.json({
      success: true,
      analysis: result,
      rawResponse: content,
      creditsRemaining: elliottLimit - newCreditsUsed
    });

  } catch (error: any) {
    console.error('GROK CHART FAILED:', error.message);
    try { await pool?.end(); } catch {}
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
    });
  }
}

export const config = {
  maxDuration: 120,
  memory: 1024,
};
