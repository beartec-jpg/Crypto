import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';

const INTERVAL_MS: Record<string, number> = {
  '1m': 60 * 1000,
  '3m': 3 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

// Verify user authentication from Clerk token
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

// Database connection
async function getDb() {
  const pg = await import('pg');
  const Pool = pg.default?.Pool || pg.Pool;
  const pool = new (Pool as any)({ connectionString: process.env.DATABASE_URL });
  return pool;
}

// Check if user has Elliott Wave access (elite tier OR Elliott add-on)
async function _hasElliottAccess(userId: string): Promise<boolean> {
  let pool: any = null;
  try {
    pool = await getDb();
    
    const result = await pool.query(
      `SELECT tier, has_elliott_addon FROM crypto_subscriptions WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return false;
    }
    
    const { tier, has_elliott_addon } = result.rows[0];
    return tier === 'elite' || has_elliott_addon === true;
  } catch (error) {
    console.error('Error checking Elliott access:', error);
    return false;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Allow unauthenticated access - chart viewing is free
    // Premium features (drawing, AI analysis) are checked on the frontend
    const auth = await verifyAuth(req);
    if (auth) {
      console.log(`📊 Authenticated user: ${auth.userId}`);
    } else {
      console.log('📊 Anonymous access - chart viewing allowed');
    }

    const { symbol, timeframe, endTime: endTimeParam, limit: limitParam } = req.query;
    
    if (!symbol || !timeframe) {
      return res.status(400).json({ error: 'Symbol and timeframe are required' });
    }

    const symbolStr = (symbol as string).toUpperCase().replace('-USD', 'USDT').replace('-', '');
    const intervalStr = timeframe as string;
    
    const binanceInterval = intervalStr === '3m' ? '3m' : 
                           intervalStr === '5m' ? '5m' :
                           intervalStr === '15m' ? '15m' :
                           intervalStr === '30m' ? '30m' :
                           intervalStr === '1h' ? '1h' :
                           intervalStr === '2h' ? '2h' :
                           intervalStr === '4h' ? '4h' :
                           intervalStr === '6h' ? '6h' :
                           intervalStr === '12h' ? '12h' :
                           intervalStr === '1d' ? '1d' :
                           intervalStr === '1w' ? '1w' : '1h';

    const candlesNeeded = limitParam ? Math.min(parseInt(limitParam as string, 10), 1000) : 600;
    const intervalMs = INTERVAL_MS[binanceInterval] || 60 * 60 * 1000;
    const endTime = endTimeParam ? parseInt(endTimeParam as string, 10) * 1000 : Date.now();
    const startTime = endTime - (candlesNeeded * intervalMs);

    console.log(`📊 Fetching extended history: ${symbolStr} ${binanceInterval} for user ${auth?.userId || 'anonymous'}`);

    const allCandles: any[] = [];
    let currentEnd = endTime;

    while (currentEnd > startTime && allCandles.length < candlesNeeded) {
      const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbolStr}&interval=${binanceInterval}&limit=1000&endTime=${currentEnd}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Binance API error: ${response.status}`, errorText);
        throw new Error(`Binance API error: ${response.status}`);
      }
      
      const klines = await response.json();
      
      if (!klines.length) break;
      
      const candles = klines.map((k: any[]) => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));
      
      allCandles.unshift(...candles);
      
      currentEnd = klines[0][0] - 1;
      
      if (klines.length < 1000) break;
    }

    const uniqueCandles = allCandles
      .filter((candle, index, arr) => 
        index === arr.findIndex(c => c.time === candle.time)
      )
      .sort((a, b) => a.time - b.time)
      .slice(-candlesNeeded);

    res.json({
      symbol: symbolStr,
      timeframe: intervalStr,
      candleCount: uniqueCandles.length,
      startTime: uniqueCandles.length > 0 ? uniqueCandles[0].time : null,
      endTime: uniqueCandles.length > 0 ? uniqueCandles[uniqueCandles.length - 1].time : null,
      candles: uniqueCandles,
    });

  } catch (error: any) {
    console.error('Error fetching extended history:', error);
    res.status(500).json({ error: error.message });
  }
}
