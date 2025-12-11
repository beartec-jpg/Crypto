import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '@clerk/backend';
import pg from 'pg';

async function verifyAuth(req: VercelRequest): Promise<string | null> {
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
    return payload?.sub || null;
  } catch (error) {
    console.error('Auth verification failed:', error);
    return null;
  }
}

async function getDb() {
  const Pool = pg.Pool;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const userId = await verifyAuth(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Get ID from URL path or body
  const drawingId = req.query.id as string || req.body?.id;
  
  if (!drawingId) {
    return res.status(400).json({ error: 'Drawing ID required' });
  }

  const pool = await getDb();

  try {
    if (req.method === 'PATCH') {
      const { coordinates, style, isLocked } = req.body;
      
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      
      if (coordinates !== undefined) {
        updates.push(`coordinates = $${paramIndex++}`);
        values.push(JSON.stringify(coordinates));
      }
      if (style !== undefined) {
        updates.push(`style = $${paramIndex++}`);
        values.push(JSON.stringify(style));
      }
      if (isLocked !== undefined) {
        updates.push(`is_locked = $${paramIndex++}`);
        values.push(isLocked);
      }
      
      updates.push(`updated_at = NOW()`);
      
      values.push(drawingId);
      values.push(userId);
      
      const result = await pool.query(`
        UPDATE chart_drawings 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
        RETURNING *
      `, values);
      
      await pool.end();
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Drawing not found' });
      }
      
      return res.status(200).json(result.rows[0]);
    }
    
    if (req.method === 'DELETE') {
      await pool.query(
        'DELETE FROM chart_drawings WHERE id = $1 AND user_id = $2',
        [drawingId, userId]
      );
      
      await pool.end();
      return res.status(200).json({ success: true });
    }
    
    await pool.end();
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Chart drawing update error:', error);
    await pool.end();
    return res.status(500).json({ error: error.message });
  }
}
