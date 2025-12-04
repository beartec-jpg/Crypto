import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// 1. TIMEOUT ADJUSTMENT
// Vercel Hobby functions time out at 10s-60s. 
// We lower this to fail fast if Grok hangs, rather than hanging the browser.
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

// Helper: Compact string format to fit 100+ candles in context easily
const formatCandlesCompact = (candles: CandleData[], offset: number) => {
  return candles.map((c, i) => {
    // Only show High/Low/Close to save tokens - that's all Elliott Wave needs
    return `Idx:${offset + i} H:${c.high.toFixed(4)} L:${c.low.toFixed(4)} C:${c.close.toFixed(4)}`;
  }).join('\n');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
      candles, // The raw array of candles
      imageBase64
    } = req.body;

    if (!process.env.XAI_API_KEY) {
      return res.status(500).json({ error: 'XAI_API_KEY not configured' });
    }

    const candleArray: CandleData[] = candles || [];
    const chartImageData = chartImage || imageBase64 || '';
    
    // 2. DATA PRE-PROCESSING (The Fix)
    // We take the last 100 candles to give the AI the full picture
    const analysisWindow = 100;
    const relevantCandles = candleArray.slice(-analysisWindow); 
    const startIndex = Math.max(0, candleArray.length - analysisWindow);

    if (relevantCandles.length < 10) {
      return res.status(400).json({ error: "Not enough candle data provided (need at least 10)" });
    }

    // 3. IDENTIFY HARD ANCHORS
    // We calculate Swing Highs/Lows here using code.
    // We feed this list to the AI and say "You MUST pick a price from this list".
    const swingPoints = [];
    for(let i = 2; i < relevantCandles.length - 2; i++) {
        const c = relevantCandles[i];
        const prev = relevantCandles[i-1]; const next = relevantCandles[i+1];
        // Simple pivot detection
        if (c.high > prev.high && c.high > next.high) {
            swingPoints.push({ type: 'HIGH', price: c.high, idx: startIndex + i });
        }
        if (c.low < prev.low && c.low < next.low) {
            swingPoints.push({ type: 'LOW', price: c.low, idx: startIndex + i });
        }
    }

    // 4. THE PROMPT (Revised for accuracy)
    const systemPrompt = `You are a precision Elliott Wave engine. 
    
    INPUT DATA:
    1. A Chart Image (for pattern shape recognition).
    2. A Data List of "Swing Points" (Highs and Lows).
    
    STRICT RULES:
    1. COORDINATE SYSTEM: You must map the visual waves in the image to the exact prices in the Data List.
    2. NO GUESSING: If you identify Wave 3 ending at a high, you MUST output the exact price from the provided Swing Points list that corresponds to that visual peak.
    3. VALIDATION: Wave 3 is never the shortest. Wave 2 never retraces > 100% of Wave 1.
    4. OUTPUT: Return strictly valid JSON.`;

    const userPrompt = `ANALYZE MARKET: ${symbol} (${timeframe})

    STEP 1: RECOGNIZE PATTERN FROM IMAGE
    Look at the chart image. Is it an Impulse (5 waves up) or Correction (ABC)?

    STEP 2: MAP TO DATA
    Here is the Price Data for the visible range. 
    Current Price: ${relevantCandles[relevantCandles.length - 1].close}
    
    Valid Swing Points (Choose your Wave Labels ONLY from this list):
    ${swingPoints.map(s => `[Candle #${s.idx}] ${s.type}: ${s.price.toFixed(4)}`).join('\n')}

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
          "snapTo": "high" or "low"
        }
        // ... repeat for other waves
      ],
       "continuation": {
        "direction": "up" | "down",
        "targetDescription": "Next move",
        "upTargets": [{ "level": "1.618", "price": number }],
        "downTargets": [{ "level": "0.618", "price": number }]
      }
    }`;

    let messageContent: any;
    if (chartImageData && chartImageData.startsWith('data:image')) {
      messageContent = [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: chartImageData, detail: 'low' } } // 'low' is faster and usually sufficient for macro patterns
      ];
    } else {
      messageContent = userPrompt;
    }

    console.log(`[Grok] Analyzing ${relevantCandles.length} candles...`);

    const completion = await openai.chat.completions.create({
      model: 'grok-2-vision-1212',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: messageContent }
      ],
      max_tokens: 1000, // Reduced from 4000 to improve speed
      temperature: 0.1, // Lower temperature = less hallucinations
    });

    const content = completion.choices[0]?.message?.content || '';
    
    // 5. PARSING & SANITIZATION
    let result: any = { confidence: 0, suggestedLabels: [] };
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Sanitize Confidence (Fixing the 700% issue)
        let safeConf = parseInt(parsed.confidence) || 0;
        if (safeConf > 100) safeConf = 100; 
        if (safeConf < 0) safeConf = 0;

        // Sanitize Labels (Fixing the price mismatch)
        const safeLabels = (parsed.suggestedLabels || []).map((lbl: any) => {
            // Find closest real candle if index is slightly off
            const targetIdx = lbl.candleIndex - startIndex;
            const candle = relevantCandles[targetIdx] || relevantCandles[relevantCandles.length - 1];
            
            return {
                label: lbl.label,
                candleIndex: lbl.candleIndex,
                // Force snap to High or Low of the actual candle
                priceLevel: lbl.snapTo === 'high' ? candle.high : 
                            lbl.snapTo === 'low' ? candle.low : 
                            lbl.priceLevel,
                snapTo: lbl.snapTo
            };
        });

        result = {
            ...parsed,
            confidence: safeConf,
            suggestedLabels: safeLabels,
            timestamp: Date.now()
        };
      } else {
          throw new Error("No JSON found");
      }
    } catch (parseError) {
      console.error('[Grok] Parse failed:', content);
      result.analysis = "AI Analysis failed to return structured data.";
    }

    return res.json(result);

  } catch (error: any) {
    console.error('[Grok] Critical Error:', error);
    return res.status(500).json({ error: error.message || 'Analysis failed' });
  }
}
