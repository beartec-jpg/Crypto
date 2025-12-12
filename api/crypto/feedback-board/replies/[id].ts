import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
const ADMIN_EMAIL = 'beartec@beartec.uk';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { id } = req.query;
    
    if (req.method === 'DELETE') {
      // Parse body - Vercel may not auto-parse for DELETE
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          body = {};
        }
      }
      
      const email = body?.email;
      
      if (email !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      await sql`DELETE FROM feedback_board_replies WHERE id = ${id as string}`;
      return res.status(200).json({ success: true });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Delete reply error:', error);
    return res.status(500).json({ error: error.message });
  }
}
