// api/crypto/elliott-wave/ai-analyze.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.XAI_API_KEY!,
  baseURL: 'https://api.x.ai/v1',
  timeout: 120000,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  console.log('BACKEND HIT — PAYLOAD RECEIVED');

  try {
    const { chartImage, symbol = 'BTCUSDT', timeframe = '1h' } = req.body;

    if (!process.env.XAI_API_KEY) {
      return res.status(500).json({ error: 'XAI_API_KEY missing' });
    }

    // Fix: Define chartImageData BEFORE using it
    const chartImageData = chartImage ? String(chartImage) : null;

    if (!chartImageData || !chartImageData.startsWith('data:image')) {
      console.warn('No valid image — falling back to text-only mode');
      return res.json({
        patternType: 'impulse',
        confidence: 10,
        analysis: 'No screenshot received — text-only mode not implemented yet',
        suggestedLabels: [],
        continuation: { direction: 'unknown', targetDescription: 'Need chart image' },
      });
    }

    console.log('Image received — size:', (chartImageData.length / 1024 / 1024).toFixed(2), 'MB');

    const completion = await openai.chat.completions.create({
      model: 'grok-4',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `Analyze this ${symbol} ${timeframe} chart for Elliott Wave pattern. Return valid JSON with patternType, confidence, suggestedLabels (with candleIndex and priceLevel), and continuation targets.` },
            { type: 'image_url', image_url: { url: chartImageData } },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0,
    });

    const content = completion.choices[0]?.message?.content || '';
    console.log('GROK RESPONSE:', content);

    // Extract JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Grok response');

    const result = JSON.parse(jsonMatch[0]);
    return res.json(result);

  } catch (error: any) {
    console.error('GROK FAILED:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
    });
  }
}

export const config = {
  maxDuration: 800,
  memory: 2048,
};
