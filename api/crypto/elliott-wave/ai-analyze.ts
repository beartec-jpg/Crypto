import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// 1. TIMEOUT ADJUSTMENT
const openai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
  timeout: 60000,
});

interface WavePoint {
  index: number;
  label: string;
  price: number;
}

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Helper: Compact string format to fit tokens
const formatCandlesCompact = (candles: CandleData[], offset: number) => {
  return candles
    // Time is included to link AI output indices to actual chart times
    .map((c, i) => `Idx:${offset + i} H:${c.high.toFixed(4)} L:${c.low.toFixed(4)} C:${c.close.toFixed(4)} Time:${c.time}`) 
    .join('\n');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      chartImage,
      symbol,
      timeframe,
      candles, // The raw array of visible candles
      visibleStartIndex, // Index offset
      imageBase64,
    } = req.body;

    if (!process.env.XAI_API_KEY) {
      return res.status(500).json({ error: 'XAI_API_KEY not configured' });
    }

    const candleArray: CandleData[] = candles || [];
    const chartImageData = String(chartImage || imageBase64 || '');

    // --- DYNAMIC DATA PRE-PROCESSING ---
    const relevantCandles = candleArray;
    const startIndex = typeof visibleStartIndex === 'number' ? visibleStartIndex : 0;

    if (relevantCandles.length < 10) {
      return res.status(400).json({ error: 'Not enough candle data provided (need at least 10)' });
    }

    // --- SWING POINT DETECTION (using full historical index) ---
    const swingPoints = [];
    for (let i = 2; i < relevantCandles.length - 2; i++) {
      const c = relevantCandles[i];
      const prev = relevantCandles[i - 1];
      const next = relevantCandles[i + 1];

      if (c.high > prev.high && c.high > next.high) {
        swingPoints.push({ type: 'HIGH', price: c.high, idx: startIndex + i });
      }
      if (c.low < prev.low && c.low < next.low) {
        swingPoints.push({ type: 'LOW', price: c.low, idx: startIndex + i });
      }
    }

    // --- PROMPT & MODEL CALL ---

    const systemPrompt = `You are a precision Elliott Wave engine specialized in immediate, visible trend analysis.
    
    INPUT DATA:
    1. A Chart Image (for pattern shape recognition).
    2. A Data List of "Swing Points" (Highs and Lows).
    
    STRICT RULES:
    1. **FOCUS ON VISIBLE RANGE**: Your analysis MUST be based ONLY on the price movement **visible in the chart image and the provided data subset**. Ignore any implied long-term trend outside this range.
    2. COORDINATE SYSTEM: You must map the visual waves in the image to the exact prices in the Data List.
    3. NO GUESSING: If you identify Wave 3 ending at a high, you MUST output the exact price from the provided Swing Points list that corresponds to that visual peak.
    4. VALIDATION: Wave 3 is never the shortest. Wave 2 never retraces > 100% of Wave 1.
    5. OUTPUT: Return strictly valid JSON.`;

    const userPrompt = `ANALYZE MARKET: ${symbol} (${timeframe})

STEP 1: RECOGNIZE PATTERN FROM IMAGE
Look at the chart image. Is it an Impulse (5 waves up) or Correction (ABC)?

STEP 2: MAP TO DATA
Here is the Price Data for the visible range (Candle Indices ${startIndex} to ${
      startIndex + relevantCandles.length - 1
    }).
Current Price: ${relevantCandles[relevantCandles.length - 1].close}

Valid Swing Points (Choose your Wave Labels ONLY from this list using the full historical index):
${swingPoints.map((s) => `[Candle #${s.idx}] ${s.type}: ${s.price.toFixed(4)}`).join('\n')}

Detailed Candle Data (Reference):
${formatCandlesCompact(relevantCandles, startIndex)}

REQUIRED JSON OUTPUT:
{
  "patternType": "impulse" | "correction" | "triangle",
  "degree": "Minor",
  "confidence": number (0-100),
  "analysis": "Short text explaining the visual match",
  "suggestedLabels": [
    {
      "label": "1",
      "priceLevel": number (MUST BE EXACT MATCH FROM SWING POINTS),
      "candleIndex": number (MUST MATCH SWING POINT INDEX),
      "snapTo": "high" | "low"
    }
  ],
  "continuation": {
    "direction": "up" | "down",
    "targetDescription": "Next move",
    "upTargets": [{ "level": "1.618", "price": number }],
    "downTargets": [{ "level": "0.618", "price": number }]
  }
}`;

    let messageContent: any;
    if (chartImageData.startsWith('data:image')) { 
      messageContent = [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: chartImageData, detail: 'low' } },
      ];
    } else {
      console.warn('[Grok] Chart image missing or invalid. Proceeding without image.');
      messageContent = userPrompt;
    }

    const completion = await openai.chat.completions.create({
      model: 'grok-4', 
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: messageContent },
      ],
      max_tokens: 1000,
      temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content || '';

    // --- PARSING & SANITIZATION ---
    let result: any = { confidence: 0, suggestedLabels: [] };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Sanitize confidence (0–100)
        let safeConf = parseInt(parsed.confidence) || 0;
        safeConf = Math.min(100, Math.max(0, safeConf));

        // Sanitize labels (fix price mismatch using visibleStartIndex)
        const safeLabels = (parsed.suggestedLabels || []).map((lbl: any) => {
          const targetIdx = lbl.candleIndex - startIndex;
          const candle = relevantCandles[targetIdx] || relevantCandles[relevantCandles.length - 1];

          return {
            label: lbl.label,
            candleIndex: lbl.candleIndex,
            priceLevel:
              lbl.snapTo === 'high'
                ? candle.high
                : lbl.snapTo === 'low'
                ? candle.low
                : lbl.priceLevel,
            snapTo: lbl.snapTo,
          };
        });

        result = {
          ...parsed,
          confidence: safeConf,
          suggestedLabels: safeLabels,
          timestamp: Date.now(),
        };
      } else {
        throw new Error('No JSON found');
      }
    } catch (parseError) {
      console.error('[Grok] Parse failed:', content);
      result.analysis = 'AI Analysis failed to return structured data.';
    }

    return res.json(result);
  } catch (error: any) {
    console.error('[Grok] Critical Error:', error);
    return res.status(500).json({ error: error.message || 'Analysis failed' });
  }
}
