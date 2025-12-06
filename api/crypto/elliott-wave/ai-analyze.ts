import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
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

  // === DUMMY MODE (FOR TESTING) ===
  if (req.query.dummy === '1' || req.body.dummy) {
    console.log('DUMMY MODE ACTIVE — Skipping Grok, returning fake response');
    return res.json({
      patternType: 'impulse',
      degree: 'Primary',
      confidence: 92,
      currentWave: 'In Wave 3 of 3',
      analysis: 'This is a test run using dummy candle data. Everything works!',
      suggestedLabels: [
        { label: '1', candleIndex: 2, priceLevel: 2.05, snapTo: 'high' },
        { label: '2', candleIndex: 5, priceLevel: 2.00, snapTo: 'low' },
        { label: '3', candleIndex: 9, priceLevel: 2.17, snapTo: 'high' },
      ],
      continuation: {
        direction: 'up',
        targetDescription: 'Wave 5 targeting 2.30+',
        upTargets: [{ level: '100%', price: 2.30 }],
      },
    });
  }

  try {
    const { chartImage, symbol = 'BTCUSDT', timeframe = '1h', candles = [], visibleStartIndex = 0 } = req.body;

    console.log('Image present:', !!chartImage);
    if (chartImage) {
      console.log('Screenshot size:', (String(chartImage).length / 1024 / 1024, 'MB');
    }

    if (!process.env.XAI_API_KEY) return res.status(500).json({ error: 'XAI key missing' });
    if (candles.length < 10) return res.status(400).json({ error: 'Need ≥10 candles' });

    // Use image if sent, otherwise text-only
    const hasImage = chartImage && String(chartImage).startsWith('data:image');
    const messageContent = hasImage
      ? [{ type: 'text', text: `Analyze this ${symbol} ${timeframe} chart for Elliott Wave pattern` }, { type: 'image_url', image_url: { url: chartImage } }]
      : `Analyze this ${symbol} ${timeframe} price data for Elliott Wave pattern:\n${JSON.stringify(candles.slice(-20))}`;

    console.log('Calling Grok-4...');
    const completion = await openai.chat.completions.create({
      model: 'grok-4',
      messages: [
        { role: 'system', content: 'Return valid JSON only. Analyze Elliott Wave pattern.' },
        { role: 'user', content: messageContent },
      ],
      max_tokens: 1000,
      temperature: 0,
    });

    const content = completion.choices[0]?.message?.content || '';
    console.log('Grok raw response:', content);

    // Simple JSON extraction
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const result = JSON.parse(jsonMatch[0]);
    return res.json(result);

  } catch (error: any) {
    console.error('GROK ERROR:', error.message);
    return res.status(500).json({ error: 'Grok failed', details: error.message });
  }
}

// THIS WAS THE MISSING LINE — NOW ADDED
export const config = {
  maxDuration: 800,
  memory: 2048,
};
