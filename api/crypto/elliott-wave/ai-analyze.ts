// api/crypto/elliott-wave/ai-analyze.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.XAI_API_KEY!,
  baseURL: 'https://api.x.ai/v1',
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method !== 'POST') return res.status(405).end();

  console.log('GROK TEST STARTED — Key present:', !!process.env.XAI_API_KEY);

  try {
    const completion = await openai.chat.completions.create({
      model: 'grok-4',
      messages: [{ role: 'user', content: 'Say exactly: GROK IS ALIVE' }],
      max_tokens: 20,
      temperature: 0,
    });

    const text = completion.choices[0]?.message?.content || 'no content';
    console.log('GROK SUCCESS:', text);

    return res.json({ success: true, grokSaid: text });
  } catch (error: any) {
    console.error('GROK FAILED:', error.message);
    console.error('Full error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      type: error.type,
    });
  }
}

export const config = { maxDuration: 60 };
