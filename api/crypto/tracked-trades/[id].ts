import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const DEMO_USER_ID = 'demo-open-access-user';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'Trade ID required' });
  }

  try {
    const client = await pool.connect();
    
    try {
      if (req.method === 'PATCH') {
        const { status, entryHitAt, slHitAt, tpHitAt, tpHitLevel } = req.body;
        
        const updates: string[] = ['updated_at = NOW()'];
        const params: any[] = [];
        let paramIndex = 1;
        
        if (status) {
          updates.push(`status = $${paramIndex++}`);
          params.push(status);
        }
        if (entryHitAt) {
          updates.push(`entry_hit_at = $${paramIndex++}`);
          params.push(new Date(entryHitAt));
        }
        if (slHitAt) {
          updates.push(`sl_hit_at = $${paramIndex++}`);
          params.push(new Date(slHitAt));
        }
        if (tpHitAt) {
          updates.push(`tp_hit_at = $${paramIndex++}`);
          params.push(new Date(tpHitAt));
        }
        if (tpHitLevel) {
          updates.push(`tp_hit_level = $${paramIndex++}`);
          params.push(tpHitLevel);
        }
        
        params.push(id, DEMO_USER_ID);
        
        const result = await client.query(
          `UPDATE tracked_trades SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex} RETURNING *`,
          params
        );
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Trade not found' });
        }
        
        const row = result.rows[0];
        return res.json({
          id: row.id,
          userId: row.user_id,
          symbol: row.symbol,
          direction: row.direction,
          grade: row.grade,
          entry: row.entry,
          stopLoss: row.stop_loss,
          targets: row.targets,
          status: row.status,
          updatedAt: row.updated_at
        });
      }
      
      if (req.method === 'DELETE') {
        const result = await client.query(
          'DELETE FROM tracked_trades WHERE id = $1 AND user_id = $2 RETURNING *',
          [id, DEMO_USER_ID]
        );
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Trade not found' });
        }
        
        return res.json({ success: true, trade: result.rows[0] });
      }
      
      return res.status(405).json({ error: 'Method not allowed' });
      
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Tracked trade error:', error);
    return res.status(500).json({ error: error.message });
  }
}
