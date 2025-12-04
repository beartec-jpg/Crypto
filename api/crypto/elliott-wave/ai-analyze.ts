import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
  timeout: 180000,
});

interface WavePoint {
  index: number;
  label: string;
  price: number;
  time: number;
  isCorrection: boolean;
  snappedToHigh?: boolean;
  fibLabel?: string;
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
      candles,
      imageBase64
    } = req.body;

    if (!process.env.XAI_API_KEY) {
      return res.status(500).json({ error: 'XAI_API_KEY not configured' });
    }

    const candleArray: CandleData[] = candles || [];
    const existingPoints: WavePoint[] = points || [];
    const chartImageData = chartImage || imageBase64 || '';
    
    const priceRange = candleArray.length > 0 ? {
      high: Math.max(...candleArray.map(c => c.high)),
      low: Math.min(...candleArray.map(c => c.low)),
      latest: candleArray[candleArray.length - 1]?.close || 0,
      range: Math.max(...candleArray.map(c => c.high)) - Math.min(...candleArray.map(c => c.low))
    } : { high: 0, low: 0, latest: 0, range: 0 };

    const trendAnalysis = candleArray.length >= 20 ? (() => {
      const first10Avg = candleArray.slice(0, 10).reduce((sum, c) => sum + c.close, 0) / 10;
      const last10Avg = candleArray.slice(-10).reduce((sum, c) => sum + c.close, 0) / 10;
      const trend = last10Avg > first10Avg * 1.02 ? 'UPTREND' : last10Avg < first10Avg * 0.98 ? 'DOWNTREND' : 'SIDEWAYS';
      return `Overall Trend: ${trend} (${((last10Avg / first10Avg - 1) * 100).toFixed(1)}% change)`;
    })() : '';

    const swingPoints = candleArray.length >= 5 ? (() => {
      const swings: { type: 'high' | 'low'; price: number; index: number }[] = [];
      for (let i = 2; i < candleArray.length - 2; i++) {
        const c = candleArray[i];
        const isSwingHigh = c.high > candleArray[i-1].high && c.high > candleArray[i-2].high && 
                           c.high > candleArray[i+1].high && c.high > candleArray[i+2].high;
        const isSwingLow = c.low < candleArray[i-1].low && c.low < candleArray[i-2].low && 
                          c.low < candleArray[i+1].low && c.low < candleArray[i+2].low;
        if (isSwingHigh) swings.push({ type: 'high', price: c.high, index: i });
        if (isSwingLow) swings.push({ type: 'low', price: c.low, index: i });
      }
      return swings.slice(-10);
    })() : [];

    const systemPrompt = `You are a world-class Elliott Wave analyst with 20+ years experience. You have been given BOTH a chart image AND structured price data - use BOTH for maximum accuracy.

HYBRID ANALYSIS APPROACH:
1. VISUAL from image: Identify overall wave structure, pattern shapes, trend channels
2. DATA from candles: Precise price levels, exact Fibonacci measurements, swing points
3. COMBINE: Cross-validate visual patterns with mathematical Fibonacci ratios

ELLIOTT WAVE RULES (MUST NEVER VIOLATE):
1. Wave 3 is NEVER the shortest impulse wave (usually extends to 161.8%-261.8%)
2. Wave 4 NEVER overlaps Wave 1's price territory (except in diagonals/triangles)
3. Wave 2 NEVER retraces more than 100% of Wave 1 (typically 50%-61.8%)
4. Wave 3 often shows the steepest slope and highest volume

PATTERN IDENTIFICATION:
- IMPULSE (12345): 5-wave motive structure, waves 1/3/5 in trend direction
- ZIGZAG (ABC): Sharp correction, 5-3-5 internal structure, C often equals A
- FLAT (ABC): Sideways correction, 3-3-5 structure, B retraces 90%+ of A
- TRIANGLE (ABCDE): Contracting/expanding, 3-3-3-3-3 structure
- DIAGONAL (12345): Wedge shape, overlapping waves 1&4, 3-3-3-3-3 or 5-3-5-3-5

FIBONACCI KEY LEVELS:
- Wave 2: 50%, 61.8%, 78.6% retracement of Wave 1
- Wave 3: 161.8%, 200%, 261.8% extension of Wave 1
- Wave 4: 23.6%, 38.2%, 50% retracement of Wave 3 (must not overlap Wave 1)
- Wave 5: 61.8%, 100%, 161.8% of Wave 1-3 net distance

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no text outside JSON structure.`;

    const userPrompt = `HYBRID ELLIOTT WAVE ANALYSIS REQUEST

MARKET: ${symbol || 'BTCUSDT'} on ${timeframe || '1h'} timeframe

${chartImageData ? '📊 CHART IMAGE PROVIDED - Use this for visual pattern recognition, trend channels, and wave structure identification.' : ''}

📈 STRUCTURED PRICE DATA (${candleArray.length} candles):
${priceRange.high > 0 ? `• Price Range: $${priceRange.low.toFixed(2)} to $${priceRange.high.toFixed(2)} (${priceRange.range.toFixed(2)} range)
• Current Price: $${priceRange.latest.toFixed(2)}
• ${trendAnalysis}` : 'No candle data provided'}

${swingPoints.length > 0 ? `🔄 DETECTED SWING POINTS (last 10):
${swingPoints.map(s => `  ${s.type.toUpperCase()} at $${s.price.toFixed(2)} (candle #${s.index})`).join('\n')}` : ''}

${existingPoints.length > 0 ? `📍 USER'S EXISTING WAVE LABELS:
${existingPoints.map(p => `  ${p.label}: $${p.price.toFixed(2)} at candle #${p.index}${p.snappedToHigh ? ' (HIGH)' : ' (LOW)'}${p.fibLabel ? ` [${p.fibLabel}]` : ''}`).join('\n')}` : 'No existing wave points - please identify the complete wave structure.'}

${candleArray.length > 0 ? `📊 RECENT OHLC DATA (last 15 candles for precise analysis):
${JSON.stringify(candleArray.slice(-15).map((c, i) => ({ 
  idx: candleArray.length - 15 + i,
  o: +c.open.toFixed(4), 
  h: +c.high.toFixed(4), 
  l: +c.low.toFixed(4), 
  c: +c.close.toFixed(4)
})))}` : ''}

${degreeContext ? `📐 DEGREE CONTEXT: ${degreeContext}` : ''}
${patternType ? `🎯 SUSPECTED PATTERN: ${patternType}` : ''}
${visibleRange ? `👁 VISIBLE RANGE: ${visibleRange}` : ''}

REQUIRED JSON RESPONSE FORMAT:
{
  "patternType": "impulse" | "correction" | "zigzag" | "flat" | "triangle" | "diagonal" | "complex",
  "degree": "Grand Supercycle" | "Supercycle" | "Cycle" | "Primary" | "Intermediate" | "Minor" | "Minute" | "Minuette" | "Subminuette",
  "confidence": 1-10 (integer),
  "currentWave": "Detailed description of where we are in the wave structure",
  "suggestedLabels": [
    { 
      "label": "0 or 1 or 2 or 3 or 4 or 5 or A or B or C or D or E", 
      "approximatePosition": "description of location",
      "priceLevel": exact_price_number,
      "candleIndex": candle_number,
      "snapTo": "high" or "low"
    }
  ],
  "originPoint": { "candleIndex": number, "price": number, "label": "0" },
  "endPoint": { "candleIndex": number, "price": number, "label": "5 or C or E" },
  "continuation": {
    "direction": "up" | "down" | "sideways",
    "targetDescription": "Detailed next wave expectation with Fib targets",
    "fibonacciLevels": ["161.8% at $X", "261.8% at $Y"],
    "upTargets": [{ "level": "161.8%", "price": number }, { "level": "261.8%", "price": number }],
    "downTargets": [{ "level": "38.2%", "price": number }, { "level": "61.8%", "price": number }]
  },
  "analysis": "Comprehensive wave count analysis explaining the structure, internal waves, and how visual pattern matches data",
  "alternativeCount": "Valid alternative wave interpretation if one exists",
  "riskFactors": ["Specific price levels that would invalidate this count", "Key warning signs to watch"]
}`;

    let messageContent: any;
    
    if (chartImageData && chartImageData.startsWith('data:image')) {
      messageContent = [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: chartImageData, detail: 'high' } }
      ];
    } else {
      messageContent = userPrompt;
    }

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: messageContent }
    ];

    console.log(`[Grok-4] Analyzing ${symbol}/${timeframe} with ${candleArray.length} candles, ${existingPoints.length} points, image: ${!!chartImageData}`);

    const completion = await openai.chat.completions.create({
      model: 'grok-2-vision-1212',
      messages,
      max_tokens: 4000,
      temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content || '';
    const modelUsed = completion.model || 'grok-2-vision-1212';
    
    console.log(`[Grok-4] Response received (${content.length} chars) from model: ${modelUsed}`);
    
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
      model: 'Grok-4 Vision',
      modelId: modelUsed,
      timestamp: Date.now(),
      hybridAnalysis: !!chartImageData && candleArray.length > 0
    };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        result = {
          patternType: parsed.patternType || 'unknown',
          degree: parsed.degree || 'Minor',
          confidence: typeof parsed.confidence === 'number' ? Math.min(10, Math.max(1, parsed.confidence)) : 0,
          currentWave: parsed.currentWave || 'Unable to determine',
          suggestedLabels: Array.isArray(parsed.suggestedLabels) ? parsed.suggestedLabels.map((lbl: any) => ({
            label: String(lbl.label || '?'),
            approximatePosition: lbl.approximatePosition || '',
            priceLevel: typeof lbl.priceLevel === 'number' ? lbl.priceLevel : parseFloat(lbl.priceLevel) || 0,
            candleIndex: typeof lbl.candleIndex === 'number' ? lbl.candleIndex : parseInt(lbl.candleIndex) || 0,
            snapTo: lbl.snapTo === 'high' || lbl.snapTo === 'low' ? lbl.snapTo : 'low'
          })) : [],
          originPoint: {
            candleIndex: parsed.originPoint?.candleIndex || 0,
            price: parsed.originPoint?.price || 0,
            label: parsed.originPoint?.label || '0'
          },
          endPoint: {
            candleIndex: parsed.endPoint?.candleIndex || 0,
            price: parsed.endPoint?.price || 0,
            label: parsed.endPoint?.label || '?'
          },
          continuation: {
            direction: ['up', 'down', 'sideways'].includes(parsed.continuation?.direction) ? parsed.continuation.direction : 'sideways',
            targetDescription: parsed.continuation?.targetDescription || 'No clear direction',
            fibonacciLevels: Array.isArray(parsed.continuation?.fibonacciLevels) ? parsed.continuation.fibonacciLevels : [],
            upTargets: Array.isArray(parsed.continuation?.upTargets) ? parsed.continuation.upTargets.map((t: any) => ({
              level: t.level || '',
              price: typeof t.price === 'number' ? t.price : parseFloat(t.price) || 0
            })) : [],
            downTargets: Array.isArray(parsed.continuation?.downTargets) ? parsed.continuation.downTargets.map((t: any) => ({
              level: t.level || '',
              price: typeof t.price === 'number' ? t.price : parseFloat(t.price) || 0
            })) : []
          },
          analysis: parsed.analysis || content,
          alternativeCount: parsed.alternativeCount || '',
          riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [],
          model: 'Grok-4 Vision',
          modelId: modelUsed,
          timestamp: Date.now(),
          hybridAnalysis: !!chartImageData && candleArray.length > 0,
          dataPoints: {
            candlesAnalyzed: candleArray.length,
            existingLabels: existingPoints.length,
            swingPointsDetected: swingPoints.length,
            imageProvided: !!chartImageData
          }
        };
        
        console.log(`[Grok-4] Parsed: ${result.patternType} pattern, ${result.confidence}/10 confidence, ${result.suggestedLabels.length} labels`);
      }
    } catch (parseError) {
      console.warn('[Grok-4] JSON parse failed, using raw content:', parseError);
      result.analysis = `Raw AI Response:\n\n${content}`;
    }

    return res.json(result);

  } catch (error: any) {
    console.error('[Grok-4] AI analyze error:', error);
    return res.status(500).json({ 
      error: error.message || 'AI analysis failed',
      patternType: 'unknown',
      confidence: 0,
      currentWave: 'Analysis error',
      analysis: `Analysis failed: ${error.message}`,
      suggestedLabels: [],
      originPoint: { candleIndex: 0, price: 0, label: '0' },
      endPoint: { candleIndex: 0, price: 0, label: '?' },
      continuation: { direction: 'sideways', targetDescription: 'Error occurred', fibonacciLevels: [], upTargets: [], downTargets: [] },
      riskFactors: ['Analysis error: ' + (error.message || 'Unknown error')],
      model: 'Grok-4 Vision',
      timestamp: Date.now()
    });
  }
}
