import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';
import OpenAI from 'openai';

const ADMIN_EMAIL = 'beartec@beartec.uk';
const AI_MIN_RISK_REWARD_RATIO = 1.5;
const XAI_PRIMARY_MODEL = 'grok-4.5';
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

function detectFVGs(bars: any[]): { bullish: Array<{low: number; high: number}>; bearish: Array<{low: number; high: number}> } {
  const bullish: Array<{low: number; high: number}> = [];
  const bearish: Array<{low: number; high: number}> = [];
  const recent = bars.slice(-100);
  for (let i = 2; i < recent.length; i++) {
    // Bullish FVG: gap between bar[i-2].high and bar[i].low (bar[i-1] is the impulse up)
    if (recent[i].low > recent[i - 2].high) {
      bullish.push({ low: recent[i - 2].high, high: recent[i].low });
    }
    // Bearish FVG: gap between bar[i-2].low and bar[i].high (bar[i-1] is the impulse down)
    if (recent[i].high < recent[i - 2].low) {
      bearish.push({ low: recent[i].high, high: recent[i - 2].low });
    }
  }
  return { bullish: bullish.slice(-3), bearish: bearish.slice(-3) };
}

function detectOrderBlocks(bars: any[]): { bullish: Array<{low: number; high: number}>; bearish: Array<{low: number; high: number}> } {
  const bullish: Array<{low: number; high: number}> = [];
  const bearish: Array<{low: number; high: number}> = [];
  const recent = bars.slice(-100);
  for (let i = 1; i < recent.length - 3; i++) {
    const isBullishImpulse = recent[i + 1].close > recent[i].high && recent[i + 2].close > recent[i].high;
    const isBearishImpulse = recent[i + 1].close < recent[i].low && recent[i + 2].close < recent[i].low;
    // Bearish OB: last bullish candle before a bearish impulse
    if (recent[i].close > recent[i].open && isBearishImpulse) {
      bearish.push({ low: recent[i].low, high: recent[i].high });
    }
    // Bullish OB: last bearish candle before a bullish impulse
    if (recent[i].close < recent[i].open && isBullishImpulse) {
      bullish.push({ low: recent[i].low, high: recent[i].high });
    }
  }
  return { bullish: bullish.slice(-3), bearish: bearish.slice(-3) };
}

function calculateVolumeProfile(bars: any[]): { poc: number; vah: number; val: number } {
  const recent = bars.slice(-200);
  if (recent.length === 0) return { poc: 0, vah: 0, val: 0 };
  const low = Math.min(...recent.map(b => b.low));
  const high = Math.max(...recent.map(b => b.high));
  const range = high - low;
  if (range === 0) return { poc: recent[recent.length - 1].close, vah: high, val: low };
  const buckets = 50;
  const bucketSize = range / buckets;
  const volumeBuckets = new Array(buckets).fill(0);
  for (const bar of recent) {
    const startBucket = Math.floor((bar.low - low) / bucketSize);
    const endBucket = Math.min(Math.floor((bar.high - low) / bucketSize), buckets - 1);
    const barsInBucket = endBucket - startBucket + 1;
    for (let b = Math.max(0, startBucket); b <= endBucket; b++) {
      volumeBuckets[b] += bar.volume / Math.max(1, barsInBucket);
    }
  }
  const pocBucket = volumeBuckets.indexOf(Math.max(...volumeBuckets));
  const poc = low + (pocBucket + 0.5) * bucketSize;
  const totalVolume = volumeBuckets.reduce((a, b) => a + b, 0);
  const targetVolume = totalVolume * 0.7;
  let accumulated = 0;
  let vahBucket = pocBucket;
  let valBucket = pocBucket;
  let upper = pocBucket;
  let lower = pocBucket;
  while (accumulated < targetVolume && (upper < buckets - 1 || lower > 0)) {
    const upVol = upper < buckets - 1 ? volumeBuckets[upper + 1] : 0;
    const downVol = lower > 0 ? volumeBuckets[lower - 1] : 0;
    if (upVol >= downVol && upper < buckets - 1) { upper++; accumulated += upVol; vahBucket = upper; }
    else if (lower > 0) { lower--; accumulated += downVol; valBucket = lower; }
    else break;
  }
  return {
    poc,
    vah: low + (vahBucket + 1) * bucketSize,
    val: low + valBucket * bucketSize
  };
}

