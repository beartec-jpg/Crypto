import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';
import OpenAI from 'openai';

const ADMIN_EMAIL = 'beartec@beartec.uk';

async function verifyAuth(req: VercelRequest): Promise<{ userId: string; email: string } | null> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.substring(7);
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return null;
    
    const payload = await verifyToken(token, { secretKey });
    if (!payload?.sub) return null;

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
    connectionTimeoutMillis: 5000,
    query_timeout: 10000
  });
  return pool;
}

function calculateRSI(bars: any[], period = 14): number {
  if (bars.length < period + 1) return 50;
  const closes = bars.map(b => b.close);
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(bars: any[]): { histogram: number; crossover: string } {
  if (bars.length < 26) return { histogram: 0, crossover: 'none' };
  const closes = bars.map(b => b.close);
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12 - ema26;
  const signalLine = calculateEMA([...Array(8).fill(macdLine), macdLine], 9);
  const histogram = macdLine - signalLine;
  const prevHistogram = histogram * 0.9;
  let crossover = 'none';
  if (histogram > 0 && prevHistogram < 0) crossover = 'bullish';
  else if (histogram < 0 && prevHistogram > 0) crossover = 'bearish';
  return { histogram, crossover };
}

function calculateEMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0;
  const multiplier = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calculateStochastic(bars: any[], kPeriod = 14, dPeriod = 3): { k: number; d: number; crossover: string } {
  if (bars.length < kPeriod) return { k: 50, d: 50, crossover: 'none' };
  const recent = bars.slice(-kPeriod);
  const currentClose = bars[bars.length - 1].close;
  const lowestLow = Math.min(...recent.map(b => b.low));
  const highestHigh = Math.max(...recent.map(b => b.high));
  const k = highestHigh === lowestLow ? 50 : ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
  const d = k * 0.9;
  let crossover = 'none';
  if (k > d && k < 25) crossover = 'bullish';
  else if (k < d && k > 75) crossover = 'bearish';
  return { k, d, crossover };
}

function calculateATR(bars: any[], period = 14): number {
  if (bars.length < period + 1) return 0;
  let atrSum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    atrSum += tr;
  }
  return atrSum / period;
}

function calculateADX(bars: any[], period = 14): number {
  if (bars.length < period * 2) return 25;
  let plusDM = 0, minusDM = 0, tr = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDM += upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM += downMove > upMove && downMove > 0 ? downMove : 0;
    tr += Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
  }
  if (tr === 0) return 25;
  const plusDI = (plusDM / tr) * 100;
  const minusDI = (minusDM / tr) * 100;
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
  return dx || 25;
}

function calculateBollingerBands(bars: any[], period = 20, stdDev = 2): { middle: number; squeeze: boolean; bandwidth: number } {
  if (bars.length < period) return { middle: bars[bars.length - 1]?.close || 0, squeeze: false, bandwidth: 0 };
  const closes = bars.slice(-period).map(b => b.close);
  const sma = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = sma + stdDev * std;
  const lower = sma - stdDev * std;
  const bandwidth = (upper - lower) / sma;
  return { middle: sma, squeeze: bandwidth < 0.02, bandwidth };
}

function calculateVWAP(bars: any[]): { vwap: number } {
  let cumVolume = 0, cumTPV = 0;
  for (const bar of bars.slice(-50)) {
    const tp = (bar.high + bar.low + bar.close) / 3;
    cumTPV += tp * bar.volume;
    cumVolume += bar.volume;
  }
  return { vwap: cumVolume > 0 ? cumTPV / cumVolume : bars[bars.length - 1]?.close || 0 };
}

function calculateOBV(bars: any[]): { obv: number } {
  let obv = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) obv += bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) obv -= bars[i].volume;
  }
  return { obv };
}

