import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';
import OpenAI from 'openai';

const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache per symbol/timeframe

const MONTHLY_AI_CREDITS: Record<string, number> = {
  free: 0,
  beginner: 0,
  intermediate: 200,
  pro: 400,
  elite: 500,
};

const ALLOWED_TIERS = ['intermediate', 'pro', 'elite'];
const ADMIN_EMAIL = 'beartec@beartec.uk';

const AI_MIN_RISK_REWARD_RATIO = 1.5;
const XAI_PRIMARY_MODEL = 'grok-4';
const XAI_FALLBACK_MODEL = 'grok-4-1-fast-reasoning';
const XAI_THINKING_BUDGET = parseInt(process.env.XAI_THINKING_BUDGET || '5000', 10);

function extractTextContent(message: any): string {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    const textBlock = message.content.find((b: any) => b.type === 'text');
    if (textBlock?.text) return textBlock.text;
    const reasoningBlock = message.content.find((b: any) => b.type === 'reasoning_content' || b.type === 'thinking');
    return reasoningBlock?.thinking || reasoningBlock?.text || '';
  }
  return '';
}

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

  console.log('📥 Order flow alerts API called for:', email);

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
      hiddenDivergenceCount, liquidityGrabCount,
      orderflowData, liquidationData,
      absorption = [], hiddenDivergences = [], liquidityGrabs = [],
      bullishOB = [], bearishOB = [], bullFVG = [], bearFVG = [],
      swingHighs = [], swingLows = [],
      cci = 0, adx = 0, plusDI = 0, minusDI = 0,
      rsi = 50, macd = 0, macdSignal = 0, macdHistogram = 0,
      obv: _obv = 0, obvTrend = 'neutral', mfi = 50,
      atr = 0, stochK = 50, stochD = 50,
      bbMiddle = 0, bbUpper = 0, bbLower = 0, bbBandwidth = 0
    } = req.body;
    
    // Helper to format Unix timestamp to readable date/time
    const formatEventTime = (timestamp: number) => {
      const date = new Date(timestamp * 1000);
      return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    };

    if (!symbol || !currentPrice) {
      return res.status(400).json({ error: 'Missing required data' });
    }

    let tier = 'free';
    let cryptoUserId: number | null = null;
    let aiCreditsUsed = 0;
    let aiLimit = 0;
    let dbAvailable = false;

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
          'SELECT tier, ai_credits, ai_credits_reset_at FROM crypto_subscriptions WHERE user_id = $1',
          [cryptoUserId]
        );

        const subscription = subResult.rows[0];
        tier = subscription?.tier || 'free';
        aiLimit = MONTHLY_AI_CREDITS[tier] || 0;
        aiCreditsUsed = subscription?.ai_credits || 0;
        const resetAt = subscription?.ai_credits_reset_at ? new Date(subscription.ai_credits_reset_at) : null;

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
      }
    } catch (dbError) {
      console.error('DB connection error:', dbError);
      if (isAdmin) {
        tier = 'elite';
        aiLimit = 999;
        console.log('Admin bypass enabled due to DB error');
      }
    }

    if (!isAdmin && !ALLOWED_TIERS.includes(tier)) {
      try { await pool?.end(); } catch {}
      return res.status(403).json({ 
        error: 'Subscription required',
        message: 'AI analysis requires Intermediate tier or higher'
      });
    }

    const aiCreditsRemaining = isAdmin ? 999 : (aiLimit - aiCreditsUsed);

    if (cryptoUserId && pool && dbAvailable) {
      try {
        const cacheResult = await pool.query(
          `SELECT alerts, market_insights, orderflow_data, updated_at 
           FROM crypto_ai_analyses 
           WHERE user_id = $1 AND symbol = $2 AND interval = $3`,
          [cryptoUserId, symbol, interval]
        );

        const cachedAnalysis = cacheResult.rows[0];
        const cacheAge = cachedAnalysis?.updated_at 
          ? Date.now() - new Date(cachedAnalysis.updated_at).getTime() 
          : Infinity;

        if (cachedAnalysis && cacheAge < CACHE_TTL) {
          console.log(`📊 Returning cached analysis for ${symbol}/${interval} (${Math.round(cacheAge/1000)}s old)`);
          await pool.end();
          return res.json({
            alerts: cachedAnalysis.alerts || [],
            marketInsights: cachedAnalysis.market_insights || null,
            cached: true,
            cacheAge: Math.round(cacheAge / 1000),
            cacheRemaining: Math.round((CACHE_TTL - cacheAge) / 1000),
            creditsRemaining: aiCreditsRemaining
          });
        }
      } catch (cacheError) {
        console.error('Cache check failed, proceeding with fresh analysis:', cacheError);
      }
    }

    if (!isAdmin && aiCreditsRemaining <= 0) {
      try { await pool?.end(); } catch {}
      return res.status(403).json({ 
        error: 'No AI credits remaining',
        message: `You've used all ${aiLimit} AI credits for this month. Credits reset on the 1st.`,
        creditsRemaining: 0,
        creditsLimit: aiLimit,
        tier
      });
    }

    // Calculate price range from swing pivots
    const allPrices = [...swingHighs.map((s: any) => s.price), ...swingLows.map((s: any) => s.price)].filter(Boolean);
    const rangeHigh = allPrices.length > 0 ? Math.max(...allPrices) : currentPrice;
    const rangeLow = allPrices.length > 0 ? Math.min(...allPrices) : currentPrice;

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

    const rsiInterpretation = rsi > 70 ? 'OVERBOUGHT' : rsi < 30 ? 'OVERSOLD' : 'NEUTRAL';
    const macdInterpretation = macdHistogram > 0 && macd > macdSignal ? 'BULLISH MOMENTUM' : 
                               macdHistogram < 0 && macd < macdSignal ? 'BEARISH MOMENTUM' : 'MIXED';
    const mfiInterpretation = mfi > 80 ? 'OVERBOUGHT (money flowing out)' : 
                              mfi < 20 ? 'OVERSOLD (money flowing in)' : 'NEUTRAL';
    const adxInterpretation = adx > 40 ? 'STRONG TREND' : adx > 25 ? 'TRENDING' : 'WEAK/RANGING';
    const diInterpretation = plusDI > minusDI ? 'BULLISH' : 'BEARISH';

    // Send up to 3 unmitigated FVG zones with price ranges so the model can reference specific levels
    const topBullFVGs = bullFVG.slice(-3).map((fvg: any) => `$${fvg.low?.toFixed(4)}-$${fvg.high?.toFixed(4)} [${formatEventTime(fvg.time)}]`).join(' | ');
    const topBearFVGs = bearFVG.slice(-3).map((fvg: any) => `$${fvg.low?.toFixed(4)}-$${fvg.high?.toFixed(4)} [${formatEventTime(fvg.time)}]`).join(' | ');
      
    const prompt = `You are a professional SMC/ICT trader. Think carefully before committing to a trade idea. Analyze ${symbol} on the ${interval} timeframe.

**PRICE ACTION:**
- Current Price: $${currentPrice.toFixed(4)}
- Position in Range: ${rangeHigh !== rangeLow ? ((currentPrice - rangeLow) / (rangeHigh - rangeLow) * 100).toFixed(1) : 50}% (0%=range low, 100%=range high)
- Volume Profile POC: $${poc?.toFixed(4) || 'N/A'}
- Value Area High (VAH): $${vah?.toFixed(4) || 'N/A'}
- Value Area Low (VAL): $${val?.toFixed(4) || 'N/A'}
- ATR(14): $${atr.toFixed(4)}

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

**MARKET STRUCTURE (Swing Pivots):**
- Range: $${rangeLow.toFixed(4)} - $${rangeHigh.toFixed(4)}
- Swing Highs (oldest to newest): ${swingHighs.length > 0 ? swingHighs.slice(-20).map((sh: any) => `$${sh.price?.toFixed(4)} [${formatEventTime(sh.time)}]`).join(' → ') : 'None'}
- Swing Lows (oldest to newest): ${swingLows.length > 0 ? swingLows.slice(-20).map((sl: any) => `$${sl.price?.toFixed(4)} [${formatEventTime(sl.time)}]`).join(' → ') : 'None'}

**SMC/ICT STRUCTURAL LEVELS:**
- Bullish Order Blocks (${bullishOB.length}): ${bullishOB.length > 0 ? bullishOB.map((ob: any) => `$${ob.low?.toFixed(4)}-$${ob.high?.toFixed(4)} [${formatEventTime(ob.time)}]`).join(' → ') : 'None'}
- Bearish Order Blocks (${bearishOB.length}): ${bearishOB.length > 0 ? bearishOB.map((ob: any) => `$${ob.low?.toFixed(4)}-$${ob.high?.toFixed(4)} [${formatEventTime(ob.time)}]`).join(' → ') : 'None'}
- Bullish FVG zones (up to 3 most recent): ${topBullFVGs || 'None'}
- Bearish FVG zones (up to 3 most recent): ${topBearFVGs || 'None'}
- Buy Imbalances: ${buyImbalancesCount || 0} | Sell Imbalances: ${sellImbalancesCount || 0}
- Absorption Events (${absorption.length}): ${absorption.length > 0 ? absorption.map((a: any) => `${a.type} $${a.price?.toFixed(4)} [${formatEventTime(a.time)}]`).join(' → ') : 'None'}
- Hidden Divergences (${hiddenDivergences.length}): ${hiddenDivergences.length > 0 ? hiddenDivergences.map((d: any) => `${d.type} $${d.price?.toFixed(4)} [${formatEventTime(d.time)}]`).join(' → ') : 'None'}
- Liquidity Grabs (${liquidityGrabs.length}): ${liquidityGrabs.length > 0 ? liquidityGrabs.map((lg: any) => `${lg.type} $${lg.price?.toFixed(4)} [${formatEventTime(lg.time)}]`).join(' → ') : 'None'}

**PROFESSIONAL SMC/ICT TRADING RULES — MANDATORY:**
1. ENTRY: MUST be at a specific FVG zone or OB level — NEVER at the current market price. Choose the nearest unfilled FVG or OB that price is likely to retrace to.
2. STOP LOSS: Place behind the entry structure — below the OB/FVG low for LONG (above for SHORT). Use ATR ($${atr.toFixed(4)}) as a minimum buffer beyond the structural low/high.
3. TP1: Nearest opposing structural level (swing pivot, FVG, or OB on the other side). This is a realistic, achievable first target.
4. TP2: Next major level beyond TP1 (the bigger structural target).
5. RISK/REWARD: Only present setups with R/R ≥ ${AI_MIN_RISK_REWARD_RATIO}. Calculate: reward = |TP1 - entry|, risk = |entry - SL|. If R/R < ${AI_MIN_RISK_REWARD_RATIO}, do NOT include the trade — return an empty alerts array instead.
6. CONFLUENCE: Require 3+ confirming signals (oscillators, CVD, OI, FVG/OB alignment, volume delta).
7. If no valid SMC/ICT setup with R/R ≥ ${AI_MIN_RISK_REWARD_RATIO} exists, return empty alerts and explain in marketInsights.

Return ONLY valid JSON:
{
  "alerts": [
    {
      "grade": "A+/A/B/C",
      "direction": "LONG/SHORT",
      "entryZone": "FVG/OB zone e.g. $1.3200-$1.3250",
      "entry": "exact entry price (midpoint of zone or OB level)",
      "stopLoss": "exact SL price",
      "slRationale": "e.g. below OB low at $1.3190 + 1 ATR ($${atr.toFixed(4)}) buffer",
      "targets": ["TP1 price", "TP2 price"],
      "tp1Rationale": "e.g. nearest swing high / bearish OB at $X",
      "tp2Rationale": "e.g. next major swing high / FVG fill at $X",
      "confluenceSignals": ["signal1", "signal2", "signal3"],
      "confluenceCount": 5,
      "riskRewardRatio": 2.1,
      "reasoning": "SMC/ICT explanation: why this FVG/OB is the entry, what confirms the direction"
    }
  ],
  "marketInsights": {
    "summary": "Comprehensive market analysis covering structure, momentum, key levels and why a trade is or is not valid.",
    "bias": "BULLISH/BEARISH/NEUTRAL",
    "keyLevels": ["important price level 1", "important price level 2"]
  }
}`;

    const openai = new OpenAI({
      baseURL: 'https://api.x.ai/v1',
      apiKey: apiKey,
      timeout: 250000,
    });

    console.log(`🤖 Calling xAI ${XAI_PRIMARY_MODEL} (thinking enabled) for order flow analysis...`);
    const startTime = Date.now();

    let completion: any;
    try {
      completion = await (openai.chat.completions.create as any)({
        model: XAI_PRIMARY_MODEL,
        messages: [
          { role: 'system', content: 'You are a professional SMC/ICT trader. Think through the structural analysis carefully before committing to a trade idea. Return ONLY valid JSON.' },
          { role: 'user', content: prompt }
        ],
        thinking: { type: 'enabled', budget_tokens: XAI_THINKING_BUDGET },
        temperature: 1,
        max_tokens: 16000
      });
    } catch (primaryModelError: any) {
      console.warn(`⚠️ ${XAI_PRIMARY_MODEL} failed (${primaryModelError.message}), falling back to ${XAI_FALLBACK_MODEL}`);
      completion = await openai.chat.completions.create({
        model: XAI_FALLBACK_MODEL,
        messages: [
          { role: 'system', content: 'You are a professional SMC/ICT trader. Think through the structural analysis carefully before committing to a trade idea. Return ONLY valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 8000
      });
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Grok response received in ${duration}ms`);

    const rawContent = extractTextContent(completion.choices[0]?.message);
    
    let result: { alerts: any[]; marketInsights: any } = { alerts: [], marketInsights: {} };
    
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const rawAlerts = Array.isArray(parsed.alerts) ? parsed.alerts : [];

        // Post-processing: enforce R/R >= AI_MIN_RISK_REWARD_RATIO server-side
        const filteredAlerts = rawAlerts
          .map((a: any) => {
            const entryNum = parseFloat(String(a.entry).replace(/[^0-9.-]/g, '')) || 0;
            const slNum = parseFloat(String(a.stopLoss).replace(/[^0-9.-]/g, '')) || 0;
            const tp1Num = parseFloat(String(a.targets?.[0]).replace(/[^0-9.-]/g, '')) || 0;
            const risk = Math.abs(entryNum - slNum);
            const reward = Math.abs(tp1Num - entryNum);
            const rr = risk > 0 && reward > 0 ? reward / risk : 0;
            return {
              grade: a.grade || 'C',
              direction: a.direction || 'NEUTRAL',
              entryZone: a.entryZone || '',
              entry: a.entry || 'N/A',
              stopLoss: a.stopLoss || 'N/A',
              slRationale: a.slRationale || '',
              targets: Array.isArray(a.targets) ? a.targets : [],
              tp1Rationale: a.tp1Rationale || '',
              tp2Rationale: a.tp2Rationale || '',
              confluenceSignals: Array.isArray(a.confluenceSignals) ? a.confluenceSignals : [],
              confluenceCount: typeof a.confluenceCount === 'number' ? a.confluenceCount : 0,
              riskRewardRatio: parseFloat(rr.toFixed(2)),
              reasoning: a.reasoning || '',
              _rr: rr
            };
          })
          .filter((a: any) => a._rr >= AI_MIN_RISK_REWARD_RATIO)
          .map(({ _rr, ...a }: any) => a);

        result = {
          alerts: filteredAlerts,
          marketInsights: {
            summary: parsed.marketInsights?.summary || '',
            bias: parsed.marketInsights?.bias || 'NEUTRAL',
            keyLevels: Array.isArray(parsed.marketInsights?.keyLevels) ? parsed.marketInsights.keyLevels : [],
            noTradesReason: parsed.marketInsights?.noTradesReason || ''
          }
        };
      }
    } catch (parseError: any) {
      console.error('❌ Failed to parse Grok response:', parseError.message);
      result = { alerts: [], marketInsights: { summary: rawContent.substring(0, 500) } };
    }

    if (!isAdmin && cryptoUserId && pool && dbAvailable) {
      try {
        const newCreditsUsed = aiCreditsUsed + 1;
        await pool.query(
          'UPDATE crypto_subscriptions SET ai_credits = $1, updated_at = NOW() WHERE user_id = $2',
          [newCreditsUsed, cryptoUserId]
        );

        const existingCache = await pool.query(
          `SELECT id FROM crypto_ai_analyses WHERE user_id = $1 AND symbol = $2 AND interval = $3`,
          [cryptoUserId, symbol, interval]
        );

        if (existingCache.rows.length > 0) {
          await pool.query(
            `UPDATE crypto_ai_analyses 
             SET alerts = $1::jsonb, market_insights = $2::jsonb, orderflow_data = $3::jsonb, updated_at = NOW() 
             WHERE user_id = $4 AND symbol = $5 AND interval = $6`,
            [JSON.stringify(result.alerts), JSON.stringify(result.marketInsights), JSON.stringify(orderflowData || {}), cryptoUserId, symbol, interval]
          );
        } else {
          await pool.query(
            `INSERT INTO crypto_ai_analyses (id, user_id, symbol, interval, alerts, market_insights, orderflow_data, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, NOW(), NOW())`,
            [cryptoUserId, symbol, interval, JSON.stringify(result.alerts), JSON.stringify(result.marketInsights), JSON.stringify(orderflowData || {})]
          );
        }
      } catch (dbWriteError) {
        console.error('Failed to update credits/cache:', dbWriteError);
      }
    }

    try { await pool?.end(); } catch {}

    const finalCreditsRemaining = isAdmin ? 999 : Math.max(0, aiLimit - aiCreditsUsed - 1);
    console.log(`📤 Sending response with ${result.alerts.length} alerts, credits remaining: ${finalCreditsRemaining}`);
    
    // Build indicatorData for frontend display (matching server/routes.ts structure)
    const allPricesForRange = [...swingHighs.map((s: any) => s.price), ...swingLows.map((s: any) => s.price)].filter(Boolean);
    const rangeHighVal = allPricesForRange.length > 0 ? Math.max(...allPricesForRange) : currentPrice;
    const rangeLowVal = allPricesForRange.length > 0 ? Math.min(...allPricesForRange) : currentPrice;
    const priceChange = rangeLowVal > 0 ? ((currentPrice - rangeLowVal) / rangeLowVal * 100) : 0;
    
    // Extract orderflow values
    const oiData = orderflowData?.openInterest || {};
    const fundingData = orderflowData?.fundingRate || {};
    const lsData = orderflowData?.longShortRatio || {};
    
    const oiTrend = oiData.trend || 'neutral';
    const oiDelta = oiData.delta || 0;
    const fundingValue = fundingData.rate || fundingData.value || 0;
    const fundingBias = fundingData.bias || 'neutral';
    const lsRatio = lsData.ratio || lsData.value || 1.0;
    
    const indicatorDataForResponse = {
      // Market Data
      price: currentPrice,
      priceChange,
      swingHighs: swingHighs.slice(-3),
      swingLows: swingLows.slice(-3),
      volumeProfile: { poc, vah, val },
      cvd: { value: cvd, trend: cvdTrend },
      obv: { value: _obv, divergence: null },
      // Oscillators & Momentum
      rsi: { value: rsi, label: rsi > 70 ? 'OVERBOUGHT' : rsi < 30 ? 'OVERSOLD' : 'neutral' },
      macd: { 
        histogram: macdHistogram,
        crossover: 'none',
        divergence: null,
        momentum: macdHistogram > 0 ? 'bullish' : 'bearish'
      },
      cci: { value: cci, label: cci > 100 ? 'OVERBOUGHT' : cci < -100 ? 'OVERSOLD' : 'neutral' },
      stochastic: { k: stochK, d: stochD, crossover: 'none', label: stochK > 80 ? 'OVERBOUGHT' : stochK < 20 ? 'OVERSOLD' : 'neutral' },
      mfi: { value: mfi, label: mfi > 80 ? 'OVERBOUGHT' : mfi < 20 ? 'OVERSOLD' : 'neutral', divergence: null },
      cmf: { value: 0, label: 'neutral' },
      // Trend & Volatility
      adx: { value: adx, label: adx > 25 ? 'STRONG TREND' : adx < 20 ? 'weak' : 'moderate' },
      diPlusMinus: { plusDI, minusDI, momentum: plusDI > minusDI ? 'bullish' : 'bearish' },
      atr: { value: atr },
      bollingerBands: { middle: bbMiddle, upper: bbUpper, lower: bbLower, bandwidth: bbBandwidth, squeeze: bbBandwidth < 4 },
      vwap: { value: poc || currentPrice, label: 'neutral' },
      // SMC/ICT Structure
      bos: 'none',
      choch: 'none',
      displacement: { active: false, direction: null },
      // Orderflow Counts
      orderBlocks: { bullish: bullishOB.length, bearish: bearishOB.length },
      fvgs: { bullish: bullFVG.length, bearish: bearFVG.length },
      imbalances: { buy: buyImbalancesCount || 0, sell: sellImbalancesCount || 0 },
      absorption: absorption.length,
      liquidityGrabs: liquidityGrabs.length,
      // Institutional
      openInterest: { trend: oiTrend, delta: oiDelta },
      fundingRate: { value: fundingValue, bias: fundingBias },
      longShortRatio: { value: lsRatio, label: lsRatio > 1.2 ? 'longs dominant' : lsRatio < 0.8 ? 'shorts dominant' : 'balanced' }
    };
    
    res.json({
      ...result,
      cached: false,
      creditsRemaining: finalCreditsRemaining,
      indicatorData: indicatorDataForResponse
    });

  } catch (error: any) {
    const errorDetails = {
      message: error.message,
      status: error.status || error.response?.status,
      code: error.code || error.response?.data?.error?.code,
      type: error.type || error.response?.data?.error?.type,
    };
    console.error('Order flow alerts error:', JSON.stringify(errorDetails, null, 2));
    
    try { await pool?.end(); } catch {}
    
    let userMessage = 'Analysis failed';
    if (errorDetails.status === 401 || errorDetails.status === 403) {
      userMessage = 'AI service authentication error';
    } else if (errorDetails.status === 429) {
      userMessage = 'AI service rate limited - please try again later';
    } else if (errorDetails.status === 404) {
      userMessage = 'AI model unavailable';
    } else if (errorDetails.message?.includes('timeout')) {
      userMessage = 'AI service timeout - please try again';
    } else if (errorDetails.message) {
      userMessage = errorDetails.message;
    }
    
    res.status(500).json({ 
      error: userMessage,
      details: process.env.NODE_ENV === 'development' ? errorDetails : undefined,
      alerts: []
    });
  }
}

export const config = {
  maxDuration: 300,
  memory: 1024,
};