function detectSwingPivots(bars: any[], lookback = 5): { highs: number[]; lows: number[] } {
  const recent = bars.slice(-100);
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = lookback; i < recent.length - lookback; i++) {
    const window = recent.slice(i - lookback, i + lookback + 1);
    if (recent[i].high === Math.max(...window.map(b => b.high))) highs.push(recent[i].high);
    if (recent[i].low === Math.min(...window.map(b => b.low))) lows.push(recent[i].low);
  }
  return { highs: highs.slice(-5), lows: lows.slice(-5) };
}

async function fetchBarsForTF(symbol: string, tf: string) {
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
    volume: parseFloat(k[5]),
  }));
}

function computeIndicators(bars: any[]) {
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
  const fvgs = detectFVGs(bars);
  const obs = detectOrderBlocks(bars);
  const volProfile = calculateVolumeProfile(bars);
  const swings = detectSwingPivots(bars);
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
    poc: volProfile.poc.toFixed(4),
    vah: volProfile.vah.toFixed(4),
    val: volProfile.val.toFixed(4),
    bullFVGs: fvgs.bullish.map(f => `$${f.low.toFixed(4)}-$${f.high.toFixed(4)}`).join(' | ') || 'None',
    bearFVGs: fvgs.bearish.map(f => `$${f.low.toFixed(4)}-$${f.high.toFixed(4)}`).join(' | ') || 'None',
    bullOBs: obs.bullish.map(o => `$${o.low.toFixed(4)}-$${o.high.toFixed(4)}`).join(' | ') || 'None',
    bearOBs: obs.bearish.map(o => `$${o.low.toFixed(4)}-$${o.high.toFixed(4)}`).join(' | ') || 'None',
    swingHighs: swings.highs.map(h => `$${h.toFixed(4)}`).join(' → ') || 'None',
    swingLows: swings.lows.map(l => `$${l.toFixed(4)}`).join(' → ') || 'None',
    recentHigh: recentHigh.toFixed(4),
    recentLow: recentLow.toFixed(4)
  };
}

function buildGeneralPrompt(symbol: string, higherTimeframe: string, lowerTimeframe: string, higherData: ReturnType<typeof computeIndicators>, lowerData: ReturnType<typeof computeIndicators>) {
  const fmtTF = (label: string, d: ReturnType<typeof computeIndicators>) => `
**${label} (${label === higherTimeframe ? 'Higher TF bias' : 'Lower TF execution'}):**
- Price: $${d.currentPrice}, RSI: ${d.rsi}, MACD hist: ${d.macd.histogram}${d.macd.crossover !== 'none' ? ` (${d.macd.crossover})` : ''}
- Stoch: %K ${d.stoch.k}, %D ${d.stoch.d}${d.stoch.crossover !== 'none' ? ` (${d.stoch.crossover})` : ''} | ADX: ${d.adx} | ATR: ${d.atr}
- Volume Profile: POC $${d.poc} | VAH $${d.vah} | VAL $${d.val}
- VWAP: $${d.vwap} | OBV: ${d.obv} | BOS: ${d.bos} | CHoCH: ${d.choch}
- Bullish FVGs: ${d.bullFVGs} | Bearish FVGs: ${d.bearFVGs}
- Bullish OBs: ${d.bullOBs} | Bearish OBs: ${d.bearOBs}
- Swing Highs: ${d.swingHighs} | Swing Lows: ${d.swingLows}
- Range: $${d.recentLow} - $${d.recentHigh}`;

  return `Symbol: ${symbol} | General multi-timeframe overview
Higher timeframe: ${higherTimeframe}
Lower timeframe: ${lowerTimeframe}
${fmtTF(higherTimeframe, higherData)}
${fmtTF(lowerTimeframe, lowerData)}

Give a concise at-a-glance analysis only. Do NOT produce a trade plan, entry, stop, targets, or risk/reward.
- Higher timeframe: focus on dominant bias/trend and key levels.
- Lower timeframe: focus on momentum/structure, alignment with the higher timeframe, and nearby trigger levels.
- Keep summaries brief and actionable.

Respond with ONLY valid JSON:
{
  "multiTFInsights": {
    "${higherTimeframe}": { "summary": "1-2 sentences on higher timeframe bias/trend", "bias": "BULLISH/BEARISH/NEUTRAL", "keyLevels": ["..."] },
    "${lowerTimeframe}": { "summary": "1-2 sentences on lower timeframe momentum/structure", "bias": "BULLISH/BEARISH/NEUTRAL", "keyLevels": ["..."] },
    "overallSummary": "1-2 sentences on alignment between the two timeframes and what matters next"
  }
}`;
}

