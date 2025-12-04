import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
  timeout: 120000,
});

interface WavePoint {
  index: number;
  label: string;
  price: number;
  time: number;
  isCorrection: boolean;
  snappedToHigh?: boolean;
}

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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
    const { 
      chartImage, 
      candleData, 
      symbol, 
      timeframe, 
      existingLabels, 
      degreeContext, 
      visibleRange,
      points,
      patternType,
      candles
    } = req.body;

    if (!process.env.XAI_API_KEY) {
      return res.status(500).json({ error: 'XAI_API_KEY not configured' });
    }

    const candleArray: CandleData[] = candles || [];
    const existingPoints: WavePoint[] = points || [];
    
    const priceRange = candleArray.length > 0 ? {
      high: Math.max(...candleArray.map(c => c.high)),
      low: Math.min(...candleArray.map(c => c.low)),
      latest: candleArray[candleArray.length - 1]?.close || 0
    } : { high: 0, low: 0, latest: 0 };

    const systemPrompt = `You are an expert Elliott Wave analyst with deep knowledge of Ralph Nelson Elliott's wave theory. 
Analyze cryptocurrency charts for Elliott Wave patterns, identifying impulse waves (12345) and corrective waves (ABC, ABCDE).

CRITICAL RULES:
1. Wave 3 is NEVER the shortest impulse wave
2. Wave 4 must NOT overlap with Wave 1's price territory
3. Wave 2 cannot retrace more than 100% of Wave 1
4. Corrective patterns: Zigzag (5-3-5), Flat (3-3-5), Triangle (3-3-3-3-3)
5. Use Fibonacci ratios: Wave 2 typically retraces 50-61.8% of Wave 1, Wave 3 often extends to 161.8%

You MUST respond with valid JSON only. No markdown, no code blocks, no explanation outside JSON.`;

    const userPrompt = `Analyze this ${symbol || 'BTC'} chart on ${timeframe || '1h'} timeframe for Elliott Wave patterns.

${candleArray.length > 0 ? `CANDLE DATA (${candleArray.length} candles):
Price Range: $${priceRange.low.toFixed(2)} - $${priceRange.high.toFixed(2)}
Latest Price: $${priceRange.latest.toFixed(2)}
Recent 10 candles OHLC: ${JSON.stringify(candleArray.slice(-10).map(c => ({ t: c.time, o: c.open.toFixed(2), h: c.high.toFixed(2), l: c.low.toFixed(2), c: c.close.toFixed(2) })))}` : ''}

${existingPoints.length > 0 ? `EXISTING WAVE POINTS: ${JSON.stringify(existingPoints.map(p => ({ label: p.label, price: p.price, index: p.index })))}` : ''}

${degreeContext ? `DEGREE CONTEXT: ${degreeContext}` : ''}
${visibleRange ? `VISIBLE RANGE: ${visibleRange}` : ''}

Return JSON with this exact structure:
{
  "patternType": "impulse" | "correction" | "zigzag" | "flat" | "triangle" | "diagonal" | "unknown",
  "degree": "Primary" | "Intermediate" | "Minor" | "Minute" | "Minuette",
  "confidence": 1-10,
  "currentWave": "Description of current wave position",
  "suggestedLabels": [
    { "label": "0", "approximatePosition": "start of pattern", "priceLevel": 0, "candleIndex": 0, "snapTo": "low" }
  ],
  "originPoint": { "candleIndex": 0, "price": 0, "label": "0" },
  "endPoint": { "candleIndex": 0, "price": 0, "label": "5 or C" },
  "continuation": {
    "direction": "up" | "down" | "sideways",
    "targetDescription": "Expected next move",
    "fibonacciLevels": ["161.8% extension at $X"],
    "upTargets": [{ "level": "161.8%", "price": 0 }],
    "downTargets": [{ "level": "38.2% retracement", "price": 0 }]
  },
  "analysis": "Detailed wave count explanation",
  "alternativeCount": "Alternative interpretation if applicable",
  "riskFactors": ["List of invalidation levels or concerns"]
}`;

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    if (chartImage && chartImage.startsWith('data:image')) {
      messages[1] = {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: chartImage } }
        ]
      };
    }

    const completion = await openai.chat.completions.create({
      model: 'grok-3-mini',
      messages,
      max_tokens: 2000,
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content || '';
    
    let result: any = {
      patternType: 'unknown',
      degree: 'Minor',
      confidence: 0,
      currentWave: 'Unable to determine',
      suggestedLabels: [],
      originPoint: { candleIndex: 0, price: 0, label: '0' },
      endPoint: { candleIndex: 0, price: 0, label: '?' },
      continuation: {
        direction: 'sideways',
        targetDescription: 'No clear direction',
        fibonacciLevels: [],
        upTargets: [],
        downTargets: []
      },
      analysis: content,
      alternativeCount: '',
      riskFactors: [],
      model: 'grok-3-mini',
      timestamp: Date.now()
    };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        result = {
          patternType: parsed.patternType || 'unknown',
          degree: parsed.degree || 'Minor',
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
          currentWave: parsed.currentWave || 'Unable to determine',
          suggestedLabels: Array.isArray(parsed.suggestedLabels) ? parsed.suggestedLabels.map((lbl: any) => ({
            label: lbl.label || '?',
            approximatePosition: lbl.approximatePosition || '',
            priceLevel: typeof lbl.priceLevel === 'number' ? lbl.priceLevel : 0,
            candleIndex: typeof lbl.candleIndex === 'number' ? lbl.candleIndex : 0,
            snapTo: lbl.snapTo === 'high' || lbl.snapTo === 'low' ? lbl.snapTo : 'low'
          })) : [],
          originPoint: parsed.originPoint || { candleIndex: 0, price: 0, label: '0' },
          endPoint: parsed.endPoint || { candleIndex: 0, price: 0, label: '?' },
          continuation: {
            direction: parsed.continuation?.direction || 'sideways',
            targetDescription: parsed.continuation?.targetDescription || 'No clear direction',
            fibonacciLevels: Array.isArray(parsed.continuation?.fibonacciLevels) ? parsed.continuation.fibonacciLevels : [],
            upTargets: Array.isArray(parsed.continuation?.upTargets) ? parsed.continuation.upTargets : [],
            downTargets: Array.isArray(parsed.continuation?.downTargets) ? parsed.continuation.downTargets : []
          },
          analysis: parsed.analysis || content,
          alternativeCount: parsed.alternativeCount || '',
          riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [],
          model: 'grok-3-mini',
          timestamp: Date.now()
        };
      }
    } catch (parseError) {
      console.warn('JSON parse failed, using raw content:', parseError);
    }

    return res.json(result);

  } catch (error: any) {
    console.error('AI analyze error:', error);
    return res.status(500).json({ 
      error: error.message || 'AI analysis failed',
      patternType: 'unknown',
      confidence: 0,
      analysis: 'Analysis failed due to an error',
      suggestedLabels: [],
      continuation: { direction: 'sideways', targetDescription: 'Error', fibonacciLevels: [], upTargets: [], downTargets: [] },
      riskFactors: ['Analysis error occurred']
    });
  }
}
