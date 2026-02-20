import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';
import type { Pool } from 'pg';

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

// Singleton pool for connection reuse within the same function instance
let poolInstance: Pool | null = null;

async function getDb(): Promise<Pool> {
  if (poolInstance) {
    return poolInstance;
  }

  const pg = await import('pg');
  const PoolConstructor = pg.default?.Pool || pg.Pool;
  poolInstance = new PoolConstructor({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });
  return poolInstance;
}

const DEFAULT_SETTINGS = {
  defaultTimeframe: '1h',
  chartType: 'candlestick' as const,
  sidebarCollapsed: false,
  theme: 'dark',
  lastSymbol: 'BTCUSDT',
  lastTimeframe: '1h',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { email } = auth;
  const pool = await getDb();

  try {
    // Get user ID from crypto_users
    const userResult = await pool.query(
      'SELECT id FROM crypto_users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const cryptoUserId = userResult.rows[0].id;

    if (req.method === 'GET') {
      console.log(`📥 GET /api/users/settings - userId: ${cryptoUserId}`);

      const settingsResult = await pool.query(
        `SELECT default_timeframe, chart_type, sidebar_collapsed, theme, last_symbol, last_timeframe
         FROM user_settings WHERE user_id = $1`,
        [cryptoUserId]
      );

      if (settingsResult.rows.length === 0) {
        console.log(`⚠️ No settings found for user ${cryptoUserId}, returning 404`);
        return res.status(404).json({ error: 'No settings found' });
      }

      const row = settingsResult.rows[0];
      const settings = {
        defaultTimeframe: row.default_timeframe,
        chartType: row.chart_type,
        sidebarCollapsed: row.sidebar_collapsed,
        theme: row.theme,
        lastSymbol: row.last_symbol,
        lastTimeframe: row.last_timeframe,
      };

      console.log(`✅ Settings loaded for user ${cryptoUserId}`);
      return res.json(settings);
    }

    if (req.method === 'PUT') {
      const {
        defaultTimeframe,
        chartType,
        sidebarCollapsed,
        theme,
        lastSymbol,
        lastTimeframe,
      } = req.body;

      // Validate chart type
      if (chartType !== undefined && !['candlestick', 'line', 'area'].includes(chartType)) {
        return res.status(400).json({ error: 'chartType must be one of: candlestick, line, area' });
      }

      // Load existing or use defaults
      const existingResult = await pool.query(
        `SELECT default_timeframe, chart_type, sidebar_collapsed, theme, last_symbol, last_timeframe
         FROM user_settings WHERE user_id = $1`,
        [cryptoUserId]
      );

      const existing = existingResult.rows.length > 0 ? existingResult.rows[0] : null;
      const merged = {
        defaultTimeframe: defaultTimeframe ?? existing?.default_timeframe ?? DEFAULT_SETTINGS.defaultTimeframe,
        chartType: chartType ?? existing?.chart_type ?? DEFAULT_SETTINGS.chartType,
        sidebarCollapsed: sidebarCollapsed ?? existing?.sidebar_collapsed ?? DEFAULT_SETTINGS.sidebarCollapsed,
        theme: theme ?? existing?.theme ?? DEFAULT_SETTINGS.theme,
        lastSymbol: lastSymbol ?? existing?.last_symbol ?? DEFAULT_SETTINGS.lastSymbol,
        lastTimeframe: lastTimeframe ?? existing?.last_timeframe ?? DEFAULT_SETTINGS.lastTimeframe,
      };

      console.log(`💾 PUT /api/users/settings - userId: ${cryptoUserId}`);

      await pool.query(
        `INSERT INTO user_settings (id, user_id, default_timeframe, chart_type, sidebar_collapsed, theme, last_symbol, last_timeframe, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           default_timeframe = EXCLUDED.default_timeframe,
           chart_type = EXCLUDED.chart_type,
           sidebar_collapsed = EXCLUDED.sidebar_collapsed,
           theme = EXCLUDED.theme,
           last_symbol = EXCLUDED.last_symbol,
           last_timeframe = EXCLUDED.last_timeframe,
           updated_at = NOW()`,
        [
          cryptoUserId,
          merged.defaultTimeframe,
          merged.chartType,
          merged.sidebarCollapsed,
          merged.theme,
          merged.lastSymbol,
          merged.lastTimeframe,
        ]
      );

      console.log(`✅ Settings saved for user ${cryptoUserId}`);
      return res.json(merged);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('❌ Error with user settings:', error);
    return res.status(500).json({ error: error.message || 'Failed to process user settings' });
  }
}
