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
  const isAdmin = email === ADMIN_EMAIL;
  let pool: any = null;

  console.log('📥 Elliott Wave Stack analyze called for:', email);

  try {
    const { waveEntries, symbol = 'BTCUSDT', pivots = [], scopedWave = null, priorWaveContext = null } = req.body;

    if (!process.env.XAI_API_KEY) {
      return res.status(500).json({ error: 'XAI_API_KEY missing' });
    }

    let tier = 'free';
    let hasElliottAddon = false;
    let elliottCreditsUsed = 0;
    let cryptoUserId: number | null = null;
    let dbAvailable = false;
    let subscription: any = null;

    try {
      pool = await getDb();

      const userResult = await pool.query(
        'SELECT id FROM crypto_users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length > 0) {
        cryptoUserId = userResult.rows[0].id;
        dbAvailable = true;

        const subResult = await pool.query(
          'SELECT tier, has_elliott_addon, elliott_ai_credits, elliott_ai_credits_reset_at FROM crypto_subscriptions WHERE user_id = $1',
          [cryptoUserId]
        );

        subscription = subResult.rows[0];
        tier = subscription?.tier || 'free';
        hasElliottAddon = subscription?.has_elliott_addon || false;
        elliottCreditsUsed = subscription?.elliott_ai_credits || 0;
        const resetAt = subscription?.elliott_ai_credits_reset_at ? new Date(subscription.elliott_ai_credits_reset_at) : null;

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
      }
    } catch (dbError) {
      console.error('DB connection error:', dbError);
      if (isAdmin) {
        tier = 'elite';
        hasElliottAddon = true;
        console.log('Admin bypass enabled due to DB error');
      }
    }

    const hasElliottAccess = isAdmin || tier === 'elite' || hasElliottAddon;
    if (!hasElliottAccess) {
      try { await pool?.end(); } catch {}
      return res.status(403).json({ 
        error: 'Elliott Wave AI requires Elite tier or Elliott Wave add-on',
        message: 'Please upgrade to Elite tier or purchase the Elliott Wave add-on to access AI analysis'
      });
    }

    const elliottLimit = isAdmin ? 999 : (tier === 'elite' ? MONTHLY_ELLIOTT_CREDITS.elite : MONTHLY_ELLIOTT_CREDITS.addon);
    const elliottCreditsRemaining = isAdmin ? 999 : (elliottLimit - elliottCreditsUsed);

    if (!isAdmin && elliottCreditsRemaining <= 0) {
      try { await pool?.end(); } catch {}
      return res.status(403).json({ 
        error: 'No Elliott Wave AI credits remaining',
        message: `You've used all ${elliottLimit} Elliott Wave AI credits for this month. Credits reset on the 1st.`,
        creditsRemaining: 0,
        creditsLimit: elliottLimit
      });
    }

    if (!waveEntries || waveEntries.length === 0) {
      try { await pool?.end(); } catch {}
      return res.json({
        success: false,
        analysis: { synopsis: 'No wave entries to analyze. Add some wave patterns first.' },
        waveCount: 0
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.XAI_API_KEY!,
      baseURL: 'https://api.x.ai/v1',
      timeout: 120000,
    });

    const waveSummary = waveEntries.map((w: any) => 
      `${w.degree} ${w.patternType} (${w.waveCount} waves): ${w.direction} from $${w.startPrice.toFixed(4)} to $${w.endPrice.toFixed(4)}`
    ).join('\n');

    const prompt = scopedWave 
      ? `Analyze this specific Elliott Wave pattern on ${symbol}:

FOCUSED WAVE:
${scopedWave.degree} wave labeled "${scopedWave.label}"
From $${scopedWave.startPrice.toFixed(4)} to $${scopedWave.endPrice.toFixed(4)}

${priorWaveContext ? `PRIOR WAVE CONTEXT:
Previous ${priorWaveContext.degree} ${priorWaveContext.type} moved ${priorWaveContext.direction}: ${priorWaveContext.priceChange}%` : ''}

OTHER WAVES IN TIMEFRAME:
${waveSummary}

Provide JSON response with:
{
  "synopsis": "2-3 sentence analysis of the focused wave",
  "tableData": [{"wave": "Label", "pattern": "Pattern type", "priceChange": "% change", "notes": "Brief observation"}]
}`
      : `Analyze this Elliott Wave stack for ${symbol}:

WAVE PATTERNS IDENTIFIED:
${waveSummary}

PRICE PIVOTS: ${pivots.length} pivots detected

Provide JSON response with:
{
  "synopsis": "2-3 sentence overall market structure analysis",
  "tableData": [{"wave": "Degree", "pattern": "Pattern type", "direction": "up/down", "notes": "Key observation"}]
}`;

    const completion = await openai.chat.completions.create({
      model: 'grok-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert Elliott Wave analyst. Respond ONLY with valid JSON. No explanations, no markdown, no extra text.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 1200,
      temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content || '';
    console.log('GROK STACK RESPONSE:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Grok response');

    const result = JSON.parse(jsonMatch[0]);

    if (!isAdmin && cryptoUserId && pool && dbAvailable && subscription) {
      try {
        const newCreditsUsed = elliottCreditsUsed + 1;
        await pool.query(
          'UPDATE crypto_subscriptions SET elliott_ai_credits = $1, updated_at = NOW() WHERE user_id = $2',
          [newCreditsUsed, cryptoUserId]
        );
      } catch (dbWriteError) {
        console.error('Failed to update credits:', dbWriteError);
      }
    }

    try { await pool?.end(); } catch {}

    const finalCreditsRemaining = isAdmin ? 999 : Math.max(0, elliottLimit - elliottCreditsUsed - 1);

    res.json({
      success: true,
      analysis: result,
      waveCount: waveEntries.length,
      creditsRemaining: finalCreditsRemaining,
    });

  } catch (error: any) {
    console.error('Analyze stack error:', error);
    try { await pool?.end(); } catch {}
    res.status(500).json({ error: error.message });
  }
}