function detectBOSCHoCH(bars: any[]): { bos: number; choch: number } {
  let bos = 0, choch = 0;
  const recent = bars.slice(-50);
  for (let i = 5; i < recent.length; i++) {
    const prevHigh = Math.max(...recent.slice(i - 5, i).map(b => b.high));
    const prevLow = Math.min(...recent.slice(i - 5, i).map(b => b.low));
    if (recent[i].close > prevHigh) bos++;
    if (recent[i].close < prevLow) choch++;
  }
  return { bos, choch };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Authentication required' });

  const { email } = auth;
  const isAdmin = email === ADMIN_EMAIL;
  let pool: any = null;

  console.log('📥 Multi-TF Order flow alerts API called for:', email);

  try {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI service not configured', available: false });
    }

    const { symbol, timeframes = ['5m', '15m', '1h', '4h'] } = req.body;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    pool = await getDb();

    const userResult = await pool.query('SELECT id FROM crypto_users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      await pool.end();
      return res.status(404).json({ error: 'User not found' });
    }

    const cryptoUserId = userResult.rows[0].id;

    const subResult = await pool.query(
      'SELECT tier, ai_credits, ai_credits_reset_at FROM crypto_subscriptions WHERE user_id = $1',
      [cryptoUserId]
    );

    const subscription = subResult.rows[0];
    const tier = subscription?.tier || 'free';

    if (tier !== 'elite' && !isAdmin) {
      await pool.end();
      return res.status(403).json({ 
        error: 'Elite subscription required',
        message: 'Multi-Timeframe Analysis is an Elite-only feature.',
        requireUpgrade: true
      });
    }

    const MONTHLY_CREDITS: Record<string, number> = { free: 0, beginner: 0, intermediate: 200, pro: 400, elite: 500 };
    const aiLimit = MONTHLY_CREDITS[tier] || 0;
    let aiCreditsUsed = subscription?.ai_credits || 0;

    const now = new Date();
    const resetAt = subscription?.ai_credits_reset_at ? new Date(subscription.ai_credits_reset_at) : null;
    const shouldReset = !resetAt || (resetAt.getMonth() !== now.getMonth() || resetAt.getFullYear() !== now.getFullYear());
    
    if (shouldReset && subscription) {
      aiCreditsUsed = 0;
      await pool.query('UPDATE crypto_subscriptions SET ai_credits = 0, ai_credits_reset_at = NOW() WHERE user_id = $1', [cryptoUserId]);
    }

    const creditsRemaining = isAdmin ? 999 : (aiLimit - aiCreditsUsed);
    if (!isAdmin && creditsRemaining <= 0) {
      await pool.end();
      return res.status(403).json({ 
        error: 'No AI credits remaining',
        message: 'You have used all your monthly AI credits.',
        creditsRemaining: 0
      });
    }

    console.log(`📊 Multi-TF Analysis for ${symbol}: ${timeframes.join(', ')}`);

    const fetchBarsForTF = async (tf: string) => {
      const url = `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=500`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch ${tf} data`);
      const data = await response.json();
      return data.map((k: any) => ({
        time: k[0] / 1000,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));
    };

    const [bars5m, bars15m, bars1h, bars4h] = await Promise.all([
      fetchBarsForTF('5m'),
      fetchBarsForTF('15m'),
      fetchBarsForTF('1h'),
      fetchBarsForTF('4h')
    ]);

    const computeIndicators = (bars: any[]) => {
      const currentPrice = bars[bars.length - 1].close;
      const rsi = calculateRSI(bars, 14);
      const macd = calculateMACD(bars);
      const stoch = calculateStochastic(bars, 14, 3);
      const atr = calculateATR(bars, 14);
      const adx = calculateADX(bars);
      const bb = calculateBollingerBands(bars, 20, 2);
      const vwapCalc = calculateVWAP(bars);
      const obv = calculateOBV(bars);
      const boschoch = detectBOSCHoCH(bars);
      const recentHigh = Math.max(...bars.slice(-20).map(b => b.high));
      const recentLow = Math.min(...bars.slice(-20).map(b => b.low));

      return {
        currentPrice,
        rsi: rsi.toFixed(2),
        macd: { histogram: macd.histogram.toFixed(4), crossover: macd.crossover },
        stoch: { k: stoch.k.toFixed(2), d: stoch.d.toFixed(2), crossover: stoch.crossover },
        atr: atr.toFixed(6),
        adx: adx.toFixed(2),
        bb: { middle: bb.middle.toFixed(4), squeeze: bb.squeeze, bandwidth: (bb.bandwidth * 100).toFixed(2) },
        vwap: vwapCalc.vwap.toFixed(4),
        obv: (obv.obv / 1000000).toFixed(2) + 'M',
        bos: boschoch.bos,
        choch: boschoch.choch,
        recentHigh: recentHigh.toFixed(4),
        recentLow: recentLow.toFixed(4)
      };
    };

    const data5m = computeIndicators(bars5m);
    const data15m = computeIndicators(bars15m);
    const data1h = computeIndicators(bars1h);
    const data4h = computeIndicators(bars4h);

    const prompt = `Symbol: ${symbol} | Multi-Timeframe Analysis (5m, 15m, 1h, 4h)
You are analyzing this asset across 4 timeframes to find trades with cross-timeframe confluence.

**5-Minute Data (Scalp/Entry timing):**
- Price: $${data5m.currentPrice}, RSI: ${data5m.rsi}, MACD: ${data5m.macd.histogram}${data5m.macd.crossover !== 'none' ? ` (${data5m.macd.crossover})` : ''}
- Stochastic: %K ${data5m.stoch.k}, %D ${data5m.stoch.d}${data5m.stoch.crossover !== 'none' ? ` (${data5m.stoch.crossover})` : ''}
- ADX: ${data5m.adx}, ATR: ${data5m.atr}, BB Squeeze: ${data5m.bb.squeeze ? 'YES' : 'No'}
- VWAP: $${data5m.vwap}, OBV: ${data5m.obv}, BOS: ${data5m.bos}, CHoCH: ${data5m.choch}
- Range: $${data5m.recentLow} - $${data5m.recentHigh}

**15-Minute Data (Short-term):**
- Price: $${data15m.currentPrice}, RSI: ${data15m.rsi}, MACD: ${data15m.macd.histogram}${data15m.macd.crossover !== 'none' ? ` (${data15m.macd.crossover})` : ''}
- Stochastic: %K ${data15m.stoch.k}, %D ${data15m.stoch.d}${data15m.stoch.crossover !== 'none' ? ` (${data15m.stoch.crossover})` : ''}
- ADX: ${data15m.adx}, ATR: ${data15m.atr}, BB Squeeze: ${data15m.bb.squeeze ? 'YES' : 'No'}
- VWAP: $${data15m.vwap}, OBV: ${data15m.obv}, BOS: ${data15m.bos}, CHoCH: ${data15m.choch}
- Range: $${data15m.recentLow} - $${data15m.recentHigh}

**1-Hour Data (Medium-term):**
- Price: $${data1h.currentPrice}, RSI: ${data1h.rsi}, MACD: ${data1h.macd.histogram}${data1h.macd.crossover !== 'none' ? ` (${data1h.macd.crossover})` : ''}
- Stochastic: %K ${data1h.stoch.k}, %D ${data1h.stoch.d}${data1h.stoch.crossover !== 'none' ? ` (${data1h.stoch.crossover})` : ''}
- ADX: ${data1h.adx}, ATR: ${data1h.atr}, BB Squeeze: ${data1h.bb.squeeze ? 'YES' : 'No'}
- VWAP: $${data1h.vwap}, OBV: ${data1h.obv}, BOS: ${data1h.bos}, CHoCH: ${data1h.choch}
- Range: $${data1h.recentLow} - $${data1h.recentHigh}

**4-Hour Data (Long-term):**
- Price: $${data4h.currentPrice}, RSI: ${data4h.rsi}, MACD: ${data4h.macd.histogram}${data4h.macd.crossover !== 'none' ? ` (${data4h.macd.crossover})` : ''}
- Stochastic: %K ${data4h.stoch.k}, %D ${data4h.stoch.d}${data4h.stoch.crossover !== 'none' ? ` (${data4h.stoch.crossover})` : ''}
- ADX: ${data4h.adx}, ATR: ${data4h.atr}, BB Squeeze: ${data4h.bb.squeeze ? 'YES' : 'No'}
- VWAP: $${data4h.vwap}, OBV: ${data4h.obv}, BOS: ${data4h.bos}, CHoCH: ${data4h.choch}
- Range: $${data4h.recentLow} - $${data4h.recentHigh}

**Your Task:**
1. Provide a 2-sentence summary for EACH timeframe's bias and key observation.
2. Provide a 2-sentence overall cross-TF summary with alignment assessment.
3. Identify 1-3 best trades with CROSS-TIMEFRAME CONFLUENCE (higher TF sets bias, lower TF for timing).
4. Grade each trade A+ to C based on confluence strength.

Respond with ONLY valid JSON:
{
  "multiTFInsights": {
    "5m": { "summary": "2 sentences", "bias": "BULLISH/BEARISH/NEUTRAL", "keyLevels": ["$X", "$Y"] },
    "15m": { "summary": "2 sentences", "bias": "BULLISH/BEARISH/NEUTRAL", "keyLevels": ["$X", "$Y"] },
    "1h": { "summary": "2 sentences", "bias": "BULLISH/BEARISH/NEUTRAL", "keyLevels": ["$X", "$Y"] },
    "4h": { "summary": "2 sentences", "bias": "BULLISH/BEARISH/NEUTRAL", "keyLevels": ["$X", "$Y"] },
    "overallSummary": "2 sentences on cross-TF alignment"
  },
  "bestTrades": [
    {
      "grade": "A+/A/B/C",
      "primaryTF": "15m/1h/4h",
      "direction": "LONG/SHORT",
      "entry": "price",
      "stopLoss": "price",
      "targets": ["TP1", "TP2"],
      "confluenceSignals": ["4-6 signals with TF prefix"],
      "reasoning": "1 sentence explaining cross-TF logic"
    }
  ]
}`;

    console.log('🤖 Calling xAI Grok for multi-TF analysis...');
    const startTime = Date.now();

    const openai = new OpenAI({
      baseURL: 'https://api.x.ai/v1',
      apiKey: apiKey,
    });

    const completion = await openai.chat.completions.create({
      model: 'grok-3',
      messages: [
        { role: 'system', content: 'You are a professional crypto trader expert in multi-timeframe analysis. Higher timeframes set the bias, lower timeframes provide entry timing. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    const duration = Date.now() - startTime;
    const inputTokens = completion.usage?.prompt_tokens || 0;
    const outputTokens = completion.usage?.completion_tokens || 0;
    const estimatedCost = (inputTokens / 1_000_000 * 2) + (outputTokens / 1_000_000 * 10);

    console.log(`✅ Multi-TF analysis complete (${duration}ms, ~$${estimatedCost.toFixed(6)})`);

    let parsedResult;
    try {
      let content = completion.choices[0].message.content || '{}';
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResult = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse Grok response:', parseError);
      parsedResult = { multiTFInsights: null, bestTrades: [] };
    }

    if (!isAdmin) {
      await pool.query('UPDATE crypto_subscriptions SET ai_credits = ai_credits + 1, updated_at = NOW() WHERE user_id = $1', [cryptoUserId]);
    }

    try {
      const existingCache = await pool.query(
        `SELECT id FROM crypto_ai_analyses WHERE user_id = $1 AND symbol = $2 AND interval = 'multi-tf'`,
        [cryptoUserId, symbol]
      );

      const cacheData = {
        multiTFInsights: parsedResult.multiTFInsights,
        tradeAlerts: parsedResult.bestTrades || [],
        confluence: ''
      };

      if (existingCache.rows.length > 0) {
        await pool.query(
          `UPDATE crypto_ai_analyses SET market_insights = $1::jsonb, updated_at = NOW() WHERE user_id = $2 AND symbol = $3 AND interval = 'multi-tf'`,
          [JSON.stringify(cacheData), cryptoUserId, symbol]
        );
      } else {
        await pool.query(
          `INSERT INTO crypto_ai_analyses (id, user_id, symbol, interval, market_insights, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'multi-tf', $3::jsonb, NOW(), NOW())`,
          [cryptoUserId, symbol, JSON.stringify(cacheData)]
        );
      }
      console.log('💾 Multi-TF analysis cached for', symbol);
    } catch (cacheError) {
      console.error('Failed to cache multi-TF analysis:', cacheError);
    }

    await pool.end();

    res.json({
      success: true,
      multiTFInsights: parsedResult.multiTFInsights,
      bestTrades: parsedResult.bestTrades || [],
      cost: estimatedCost,
      tokens: { input: inputTokens, output: outputTokens },
      creditsRemaining: isAdmin ? 999 : Math.max(0, creditsRemaining - 1)
    });

  } catch (error: any) {
    console.error('❌ Multi-TF analysis error:', error);
    try { await pool?.end(); } catch {}
    res.status(500).json({ error: error.message, success: false });
  }
}
