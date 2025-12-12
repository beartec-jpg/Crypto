import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
const ADMIN_EMAIL = 'beartec@beartec.uk';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { id } = req.query;
    
    if (req.method === 'POST') {
      const { content, responderEmail, responderName } = req.body;
      
      if (responderEmail !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'Only admin can reply to feedback' });
      }
      
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: 'Content is required' });
      }
      
      const [reply] = await sql`
        INSERT INTO feedback_board_replies (feedback_id, responder_email, responder_name, content, is_admin_reply)
        VALUES (${id as string}, ${responderEmail}, ${responderName || 'BearTec'}, ${content.trim()}, true)
        RETURNING 
          id,
          feedback_id as "feedbackId",
          responder_email as "responderEmail",
          responder_name as "responderName",
          content,
          is_admin_reply as "isAdminReply",
          created_at as "createdAt"
      `;
      
      return res.status(200).json(reply);
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Feedback reply error:', error);
    return res.status(500).json({ error: error.message });
  }
}
