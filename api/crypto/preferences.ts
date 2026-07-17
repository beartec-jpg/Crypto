import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
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
    const {
      CRYPTO_AI_HIGHER_TIMEFRAMES,
      CRYPTO_AI_LOWER_TIMEFRAMES,
      DEFAULT_CRYPTO_AI_HIGHER_TIMEFRAME,
      DEFAULT_CRYPTO_AI_LOWER_TIMEFRAME,
      normalizeCryptoAiPair,
      isValidCryptoAiPair,
    } = await import('../_lib/cryptoAiConfig.js');
    const getTickerSlotCap = (tier: string) => {
      switch (tier) {
        case 'elite':
          return 5;
        case 'pro':
          return 3;
        case 'intermediate':
          return 1;
        default:
          return 0;
      }
    };

    // Get user ID from crypto_users
    const userResult = await pool.query(
      'SELECT id FROM crypto_users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      await pool.end();
      return res.status(404).json({ error: 'User not found' });
    }

    const cryptoUserId = userResult.rows[0].id;

    if (req.method === 'GET') {
      const result = await pool.query(
        `SELECT selected_tickers, alert_grades, alert_timeframes, alert_types, 
                alerts_enabled, push_subscription, tier,
                ticker_slots, strategy_groups, scan_tickers, min_risk_reward,
                 min_confluence, ai_model_pref, ai_trader_mode, ai_higher_timeframe,
                 ai_lower_timeframe, elliott_scan_enabled
         FROM crypto_subscriptions WHERE user_id = $1`,
        [cryptoUserId]
      );

      await pool.end();

      if (result.rows.length === 0) {
        return res.json({
          selectedTickers: [],
          alertGrades: ['A+', 'A'],
          alertTimeframes: ['15m', '1h', '4h'],
          alertTypes: ['bos', 'choch', 'fvg', 'liquidation'],
          alertsEnabled: false,
          pushSubscription: null,
          tier: 'free',
          tickerSlots: 0,
          strategyGroups: ['indicator', 'smc'],
          scanTickers: [],
          minRiskReward: 1.5,
          minConfluence: 3,
          aiModelPref: 'fast',
          aiTraderMode: 'smc',
          aiHigherTimeframe: DEFAULT_CRYPTO_AI_HIGHER_TIMEFRAME,
          aiLowerTimeframe: DEFAULT_CRYPTO_AI_LOWER_TIMEFRAME,
          elliottScanEnabled: false,
        });
      }

      const row = result.rows[0];
      const tier = row.tier || 'free';
      const tickerSlots = Math.min(5, getTickerSlotCap(tier));
      const normalizedPair = normalizeCryptoAiPair(row.ai_higher_timeframe, row.ai_lower_timeframe);
      const scanTickers = Array.isArray(row.scan_tickers)
        ? Array.from(new Set(row.scan_tickers.filter(Boolean))).slice(0, tickerSlots)
        : [];
      return res.json({
        selectedTickers: row.selected_tickers || [],
        alertGrades: row.alert_grades || ['A+', 'A'],
        alertTimeframes: row.alert_timeframes || ['15m', '1h', '4h'],
        alertTypes: row.alert_types || ['bos', 'choch', 'fvg', 'liquidation'],
        alertsEnabled: row.alerts_enabled || false,
        pushSubscription: row.push_subscription || null,
        tier,
        tickerSlots,
        strategyGroups: row.strategy_groups || ['indicator', 'smc'],
        scanTickers,
        minRiskReward: row.min_risk_reward != null ? Number(row.min_risk_reward) : 1.5,
        minConfluence: row.min_confluence ?? 3,
        aiModelPref: row.ai_model_pref || 'fast',
        aiTraderMode: row.ai_trader_mode || 'smc',
        aiHigherTimeframe: normalizedPair.higherTimeframe,
        aiLowerTimeframe: normalizedPair.lowerTimeframe,
        elliottScanEnabled: row.elliott_scan_enabled || false,
      });
    }

    if (req.method === 'POST') {
      const { selectedTickers, alertGrades, alertTimeframes, alertTypes, alertsEnabled, pushSubscription,
              strategyGroups, scanTickers, minRiskReward, minConfluence, aiModelPref,
              aiTraderMode, aiHigherTimeframe, aiLowerTimeframe, elliottScanEnabled } = req.body || {};

      // Get current tier for validation
      const tierResult = await pool.query(
        'SELECT tier, ticker_slots, ai_higher_timeframe, ai_lower_timeframe FROM crypto_subscriptions WHERE user_id = $1',
        [cryptoUserId]
      );
      const tier = tierResult.rows[0]?.tier || 'free';
      const tickerSlots = Math.min(5, getTickerSlotCap(tier));

      // Tier-based limits
      const tierLimits: Record<string, { maxTickers: number; allowedAlertTypes: string[]; allowedGrades: string[]; allowedTimeframes: string[] }> = {
        free: { maxTickers: 0, allowedAlertTypes: [], allowedGrades: [], allowedTimeframes: [] },
        intermediate: { 
          maxTickers: 3, 
          allowedAlertTypes: ['bos', 'choch', 'fvg', 'liquidation', 'rsi_divergence', 'rsi_overbought', 'macd_crossover', 'stoch_cross', 'cci', 'adx'],
          allowedGrades: ['A+', 'A', 'B', 'C', 'D', 'E'],
          allowedTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d']
        },
        pro: { 
          maxTickers: 4, 
          allowedAlertTypes: ['bos', 'choch', 'fvg', 'liquidation', 'rsi_divergence', 'rsi_overbought', 'macd_crossover', 'stoch_cross', 'cci', 'adx', 'ema_cross', 'sma_alignment', 'bb_squeeze', 'vwap_cross'],
          allowedGrades: ['A+', 'A', 'B', 'C', 'D', 'E'],
          allowedTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d']
        },
        elite: { 
          maxTickers: 5, 
          allowedAlertTypes: ['bos', 'choch', 'fvg', 'liquidation', 'rsi_divergence', 'rsi_overbought', 'macd_crossover', 'stoch_cross', 'cci', 'adx', 'ema_cross', 'sma_alignment', 'bb_squeeze', 'vwap_cross', 'volume_spike', 'volume_divergence', 'obv_divergence', 'cvd_spike', 'engulfing', 'hammer_star'],
          allowedGrades: ['A+', 'A', 'B', 'C', 'D', 'E'],
          allowedTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d']
        },
      };

      const limits = tierLimits[tier as keyof typeof tierLimits] || tierLimits.free;

      // Validate ticker count
      if (selectedTickers && selectedTickers.length > limits.maxTickers) {
        await pool.end();
        return res.status(403).json({ error: `${tier} tier allows maximum ${limits.maxTickers} ticker(s). Upgrade to unlock more.` });
      }

      // Validate alert types
      if (alertTypes && alertTypes.length > 0) {
        const invalidTypes = alertTypes.filter((type: string) => !limits.allowedAlertTypes.includes(type));
        if (invalidTypes.length > 0) {
          await pool.end();
          return res.status(403).json({ error: `${tier} tier does not support alert types: ${invalidTypes.join(', ')}. Upgrade to unlock.` });
        }
      }

      // --- AI trading-desk scan preference validation ---
      const ALLOWED_STRATEGY_GROUPS = ['indicator', 'smc', 'elliott', 'divergence-master', 'mtf-confluence', 'volume-profile'];

      // Validate strategy groups
      if (strategyGroups !== undefined) {
        if (!Array.isArray(strategyGroups)) {
          await pool.end();
          return res.status(400).json({ error: 'strategyGroups must be an array.' });
        }
        const invalidGroups = strategyGroups.filter((g: string) => !ALLOWED_STRATEGY_GROUPS.includes(g));
        if (invalidGroups.length > 0) {
          await pool.end();
          return res.status(400).json({ error: `Invalid strategy groups: ${invalidGroups.join(', ')}.` });
        }
      }

      // Validate scan tickers count against the user's ticker_slots (max 5 live AI tickers)
      if (scanTickers !== undefined) {
        if (!Array.isArray(scanTickers)) {
          await pool.end();
          return res.status(400).json({ error: 'scanTickers must be an array.' });
        }
      }
      const sanitizedScanTickers = scanTickers === undefined
        ? undefined
        : Array.from(new Set(scanTickers.filter((ticker: unknown) => typeof ticker === 'string' && ticker.trim().length > 0)))
            .slice(0, tickerSlots);

      // Validate min risk/reward (numeric, sane bounds)
      let minRiskRewardValue: number | undefined;
      if (minRiskReward !== undefined) {
        minRiskRewardValue = Number(minRiskReward);
        if (!Number.isFinite(minRiskRewardValue) || minRiskRewardValue < 0 || minRiskRewardValue > 99.99) {
          await pool.end();
          return res.status(400).json({ error: 'minRiskReward must be a number between 0 and 99.99.' });
        }
      }

      // Validate min confluence (integer, sane bounds)
      let minConfluenceValue: number | undefined;
      if (minConfluence !== undefined) {
        minConfluenceValue = Number(minConfluence);
        if (!Number.isInteger(minConfluenceValue) || minConfluenceValue < 0 || minConfluenceValue > 9) {
          await pool.end();
          return res.status(400).json({ error: 'minConfluence must be an integer between 0 and 9.' });
        }
      }

      // Validate narrator model preference
      if (aiModelPref !== undefined && !['fast', 'deep'].includes(aiModelPref)) {
        await pool.end();
        return res.status(400).json({ error: "aiModelPref must be 'fast' or 'deep'." });
      }

      // Validate AI trader mode (enabled modes only; mirrors shared/aiTraderModes.ts)
      const ALLOWED_AI_TRADER_MODES = ['indicator', 'smc'];
      if (aiTraderMode !== undefined && !ALLOWED_AI_TRADER_MODES.includes(aiTraderMode)) {
        await pool.end();
        return res.status(400).json({ error: `aiTraderMode must be one of: ${ALLOWED_AI_TRADER_MODES.join(', ')}.` });
      }

      if (aiHigherTimeframe !== undefined && !(CRYPTO_AI_HIGHER_TIMEFRAMES as readonly string[]).includes(aiHigherTimeframe)) {
        await pool.end();
        return res.status(400).json({ error: `aiHigherTimeframe must be one of: ${CRYPTO_AI_HIGHER_TIMEFRAMES.join(', ')}.` });
      }

      if (aiLowerTimeframe !== undefined && !(CRYPTO_AI_LOWER_TIMEFRAMES as readonly string[]).includes(aiLowerTimeframe)) {
        await pool.end();
        return res.status(400).json({ error: `aiLowerTimeframe must be one of: ${CRYPTO_AI_LOWER_TIMEFRAMES.join(', ')}.` });
      }

      const currentPair = normalizeCryptoAiPair(
        tierResult.rows[0]?.ai_higher_timeframe,
        tierResult.rows[0]?.ai_lower_timeframe,
      );
      const nextHigher = aiHigherTimeframe ?? currentPair.higherTimeframe;
      const nextLower = aiLowerTimeframe ?? currentPair.lowerTimeframe;
      if ((aiHigherTimeframe !== undefined || aiLowerTimeframe !== undefined) && !isValidCryptoAiPair(nextHigher, nextLower)) {
        await pool.end();
        return res.status(400).json({ error: 'AI timeframe pair must be one of: 1w/1h, 1w/15m, 1d/1h, 1d/15m.' });
      }

      if (elliottScanEnabled !== undefined && typeof elliottScanEnabled !== 'boolean') {
        await pool.end();
        return res.status(400).json({ error: 'elliottScanEnabled must be a boolean.' });
      }

      // Check if subscription exists
      const existingResult = await pool.query(
        'SELECT id FROM crypto_subscriptions WHERE user_id = $1',
        [cryptoUserId]
      );

      if (existingResult.rows.length === 0) {
        // Insert new subscription
        await pool.query(
          `INSERT INTO crypto_subscriptions 
           (id, user_id, selected_tickers, alert_grades, alert_timeframes, alert_types, alerts_enabled, push_subscription, tier, ticker_slots, scan_tickers, min_risk_reward, min_confluence, ai_trader_mode, ai_higher_timeframe, ai_lower_timeframe, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'free', $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())`,
          [
            cryptoUserId,
            selectedTickers || [],
            alertGrades || ['A+', 'A'],
            alertTimeframes || ['15m', '1h', '4h'],
            alertTypes || ['bos', 'choch'],
            alertsEnabled || false,
            pushSubscription ? JSON.stringify(pushSubscription) : null,
            tickerSlots,
            sanitizedScanTickers || [],
            minRiskRewardValue ?? 1.5,
            minConfluenceValue ?? 3,
            aiTraderMode || 'smc',
            aiHigherTimeframe || DEFAULT_CRYPTO_AI_HIGHER_TIMEFRAME,
            aiLowerTimeframe || DEFAULT_CRYPTO_AI_LOWER_TIMEFRAME,
          ]
        );
      } else {
        // Update existing subscription
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (selectedTickers !== undefined) {
          updates.push(`selected_tickers = $${paramIndex++}`);
          values.push(selectedTickers);
        }
        if (alertGrades !== undefined) {
          updates.push(`alert_grades = $${paramIndex++}`);
          values.push(alertGrades);
        }
        if (alertTimeframes !== undefined) {
          updates.push(`alert_timeframes = $${paramIndex++}`);
          values.push(alertTimeframes);
        }
        if (alertTypes !== undefined) {
          updates.push(`alert_types = $${paramIndex++}`);
          values.push(alertTypes);
        }
        if (alertsEnabled !== undefined) {
          updates.push(`alerts_enabled = $${paramIndex++}`);
          values.push(alertsEnabled);
        }
        if (pushSubscription !== undefined) {
          updates.push(`push_subscription = $${paramIndex++}`);
          values.push(pushSubscription ? JSON.stringify(pushSubscription) : null);
        }
        if (strategyGroups !== undefined) {
          updates.push(`strategy_groups = $${paramIndex++}`);
          values.push(strategyGroups);
        }
        if (sanitizedScanTickers !== undefined) {
          updates.push(`scan_tickers = $${paramIndex++}`);
          values.push(sanitizedScanTickers);
        }
        if (minRiskRewardValue !== undefined) {
          updates.push(`min_risk_reward = $${paramIndex++}`);
          values.push(minRiskRewardValue);
        }
        if (minConfluence !== undefined) {
          updates.push(`min_confluence = $${paramIndex++}`);
          values.push(minConfluenceValue);
        }
        if (aiModelPref !== undefined) {
          updates.push(`ai_model_pref = $${paramIndex++}`);
          values.push(aiModelPref);
        }
        if (aiTraderMode !== undefined) {
          updates.push(`ai_trader_mode = $${paramIndex++}`);
          values.push(aiTraderMode);
        }
        if (aiHigherTimeframe !== undefined) {
          updates.push(`ai_higher_timeframe = $${paramIndex++}`);
          values.push(aiHigherTimeframe);
        }
        if (aiLowerTimeframe !== undefined) {
          updates.push(`ai_lower_timeframe = $${paramIndex++}`);
          values.push(aiLowerTimeframe);
        }
        if (elliottScanEnabled !== undefined) {
          updates.push(`elliott_scan_enabled = $${paramIndex++}`);
          values.push(elliottScanEnabled);
        }

        updates.push(`updated_at = NOW()`);
        values.push(cryptoUserId);

        const query = `UPDATE crypto_subscriptions SET ${updates.join(', ')} WHERE user_id = $${paramIndex}`;
        await pool.query(query, values);
      }

      await pool.end();
      return res.json({ success: true });
    }

    await pool.end();
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error with preferences:', error);
    try { await pool.end(); } catch {}
    return res.status(500).json({ error: error.message });
  }
}
