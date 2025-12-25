import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';
import OpenAI from 'openai';

const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache per symbol/timeframe

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
  const pool = new (Pool as any)({ 
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
    query_timeout: 5000
  });
  return pool;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Require authentication
  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { email } = auth;
  let pool: any = null;

  console.log('📥 Elliott Wave AI analyze called for:', email);

  try {
    const { chartImage, symbol = 'BTCUSDT', timeframe = '1h' } = req.body;

    if (!process.env.XAI_API_KEY) {
      return res.status(500).json({ error: 'XAI_API_KEY missing' });
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

    // Get subscription for tier and Elliott credits
    const subResult = await pool.query(
      'SELECT tier, has_elliott_addon, elliott_ai_credits, elliott_ai_credits_reset_at FROM crypto_subscriptions WHERE user_id = $1',
      [cryptoUserId]
    );

    const subscription = subResult.rows[0];
    
    // User must have a subscription record
    if (!subscription) {
      await pool.end();
      return res.status(403).json({ 
        error: 'No subscription found',
        message: 'Please set up a subscription to access Elliott Wave AI analysis'
      });
    }

    const tier = subscription.tier || 'free';
    const hasElliottAddon = subscription.has_elliott_addon || false;
    let elliottCreditsUsed = subscription.elliott_ai_credits || 0;
    const resetAt = subscription.elliott_ai_credits_reset_at ? new Date(subscription.elliott_ai_credits_reset_at) : null;

    // Check tier eligibility (Elite tier OR Elliott Wave add-on)
    const hasElliottAccess = tier === 'elite' || hasElliottAddon;
    if (!hasElliottAccess) {
      await pool.end();
      return res.status(403).json({ 
        error: 'Elliott Wave AI requires Elite tier or Elliott Wave add-on',
        message: 'Please upgrade to Elite tier or purchase the Elliott Wave add-on to access AI analysis'
      });
    }

    // Determine credit limit based on tier/addon
    const elliottLimit = tier === 'elite' ? MONTHLY_ELLIOTT_CREDITS.elite : MONTHLY_ELLIOTT_CREDITS.addon;

    // Check if credits should reset (new month)
    const now = new Date();
    const shouldReset = !resetAt || 
      (resetAt.getMonth() !== now.getMonth() || resetAt.getFullYear() !== now.getFullYear());

    if (shouldReset) {
      elliottCreditsUsed = 0;
      await pool.query(
        'UPDATE crypto_subscriptions SET elliott_ai_credits = 0, elliott_ai_credits_reset_at = NOW() WHERE user_id = $1',
        [cryptoUserId]
      );
    }

    const elliottCreditsRemaining = elliottLimit - elliottCreditsUsed;

    // Check for cached analysis (1 hour TTL per symbol/interval)
    const cacheResult = await pool.query(
      `SELECT elliott_analysis, updated_at 
       FROM crypto_ai_analyses 
       WHERE user_id = $1 AND symbol = $2 AND interval = $3`,
      [cryptoUserId, symbol, timeframe]
    );

    const cachedAnalysis = cacheResult.rows[0];
    const cacheAge = cachedAnalysis?.updated_at 
      ? Date.now() - new Date(cachedAnalysis.updated_at).getTime() 
      : Infinity;

    // If cache is valid (within 1 hour), return cached result without deducting credits
    if (cachedAnalysis?.elliott_analysis && cacheAge < CACHE_TTL) {
      console.log(`📊 Returning cached Elliott analysis for ${symbol}/${timeframe} (${Math.round(cacheAge/1000)}s old)`);
      await pool.end();
      // Parse JSON if needed (pg driver usually handles this but be safe)
      const elliottData = typeof cachedAnalysis.elliott_analysis === 'string' 
        ? JSON.parse(cachedAnalysis.elliott_analysis) 
        : cachedAnalysis.elliott_analysis;
      return res.json({
        ...elliottData,
        cached: true,
        cacheAge: Math.round(cacheAge / 1000),
        cacheRemaining: Math.round((CACHE_TTL - cacheAge) / 1000),
        creditsRemaining: elliottCreditsRemaining
      });
    }

    // No valid cache - check if user has credits
    if (elliottCreditsRemaining <= 0) {
      await pool.end();
      return res.status(403).json({ 
        error: 'No Elliott Wave AI credits remaining',
        message: `You've used all ${elliottLimit} Elliott Wave AI credits for this month. Credits reset on the 1st.`,
        creditsRemaining: 0,
        creditsLimit: elliottLimit
      });
    }

    // Validate chart image
    const chartImageData = chartImage ? String(chartImage) : null;

    if (!chartImageData || !chartImageData.startsWith('data:image')) {
      await pool.end();
      console.warn('No valid image — falling back to text-only mode');
      return res.json({
        patternType: 'impulse',
        confidence: 10,
        analysis: 'No screenshot received — please capture the chart first',
        suggestedLabels: [],
        continuation: { direction: 'unknown', targetDescription: 'Need chart image' },
        creditsRemaining: elliottCreditsRemaining
      });
    }

    console.log('Image received — size:', (chartImageData.length / 1024 / 1024).toFixed(2), 'MB');

    const openai = new OpenAI({
      apiKey: process.env.XAI_API_KEY!,
      baseURL: 'https://api.x.ai/v1',
      timeout: 120000,
    });

    const completion = await openai.chat.completions.create({
      model: process.env.XAI_ELLIOTT_MODEL || 'grok-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert Elliott Wave analyst. You respond ONLY with valid JSON. No explanations, no markdown, no extra text.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this ${symbol} ${timeframe} chart for Elliott Wave pattern and return ONLY this exact JSON structure (no extra text, no code blocks):

{
  "patternType": "impulse" | "correction" | "diagonal" | "triangle" | "flat" | "zigzag",
  "degree": "Primary" | "Intermediate" | "Minor" | "Minute",
  "confidence": 0-100,
  "currentWave": "In Wave 3" | "Wave 4 correction" | etc,
  "analysis": "One short sentence summary",
  "suggestedLabels": [
    {
      "label": "0" | "1" | "2" | "3" | "4" | "5" | "A" | "B" | "C" | "D" | "E",
      "candleIndex": number,
      "priceLevel": number,
      "snapTo": "high" | "low"
    }
  ],
  "continuation": {
    "direction": "up" | "down",
    "targetDescription": "Brief target description",
    "upTargets": [{"level": "100%", "price": 2.35}, {"level": "161.8%", "price": 2.48}],
    "downTargets": [{"level": "61.8%", "price": 2.10}]
  }
}`,
            },
            { type: 'image_url', image_url: { url: chartImageData } },
          ],
        },
      ],
      max_tokens: 1200,
      temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content || '';
    console.log('GROK RESPONSE:', content);

    // Extract JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Grok response');

    const result = JSON.parse(jsonMatch[0]);

    // Increment Elliott credits used
    const newCreditsUsed = elliottCreditsUsed + 1;
    await pool.query(
      'UPDATE crypto_subscriptions SET elliott_ai_credits = $1, updated_at = NOW() WHERE user_id = $2',
      [newCreditsUsed, cryptoUserId]
    );

    // Store/update cached analysis
    if (cachedAnalysis) {
      await pool.query(
        `UPDATE crypto_ai_analyses 
         SET elliott_analysis = $1::jsonb, updated_at = NOW() 
         WHERE user_id = $2 AND symbol = $3 AND interval = $4`,
        [JSON.stringify(result), cryptoUserId, symbol, timeframe]
      );
    } else {
      await pool.query(
        `INSERT INTO crypto_ai_analyses (id, user_id, symbol, interval, elliott_analysis, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, NOW(), NOW())`,
        [cryptoUserId, symbol, timeframe, JSON.stringify(result)]
      );
    }

    await pool.end();

    console.log(`📤 Sending Elliott analysis, credits remaining: ${elliottLimit - newCreditsUsed}`);
    return res.json({
      ...result,
      cached: false,
      creditsRemaining: elliottLimit - newCreditsUsed
    });

  } catch (error: any) {
    console.error('GROK FAILED:', error.message);
    try { await pool?.end(); } catch {}
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
    });
  }
}

export const config = {
  maxDuration: 800,
  memory: 2048,
};
