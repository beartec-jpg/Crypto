import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      return res.json([]);
    }
    
    if (req.method === 'POST') {
      const label = req.body;
      return res.json({ 
        ...label, 
        id: `label_${Date.now()}`,
        message: 'Label saved (stateless mode - not persisted)' 
      });
    }
    
    if (req.method === 'PATCH') {
      return res.json({ 
        message: 'Label updated (stateless mode - not persisted)' 
      });
    }
    
    if (req.method === 'DELETE') {
      return res.json({ 
        message: 'Label deleted (stateless mode - not persisted)' 
      });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error: any) {
    console.error('Error with Elliott Wave labels:', error);
    res.status(500).json({ error: error.message });
  }
}
