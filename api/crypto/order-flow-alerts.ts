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
      obv: _obv = 0, obvTrend = 'neutral', mfi = 50
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
      
    const prompt = `You are a professional SMC/ICT trader with expertise in order flow analysis. Analyze ${symbol} on the ${interval} timeframe using ALL the data provided below.

**PRICE ACTION:**
- Current Price: $${currentPrice.toFixed(4)}
- Position in Range: ${rangeHigh !== rangeLow ? ((currentPrice - rangeLow) / (rangeHigh - rangeLow) * 100).toFixed(1) : 50}% (0%=low, 100%=high)
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

**MARKET STRUCTURE (Swing Pivots - 5-bar lookback):**
- Total Swing Highs: ${swingHighs.length} | Total Swing Lows: ${swingLows.length}
- Range: $${rangeLow.toFixed(4)} - $${rangeHigh.toFixed(4)}
${swingHighs.length > 0 ? `- Recent Swing Highs (newest first): ${swingHighs.slice(-15).reverse().map((sh: any) => `$${sh.price?.toFixed(4)} (${formatEventTime(sh.time)})`).join(', ')}` : '- No swing highs detected'}
${swingLows.length > 0 ? `- Recent Swing Lows (newest first): ${swingLows.slice(-15).reverse().map((sl: any) => `$${sl.price?.toFixed(4)} (${formatEventTime(sl.time)})`).join(', ')}` : '- No swing lows detected'}
- Structure: ${swingHighs.length > 0 && swingLows.length > 0 ? 
    (swingHighs[swingHighs.length - 1]?.price > (swingHighs[swingHighs.length - 2]?.price || 0) && 
     swingLows[swingLows.length - 1]?.price > (swingLows[swingLows.length - 2]?.price || 0) ? 'HIGHER HIGHS + HIGHER LOWS (Uptrend)' :
     swingHighs[swingHighs.length - 1]?.price < (swingHighs[swingHighs.length - 2]?.price || Infinity) && 
     swingLows[swingLows.length - 1]?.price < (swingLows[swingLows.length - 2]?.price || Infinity) ? 'LOWER HIGHS + LOWER LOWS (Downtrend)' :
     'MIXED (Consolidation/Range)') : 'Insufficient data'}

**SMC/ICT ORDER FLOW SIGNALS:**
- Bullish Order Blocks: ${bullishOBCount || 0}${bullishOB.length > 0 ? '\n  Recent: ' + bullishOB.slice(-3).map((ob: any) => `$${ob.low?.toFixed(4) || 'N/A'}-$${ob.high?.toFixed(4) || 'N/A'} @ ${formatEventTime(ob.time)}`).join(', ') : ''}
- Bearish Order Blocks: ${bearishOBCount || 0}${bearishOB.length > 0 ? '\n  Recent: ' + bearishOB.slice(-3).map((ob: any) => `$${ob.low?.toFixed(4) || 'N/A'}-$${ob.high?.toFixed(4) || 'N/A'} @ ${formatEventTime(ob.time)}`).join(', ') : ''}
- Bullish Fair Value Gaps: ${bullFVGCount || 0}${bullFVG.length > 0 ? '\n  Recent: ' + bullFVG.slice(-3).map((fvg: any) => `$${fvg.low?.toFixed(4) || 'N/A'}-$${fvg.high?.toFixed(4) || 'N/A'} @ ${formatEventTime(fvg.time)}`).join(', ') : ''}
- Bearish Fair Value Gaps: ${bearFVGCount || 0}${bearFVG.length > 0 ? '\n  Recent: ' + bearFVG.slice(-3).map((fvg: any) => `$${fvg.low?.toFixed(4) || 'N/A'}-$${fvg.high?.toFixed(4) || 'N/A'} @ ${formatEventTime(fvg.time)}`).join(', ') : ''}
- Buy Imbalances: ${buyImbalancesCount || 0}
- Sell Imbalances: ${sellImbalancesCount || 0}
- Absorption Events: ${absorptionCount || 0}${absorption.length > 0 ? '\n  Recent: ' + absorption.slice(-3).map((a: any) => `${a.type} @ $${a.price?.toFixed(4) || 'N/A'} (${formatEventTime(a.time)})`).join(', ') : ''}
- Hidden Divergences: ${hiddenDivergenceCount || 0}${hiddenDivergences.length > 0 ? '\n  Recent: ' + hiddenDivergences.slice(-3).map((d: any) => `${d.type} @ $${d.price?.toFixed(4) || 'N/A'} (${formatEventTime(d.time)})`).join(', ') : ''}
- Liquidity Grabs: ${liquidityGrabCount || 0}${liquidityGrabs.length > 0 ? '\n  Recent: ' + liquidityGrabs.slice(-3).map((lg: any) => `${lg.type} @ $${lg.price?.toFixed(4) || 'N/A'} (${formatEventTime(lg.time)})`).join(', ') : ''}

**ANALYSIS REQUIREMENTS:**
1. Evaluate the OVERALL market structure and bias based on ALL available data
2. Look for CONFLUENCE between multiple signals (OBs + FVGs + oscillators + orderflow)
3. Consider liquidation clusters as potential reversal zones
4. Weight more heavily: RSI extremes, MACD crosses, CVD divergences, and absorption events
5. Only suggest trades with 3+ confluence factors
6. If no high-probability setup exists, say so clearly
7. Use the timestamps to understand the SEQUENCE of events - analyze how earlier events led to later ones, and use ALL data points to determine the highest probability outcome

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
    
    let result: { alerts: any[]; marketInsights: any } = { alerts: [], marketInsights: {} };
    
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
      }
    } catch (parseError: any) {
      console.error('❌ Failed to parse Grok response:', parseError.message);
      result = { alerts: [], marketInsights: { summary: content.substring(0, 500) } };
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
    
    res.json({
      ...result,
      cached: false,
      creditsRemaining: finalCreditsRemaining
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
