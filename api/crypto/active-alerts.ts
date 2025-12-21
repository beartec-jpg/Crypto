import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '@clerk/backend';
import { neon } from '@neondatabase/serverless';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const clerkUserId = await verifyAuth(req);
  if (!clerkUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sql = neon(process.env.DATABASE_URL!);
  
  // Get the user's internal ID from clerk user ID
  const users = await sql`SELECT id FROM crypto_users WHERE email = (
    SELECT email FROM crypto_users WHERE id = ${clerkUserId} LIMIT 1
  ) OR id = ${clerkUserId} LIMIT 1`;
  
  if (users.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const userId = users[0].id;

  if (req.method === 'GET') {
    try {
      // Get H-Line alerts
      const hLineAlerts = await sql`
        SELECT id, symbol, coordinates, style, created_at
        FROM chart_drawings 
        WHERE user_id = ${userId}
        AND drawing_type = 'horizontal' 
        AND (style->>'alertActive')::boolean = true 
        AND ((style->>'alertTriggered')::boolean IS NULL OR (style->>'alertTriggered')::boolean = false)
        ORDER BY created_at DESC
      `;

      // Get Elliott Wave projection alerts
      const elliottAlerts = await sql`
        SELECT id, symbol, price, level_label, wave_type, created_at
        FROM saved_projection_lines 
        WHERE user_id = ${userId}
        AND alert_enabled = true 
        AND alert_triggered = false
        ORDER BY created_at DESC
      `;

      // Get AI tracked trades
      const aiTrades = await sql`
        SELECT id, symbol, direction, entry, stop_loss, targets, status, created_at
        FROM tracked_trades 
        WHERE user_id = ${userId}
        AND status IN ('pending', 'entry_hit')
        ORDER BY created_at DESC
      `;

      return res.status(200).json({
        hLineAlerts: hLineAlerts.map((a: any) => ({
          id: a.id,
          type: 'hline',
          symbol: a.symbol,
          price: a.coordinates?.points?.[0]?.price,
          label: a.style?.label || 'H-Line',
          triggered: false,
          createdAt: a.created_at,
        })),
        elliottAlerts: elliottAlerts.map((a: any) => ({
          id: a.id,
          type: 'elliott',
          symbol: a.symbol,
          price: a.price,
          label: a.level_label,
          waveType: a.wave_type,
          createdAt: a.created_at,
        })),
        aiTrades: aiTrades.map((t: any) => ({
          id: t.id,
          type: 'ai_trade',
          symbol: t.symbol,
          direction: t.direction,
          entry: t.entry,
          stopLoss: t.stop_loss,
          targets: t.targets,
          status: t.status,
          createdAt: t.created_at,
        })),
      });
    } catch (error: any) {
      console.error('Error fetching active alerts:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { alertType, alertId } = req.body;

      if (!alertType || !alertId) {
        return res.status(400).json({ error: 'Missing alertType or alertId' });
      }

      if (alertType === 'hline') {
        // Deactivate H-line alert
        await sql`
          UPDATE chart_drawings 
          SET style = style || '{"alertActive": false}'::jsonb
          WHERE id = ${alertId} AND user_id = ${userId}
        `;
      } else if (alertType === 'elliott') {
        // Disable Elliott Wave alert
        await sql`
          UPDATE saved_projection_lines 
          SET alert_enabled = false
          WHERE id = ${alertId} AND user_id = ${userId}
        `;
      } else if (alertType === 'ai_trade') {
        // Cancel AI trade tracking
        await sql`
          UPDATE tracked_trades 
          SET status = 'cancelled'
          WHERE id = ${alertId} AND user_id = ${userId}
        `;
      } else {
        return res.status(400).json({ error: 'Invalid alertType' });
      }

      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error removing alert:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
