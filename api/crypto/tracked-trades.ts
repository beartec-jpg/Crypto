import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const DEMO_USER_ID = 'demo-open-access-user';

function mapRowToTrade(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    direction: row.direction,
    grade: row.grade,
    entry: row.entry,
    stopLoss: row.stop_loss,
    targets: row.targets || [],
    confluenceSignals: row.confluence_signals || [],
    reasoning: row.reasoning,
    status: row.status,
    entryHitAt: row.entry_hit_at,
    slHitAt: row.sl_hit_at,
    tpHitAt: row.tp_hit_at,
    tpHitLevel: row.tp_hit_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const client = await pool.connect();
    
    try {
      if (req.method === 'GET') {
        const { symbol } = req.query;
        
        let query = 'SELECT * FROM tracked_trades WHERE user_id = $1';
        const params: any[] = [DEMO_USER_ID];
        
        if (symbol) {
          query += ' AND symbol = $2';
          params.push(symbol);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const result = await client.query(query, params);
        return res.json(result.rows.map(mapRowToTrade));
      }
      
      if (req.method === 'POST') {
        const { symbol, direction, grade, entry, stopLoss, targets, confluenceSignals, reasoning } = req.body;
        
        if (!symbol || !direction || !grade || entry === undefined || stopLoss === undefined) {
          return res.status(400).json({ error: 'Missing required fields: symbol, direction, grade, entry, stopLoss' });
        }
        
        const existingResult = await client.query(
          `SELECT * FROM tracked_trades WHERE user_id = $1 AND symbol = $2 AND direction = $3 AND entry = $4 LIMIT 1`,
          [DEMO_USER_ID, symbol, direction, entry.toString()]
        );
        
        if (existingResult.rows.length > 0) {
          return res.json(mapRowToTrade(existingResult.rows[0]));
        }
        
        const targetsArray = Array.isArray(targets) ? targets.map((t: any) => t.toString()) : targets ? [targets.toString()] : [];
        const signalsArray = Array.isArray(confluenceSignals) ? confluenceSignals : [];
        
        const insertResult = await client.query(
          `INSERT INTO tracked_trades (user_id, symbol, direction, grade, entry, stop_loss, targets, confluence_signals, reasoning, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW(), NOW())
           RETURNING *`,
          [DEMO_USER_ID, symbol, direction, grade, entry.toString(), stopLoss.toString(), targetsArray, signalsArray, reasoning || null]
        );
        
        return res.json(mapRowToTrade(insertResult.rows[0]));
      }
      
      return res.status(405).json({ error: 'Method not allowed' });
      
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Tracked trades error:', error);
    return res.status(500).json({ error: error.message });
  }
}