async function generateGeneralPairAnalysis(apiKey: string, symbol: string, higherTimeframe: string, lowerTimeframe: string) {
  const requestedFrames = Array.from(new Set([lowerTimeframe, higherTimeframe]));
  const barsByTimeframe = Object.fromEntries(
    await Promise.all(requestedFrames.map(async (tf) => [tf, await fetchBarsForTF(symbol, tf)]))
  ) as Record<string, any[]>;

  const lowerData = computeIndicators(barsByTimeframe[lowerTimeframe]);
  const higherData = computeIndicators(barsByTimeframe[higherTimeframe]);
  const generalPrompt = buildGeneralPrompt(symbol, higherTimeframe, lowerTimeframe, higherData, lowerData);

  const openai = new OpenAI({
    baseURL: 'https://api.x.ai/v1',
    apiKey,
    timeout: 250000,
  });

  let completion: any;
  try {
    completion = await (openai.chat.completions.create as any)({
      model: XAI_PRIMARY_MODEL,
      messages: [
        { role: 'system', content: 'You are a concise crypto market analyst. Compare the higher and lower timeframe, explain bias, momentum, structure, and key levels, and keep it lightweight. Never produce a trade plan. Always respond with valid JSON only.' },
        { role: 'user', content: generalPrompt }
      ],
      temperature: 0.2,
      max_tokens: 1200
    });
  } catch (primaryModelError: any) {
    console.warn(`⚠️ ${XAI_PRIMARY_MODEL} failed (${primaryModelError.message}), falling back to ${XAI_FALLBACK_MODEL}`);
    completion = await openai.chat.completions.create({
      model: XAI_FALLBACK_MODEL,
      messages: [
        { role: 'system', content: 'You are a concise crypto market analyst. Compare the higher and lower timeframe, explain bias, momentum, structure, and key levels, and keep it lightweight. Never produce a trade plan. Always respond with valid JSON only.' },
        { role: 'user', content: generalPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1200
    });
  }

  const inputTokens = completion.usage?.prompt_tokens || 0;
  const outputTokens = completion.usage?.completion_tokens || 0;
  const estimatedCost = (inputTokens / 1_000_000 * 2) + (outputTokens / 1_000_000 * 10);

  let multiTFInsights: any = null;
  try {
    let rawContent = extractTextContent(completion.choices[0]?.message);
    rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { multiTFInsights: null };
    multiTFInsights = parsed.multiTFInsights || null;
  } catch (parseError) {
    console.error('Failed to parse Grok response:', parseError);
  }

  return {
    multiTFInsights,
    estimatedCost,
    tokens: { input: inputTokens, output: outputTokens },
  };
}

function normaliseSnapshots(rawSnapshots: any): any[] {
  return Array.isArray(rawSnapshots) ? rawSnapshots.filter(Boolean) : [];
}

function rotateSnapshots(rawSnapshots: any, nextSnapshot: any) {
  return [nextSnapshot, ...normaliseSnapshots(rawSnapshots)].slice(0, 3);
}

export async function runGeneralPairRefresh(pool: any, apiKey: string, symbol: string, higherTimeframe: string, lowerTimeframe: string) {
  const {
    encodeCryptoAiPairInterval,
    getCryptoAiCycleSession,
    getSessionDisplayName,
  } = await import('../_lib/cryptoAiConfig.js');
  const interval = encodeCryptoAiPairInterval(higherTimeframe as any, lowerTimeframe as any);
  const generated = await generateGeneralPairAnalysis(apiKey, symbol, higherTimeframe, lowerTimeframe);
  const session = getCryptoAiCycleSession();
  const generatedAt = new Date().toISOString();
  const snapshot = {
    session,
    label: getSessionDisplayName(session),
    generatedAt,
    higherTimeframe,
    lowerTimeframe,
    multiTFInsights: generated.multiTFInsights,
    estimatedCost: generated.estimatedCost,
    tokens: generated.tokens,
  };

  const existing = await pool.query(
    `SELECT id, snapshots
     FROM crypto_scan_cache
     WHERE symbol = $1 AND interval = $2 AND mode = 'general'
     LIMIT 1`,
    [symbol, interval],
  );

  const snapshots = rotateSnapshots(existing.rows[0]?.snapshots, snapshot);
  const aiNarration = {
    multiTFInsights: generated.multiTFInsights,
    estimatedCost: generated.estimatedCost,
    tokens: generated.tokens,
    refreshedAt: generatedAt,
    session,
  };

  await pool.query(
    `INSERT INTO crypto_scan_cache (
       id, symbol, interval, mode, scores, ai_narration, higher_timeframe, lower_timeframe, snapshots, created_at, updated_at
     ) VALUES (
       gen_random_uuid(), $1, $2, 'general', '{}'::jsonb, $3::jsonb, $4, $5, $6::jsonb, NOW(), NOW()
     )
     ON CONFLICT (symbol, interval, mode)
     DO UPDATE SET
       ai_narration = EXCLUDED.ai_narration,
       higher_timeframe = EXCLUDED.higher_timeframe,
       lower_timeframe = EXCLUDED.lower_timeframe,
       snapshots = EXCLUDED.snapshots,
       updated_at = NOW()`,
    [symbol, interval, JSON.stringify(aiNarration), higherTimeframe, lowerTimeframe, JSON.stringify(snapshots)],
  );

  return {
    cached: false,
    session,
    refreshedAt: generatedAt,
    snapshots,
    multiTFInsights: generated.multiTFInsights,
    estimatedCost: generated.estimatedCost,
    tokens: generated.tokens,
  };
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
    const {
      DEFAULT_CRYPTO_AI_HIGHER_TIMEFRAME,
      DEFAULT_CRYPTO_AI_LOWER_TIMEFRAME,
      normalizeCryptoAiPair,
      encodeCryptoAiPairInterval,
      isCryptoAiCacheFresh,
    } = await import('../_lib/cryptoAiConfig.js');

    const {
      symbol,
      timeframes = ['15m', '1d'],
      higherTimeframe: requestedHigherTimeframe,
      lowerTimeframe: requestedLowerTimeframe,
      analysisType = 'deep',
      mode: requestedMode,
    } = req.body;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    const fallbackFrames = Array.isArray(timeframes) ? timeframes : [];
    const normalizedPair = normalizeCryptoAiPair(
      requestedHigherTimeframe || fallbackFrames[1] || DEFAULT_CRYPTO_AI_HIGHER_TIMEFRAME,
      requestedLowerTimeframe || fallbackFrames[0] || DEFAULT_CRYPTO_AI_LOWER_TIMEFRAME,
    );
    const lowerTimeframe = normalizedPair.lowerTimeframe;
    const higherTimeframe = normalizedPair.higherTimeframe;

    // Resolve the selected AI trader mode so multi-TF analysis uses the same lens.
    const { getAiTraderMode } = await import('../_lib/aiTraderModes.js');
    const traderMode = getAiTraderMode(requestedMode);

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

    if (tier === 'free' || tier === 'beginner') {
      await pool.end();
      return res.status(403).json({ 
        error: 'Upgrade required',
        message: 'AI Analysis is available on Intermediate, Pro, and Elite plans.',
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
    if (analysisType === 'deep' && !isAdmin && creditsRemaining <= 0) {
      await pool.end();
      return res.status(403).json({ 
        error: 'No AI credits remaining',
        message: 'You have used all your monthly AI credits.',
        creditsRemaining: 0
      });
    }

    const pairInterval = encodeCryptoAiPairInterval(higherTimeframe, lowerTimeframe);
    console.log(`📊 Multi-TF Analysis for ${symbol}: ${higherTimeframe}/${lowerTimeframe} (${analysisType})`);

    if (analysisType === 'general') {
      const cachedResult = await pool.query(
        `SELECT ai_narration, snapshots, updated_at
         FROM crypto_scan_cache
         WHERE symbol = $1 AND interval = $2 AND mode = 'general'
         LIMIT 1`,
        [symbol, pairInterval],
      );

      const cachedRow = cachedResult.rows[0];
      if (cachedRow && isCryptoAiCacheFresh(cachedRow.updated_at)) {
        const snapshots = Array.isArray(cachedRow.snapshots) ? cachedRow.snapshots : [];
        const aiNarration = typeof cachedRow.ai_narration === 'string' ? JSON.parse(cachedRow.ai_narration) : (cachedRow.ai_narration || {});
        await pool.end();
        return res.json({
          success: true,
          cached: true,
          multiTFInsights: aiNarration.multiTFInsights || null,
          bestTrades: [],
          estimatedCost: 0,
          tokens: { input: 0, output: 0 },
          creditsRemaining: isAdmin ? 999 : creditsRemaining,
          sessionBoard: {
            session: aiNarration.session || null,
            refreshedAt: cachedRow.updated_at,
            snapshots,
          },
        });
      }

      try {
        const generated = await runGeneralPairRefresh(pool, apiKey, symbol, higherTimeframe, lowerTimeframe);
        await pool.end();
        return res.json({
          success: true,
          cached: false,
          multiTFInsights: generated.multiTFInsights,
          bestTrades: [],
          estimatedCost: generated.estimatedCost,
          tokens: generated.tokens,
          creditsRemaining: isAdmin ? 999 : creditsRemaining,
          sessionBoard: {
            session: generated.session,
            refreshedAt: generated.refreshedAt,
            snapshots: generated.snapshots,
          },
        });
      } catch (generalError: any) {
        if (cachedRow) {
          const snapshots = Array.isArray(cachedRow.snapshots) ? cachedRow.snapshots : [];
          const aiNarration = typeof cachedRow.ai_narration === 'string' ? JSON.parse(cachedRow.ai_narration) : (cachedRow.ai_narration || {});
          await pool.end();
          return res.json({
            success: true,
            cached: true,
            multiTFInsights: aiNarration.multiTFInsights || null,
            bestTrades: [],
            estimatedCost: 0,
            tokens: { input: 0, output: 0 },
            creditsRemaining: isAdmin ? 999 : creditsRemaining,
            sessionBoard: {
              session: aiNarration.session || null,
              refreshedAt: cachedRow.updated_at,
              snapshots,
            },
          });
        }
        throw generalError;
      }
    }

    const requestedFrames = Array.from(new Set([lowerTimeframe, higherTimeframe]));
    const barsByTimeframe = Object.fromEntries(
      await Promise.all(
        requestedFrames.map(async (tf) => [tf, await fetchBarsForTF(symbol, tf)])
      )
    ) as Record<string, any[]>;

    const lowerData = computeIndicators(barsByTimeframe[lowerTimeframe]);
    const higherData = computeIndicators(barsByTimeframe[higherTimeframe]);

    const fmtTF = (label: string, d: ReturnType<typeof computeIndicators>) => `
**${label} (${label === higherTimeframe ? 'Higher TF bias' : 'Lower TF execution'}):**
- Price: $${d.currentPrice}, RSI: ${d.rsi}, MACD hist: ${d.macd.histogram}${d.macd.crossover !== 'none' ? ` (${d.macd.crossover})` : ''}
- Stoch: %K ${d.stoch.k}, %D ${d.stoch.d}${d.stoch.crossover !== 'none' ? ` (${d.stoch.crossover})` : ''} | ADX: ${d.adx} | ATR: ${d.atr}
- Volume Profile: POC $${d.poc} | VAH $${d.vah} | VAL $${d.val}
- VWAP: $${d.vwap} | OBV: ${d.obv} | BOS: ${d.bos} | CHoCH: ${d.choch}
- Bullish FVGs: ${d.bullFVGs} | Bearish FVGs: ${d.bearFVGs}
- Bullish OBs: ${d.bullOBs} | Bearish OBs: ${d.bearOBs}
- Swing Highs: ${d.swingHighs} | Swing Lows: ${d.swingLows}
- Range: $${d.recentLow} - $${d.recentHigh}`;
    const htfBiasScore = (() => {
      let score = 0;
      const higherRsi = parseFloat(higherData.rsi);
      const lowerRsi = parseFloat(lowerData.rsi);
      if (higherRsi > 55) score += 2;
      else if (higherRsi < 45) score -= 2;
      if (lowerRsi > 55) score += 1;
      else if (lowerRsi < 45) score -= 1;
      if (parseFloat(higherData.macd.histogram) > 0) score += 2;
      else if (parseFloat(higherData.macd.histogram) < 0) score -= 2;
      if (parseFloat(lowerData.macd.histogram) > 0) score += 1;
      else if (parseFloat(lowerData.macd.histogram) < 0) score -= 1;
      return score;
    })();
    const dominantBias = htfBiasScore >= 2 ? 'BULLISH' : htfBiasScore <= -2 ? 'BEARISH' : 'NEUTRAL';

    const generalPrompt = `Symbol: ${symbol} | General multi-timeframe overview
Higher timeframe: ${higherTimeframe}
Lower timeframe: ${lowerTimeframe}
${fmtTF(higherTimeframe, higherData)}
${fmtTF(lowerTimeframe, lowerData)}

Give a concise at-a-glance analysis only. Do NOT produce a trade plan, entry, stop, targets, or risk/reward.
- Higher timeframe: focus on dominant bias/trend and key levels.
- Lower timeframe: focus on momentum/structure, alignment with the higher timeframe, and nearby trigger levels.
- Keep summaries brief and actionable.

Respond with ONLY valid JSON:
{
  "multiTFInsights": {
    "${higherTimeframe}": { "summary": "1-2 sentences on higher timeframe bias/trend", "bias": "BULLISH/BEARISH/NEUTRAL", "keyLevels": ["..."] },
    "${lowerTimeframe}": { "summary": "1-2 sentences on lower timeframe momentum/structure", "bias": "BULLISH/BEARISH/NEUTRAL", "keyLevels": ["..."] },
    "overallSummary": "1-2 sentences on alignment between the two timeframes and what matters next"
  }
}`;

    const deepPrompt = `Symbol: ${symbol} | Multi-timeframe trade search
Dominant bias from ${higherTimeframe}: ${dominantBias}
${fmtTF(higherTimeframe, higherData)}
${fmtTF(lowerTimeframe, lowerData)}

**TRADE SEARCH RULES — MANDATORY**
1. ${higherTimeframe} sets the directional bias; ${lowerTimeframe} is for entry timing and execution.
2. Every setup must align with the higher timeframe unless bias is NEUTRAL and the setup is exceptional.
3. ENTRY: must be at a concrete structural/indicator level appropriate to the selected trader mode — never a blind entry at current price.
4. STOP LOSS: behind the invalidation structure with ATR as a guide.
5. TARGETS: level-to-level, with TP1 at the nearest opposing level and TP2 at the next major level.
6. Only include trades with R/R ≥ ${AI_MIN_RISK_REWARD_RATIO} to TP1.
7. If no valid trade exists, return an empty bestTrades array and explain why in overallSummary.

Respond with ONLY valid JSON:
{
  "multiTFInsights": {
    "${higherTimeframe}": { "summary": "2 sentences on higher timeframe bias/trend", "bias": "BULLISH/BEARISH/NEUTRAL", "keyLevels": ["..."] },
    "${lowerTimeframe}": { "summary": "2 sentences on lower timeframe momentum/structure", "bias": "BULLISH/BEARISH/NEUTRAL", "keyLevels": ["..."] },
    "overallSummary": "2 sentences on cross-timeframe alignment and whether a trade is actionable now"
  },
  "bestTrades": [
    {
      "grade": "A+/A/B/C",
      "primaryTF": "${lowerTimeframe}/${higherTimeframe}",
      "direction": "LONG/SHORT",
      "entryZone": "FVG/OB/indicator trigger zone",
      "entry": "exact entry price",
      "stopLoss": "exact SL price",
      "slRationale": "why that invalidation level matters",
      "targets": ["TP1 price", "TP2 price"],
      "tp1Rationale": "nearest opposing level",
      "tp2Rationale": "next major target level",
      "confluenceSignals": ["signal1", "signal2", "signal3"],
      "riskRewardRatio": 2.1,
      "reasoning": "why the setup is valid now"
    }
  ]
}`;

    console.log(`🤖 Calling xAI ${XAI_PRIMARY_MODEL} (thinking enabled) for multi-TF analysis...`);
    const startTime = Date.now();

    const openai = new OpenAI({
      baseURL: 'https://api.x.ai/v1',
      apiKey: apiKey,
      timeout: 250000,
    });

    let completion: any;
    const systemContent = analysisType === 'general'
      ? `You are a concise crypto market analyst. Compare the higher and lower timeframe, explain bias, momentum, structure, and key levels, and keep it lightweight. Never produce a trade plan. Always respond with valid JSON only.`
      : `${traderMode.systemPrompt}\n\nYou are working in ${traderMode.label} mode across multiple timeframes. Apply this mode's validity criteria: ${traderMode.validityCriteria}\n\nHigher timeframes set the bias; lower timeframes provide entry timing. Every entry needs a concrete justification appropriate to this mode — never a blind "enter at current price". Always respond with valid JSON only.`;
    try {
      completion = await (openai.chat.completions.create as any)({
        model: XAI_PRIMARY_MODEL,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: analysisType === 'general' ? generalPrompt : deepPrompt }
        ],
        ...(analysisType === 'general' ? {} : { thinking: { type: 'enabled', budget_tokens: XAI_THINKING_BUDGET } }),
        temperature: analysisType === 'general' ? 0.2 : 1,
        max_tokens: analysisType === 'general' ? 1200 : 16000
      });
    } catch (primaryModelError: any) {
      console.warn(`⚠️ ${XAI_PRIMARY_MODEL} failed (${primaryModelError.message}), falling back to ${XAI_FALLBACK_MODEL}`);
      completion = await openai.chat.completions.create({
        model: XAI_FALLBACK_MODEL,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: analysisType === 'general' ? generalPrompt : deepPrompt }
        ],
        temperature: 0.3,
        max_tokens: analysisType === 'general' ? 1200 : 8000
      });
    }

    const duration = Date.now() - startTime;
    const inputTokens = completion.usage?.prompt_tokens || 0;
    const outputTokens = completion.usage?.completion_tokens || 0;
    const estimatedCost = (inputTokens / 1_000_000 * 2) + (outputTokens / 1_000_000 * 10);

    console.log(`✅ Multi-TF analysis complete (${duration}ms, ~$${estimatedCost.toFixed(6)})`);

    let parsedResult: { multiTFInsights: any; bestTrades: any[] };
    try {
      let rawContent = extractTextContent(completion.choices[0]?.message);
      rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { multiTFInsights: null, bestTrades: [] };

      const rawTrades = Array.isArray(parsed.bestTrades) ? parsed.bestTrades : [];
      const filteredTrades = analysisType === 'general'
      ? []
      : rawTrades
          .map((t: any) => {
            const entryNum = parseFloat(String(t.entry).replace(/[^0-9.-]/g, '')) || 0;
            const slNum = parseFloat(String(t.stopLoss).replace(/[^0-9.-]/g, '')) || 0;
            const tp1Num = parseFloat(String(t.targets?.[0]).replace(/[^0-9.-]/g, '')) || 0;
            const risk = Math.abs(entryNum - slNum);
            const reward = Math.abs(tp1Num - entryNum);
            const rr = risk > 0 && reward > 0 ? reward / risk : 0;
            return { ...t, riskRewardRatio: parseFloat(rr.toFixed(2)), _rr: rr };
          })
          .filter((t: any) => t._rr >= AI_MIN_RISK_REWARD_RATIO)
          .map(({ _rr, ...t }: any) => t);

      parsedResult = { multiTFInsights: parsed.multiTFInsights || null, bestTrades: filteredTrades };
    } catch (parseError) {
      console.error('Failed to parse Grok response:', parseError);
      parsedResult = { multiTFInsights: null, bestTrades: [] };
    }

    if (analysisType === 'deep' && !isAdmin) {
      await pool.query('UPDATE crypto_subscriptions SET ai_credits = ai_credits + 1, updated_at = NOW() WHERE user_id = $1', [cryptoUserId]);
    }

    if (analysisType === 'deep') {
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
    }

    await pool.end();

    res.json({
      success: true,
      multiTFInsights: parsedResult.multiTFInsights,
      bestTrades: parsedResult.bestTrades || [],
      estimatedCost,
      tokens: { input: inputTokens, output: outputTokens },
      creditsRemaining: analysisType === 'deep'
        ? (isAdmin ? 999 : Math.max(0, creditsRemaining - 1))
        : creditsRemaining
    });

  } catch (error: any) {
    console.error('❌ Multi-TF analysis error:', error);
    try { await pool?.end(); } catch {}
    res.status(500).json({ error: error.message, success: false });
  }
}

export const config = {
  maxDuration: 300,
  memory: 1024,
};
