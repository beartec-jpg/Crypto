import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const posts = await sql`
        SELECT * FROM feedback_board 
        ORDER BY created_at DESC
      `;
      
      const postsWithReplies = await Promise.all(
        posts.map(async (post) => {
          const replies = await sql`
            SELECT * FROM feedback_board_replies 
            WHERE feedback_id = ${post.id}
            ORDER BY created_at ASC
          `;
          return { ...post, replies };
        })
      );
      
      return res.status(200).json(postsWithReplies);
    }
    
    if (req.method === 'POST') {
      const { content, userEmail, userName } = req.body;
      
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: 'Content is required' });
      }
      
      const [post] = await sql`
        INSERT INTO feedback_board (user_email, user_name, content)
        VALUES (${userEmail || null}, ${userName || null}, ${content.trim()})
        RETURNING *
      `;
      
      return res.status(200).json(post);
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Feedback board error:', error);
    return res.status(500).json({ error: error.message });
  }
}
