import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { points, patternType, symbol, timeframe } = req.body;
    
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'AI service not configured',
        message: 'XAI_API_KEY environment variable required'
      });
    }

    const openai = new OpenAI({
      baseURL: 'https://api.x.ai/v1',
      apiKey: apiKey,
    });

    const prompt = `Analyze this Elliott Wave pattern for ${symbol} on ${timeframe} timeframe.

Pattern Type: ${patternType || 'impulse'}
Wave Points: ${JSON.stringify(points?.map((p: any) => ({ price: p.price, time: new Date(p.time * 1000).toISOString() })) || [])}

Provide a brief analysis including:
1. Pattern validation
2. Potential wave count interpretation
3. Key Fibonacci levels to watch
4. Potential price targets

Keep response concise and actionable.`;

    const completion = await openai.chat.completions.create({
      model: 'grok-3-fast',
      messages: [
        {
          role: 'system',
          content: 'You are an expert Elliott Wave analyst. Provide concise, actionable trading insights based on wave patterns.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    const analysis = completion.choices[0]?.message?.content || 'Unable to generate analysis';

    res.json({
      analysis,
      model: 'grok-3-fast',
      timestamp: Date.now()
    });

  } catch (error: any) {
    console.error('Error with AI analysis:', error);
    res.status(500).json({ error: error.message });
  }
}
