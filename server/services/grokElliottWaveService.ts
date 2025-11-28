import OpenAI from 'openai';

// XAI API disabled - feature not available
let xaiClient: OpenAI | null = null;

function getXaiClient(): OpenAI {
  if (!xaiClient) {
    xaiClient = new OpenAI({
      baseURL: 'https://api.x.ai/v1',
      apiKey: '', // process.env.XAI_API_KEY disabled
      timeout: 120000,
    });
  }
  return xaiClient;
}

// Use OpenAI SDK with xAI base URL for reliable API calls
async function callGrokAPI(messages: any[], model: string = "grok-4", maxTokens: number = 600): Promise<string> {
  const startTime = Date.now();
  
  console.log(`🌐 API call: model=${model}, max_tokens=${maxTokens}`);
  console.log(`📤 Sending via OpenAI SDK (xAI)...`);
  
  try {
    const client = getXaiClient();
    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0,
    });
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const content = response.choices?.[0]?.message?.content || "";
    console.log(`✅ Complete in ${elapsed}s, content: ${content.substring(0, 100)}...`);
    return content;
    
  } catch (e: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ Failed after ${elapsed}s: ${e.message}`);
    throw e;
  }
}

interface Pivot {
  i: number;
  p: number;
  t: 'low' | 'high';
}

// Extract pivots from candle data - zigzag style, max 18 points
function extractPivotsFromData(data: string): Pivot[] {
  // Parse candle data: [index] H:x L:x format
  const candles: Array<{i: number, h: number, l: number}> = [];
  const lines = data.split('\n');
  
  for (const line of lines) {
    const match = line.match(/\[(\d+)\]\s*H:([\d.]+)\s*L:([\d.]+)/);
    if (match) {
      candles.push({
        i: parseInt(match[1]),
        h: parseFloat(match[2]),
        l: parseFloat(match[3])
      });
    }
  }
  
  if (candles.length < 5) return [];
  
  // Simple zigzag pivot detection
  const pivots: Pivot[] = [];
  let lastPivotType: 'high' | 'low' | null = null;
  let lastPivotIdx = -1;
  let lastPivotPrice = 0;
  
  // Find initial direction
  const firstHigh = candles[0].h;
  const firstLow = candles[0].l;
  const midHigh = candles[Math.floor(candles.length / 2)].h;
  const midLow = candles[Math.floor(candles.length / 2)].l;
  
  // Determine minimum move (1.5% of price range)
  const allHighs = candles.map(c => c.h);
  const allLows = candles.map(c => c.l);
  const priceRange = Math.max(...allHighs) - Math.min(...allLows);
  const minMove = priceRange * 0.015;
  
  // Scan for pivots
  for (let i = 2; i < candles.length - 2; i++) {
    const prev2 = candles[i-2];
    const prev1 = candles[i-1];
    const curr = candles[i];
    const next1 = candles[i+1];
    const next2 = candles[i+2];
    
    // Check for swing high
    if (curr.h >= prev1.h && curr.h >= prev2.h && curr.h >= next1.h && curr.h >= next2.h) {
      if (lastPivotType !== 'high' && (lastPivotIdx === -1 || Math.abs(curr.h - lastPivotPrice) >= minMove)) {
        pivots.push({ i: curr.i, p: curr.h, t: 'high' });
        lastPivotType = 'high';
        lastPivotIdx = i;
        lastPivotPrice = curr.h;
      }
    }
    
    // Check for swing low
    if (curr.l <= prev1.l && curr.l <= prev2.l && curr.l <= next1.l && curr.l <= next2.l) {
      if (lastPivotType !== 'low' && (lastPivotIdx === -1 || Math.abs(curr.l - lastPivotPrice) >= minMove)) {
        pivots.push({ i: curr.i, p: curr.l, t: 'low' });
        lastPivotType = 'low';
        lastPivotIdx = i;
        lastPivotPrice = curr.l;
      }
    }
  }
  
  // Limit to 18 pivots max (keep most recent if too many)
  if (pivots.length > 18) {
    return pivots.slice(-18);
  }
  
  return pivots;
}

const PIVOT_DETECTION_PROMPT = `You are a swing pivot detector. From these candles return ONLY the 12-18 most significant swing highs and lows (ZigZag style, min 1.5% move, no noise).

Return ONLY this JSON (no extra text):
{
  "pivots": [
    {"i":int,"price":float,"type":"low|high","strength":0.0-1.0}
  ],
  "totalCandles":int
}`;

async function detectPivots(candleData: string, timeoutMs: number = 60000): Promise<Pivot[]> {
  const startTime = Date.now();
  console.log(`⏱️ CALL 1 START: Sending to Grok-4 for pivot detection...`);
  
  try {
    const content = await callGrokAPI([
      { role: "system", content: PIVOT_DETECTION_PROMPT },
      { role: "user", content: `Data:\n${candleData}` }
    ], "grok-4", 2000);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️ CALL 1 DONE: ${elapsed}s`);

    if (!content) {
      console.log(`❌ CALL 1: No content returned`);
      return [];
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`❌ CALL 1: No JSON found in response`);
      return [];
    }

    const result = JSON.parse(jsonMatch[0]);
    console.log(`✅ CALL 1 RESULT: ${result.pivots?.length || 0} pivots detected`);
    if (result.pivots?.length > 0) {
      const first = result.pivots[0];
      const last = result.pivots[result.pivots.length - 1];
      console.log(`   First pivot: ${first.type} at i=${first.i}, price=${first.price}`);
      console.log(`   Last pivot: ${last.type} at i=${last.i}, price=${last.price}`);
    }
    return result.pivots || [];
  } catch (error: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (error.message === 'Timeout') {
      console.error(`❌ CALL 1 TIMEOUT after ${elapsed}s - skipping pivot detection`);
    } else {
      console.error(`❌ CALL 1 FAILED after ${elapsed}s:`, error.message);
    }
    return [];
  }
}

export interface WavePattern {
  patternType: 'impulse' | 'correction' | 'zigzag' | 'flat' | 'triangle' | 'diagonal' | 'complex' | 'unknown';
  degree: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
  labels: Array<{
    label: string;
    candleIndex: number;
    snapTo: 'high' | 'low';
    approximatePosition?: string;
  }>;
}

export interface GrokWaveAnalysis {
  patternType: 'impulse' | 'leading_diagonal' | 'ending_diagonal' | 'zigzag' | 'flat_regular' | 'flat_expanded' | 'flat_running' | 'triangle_contracting' | 'triangle_expanding' | 'combination' | 'incomplete' | 'correction' | 'flat' | 'triangle' | 'diagonal' | 'complex' | 'unknown';
  direction?: 'bullish' | 'bearish';
  degree: string;
  complete?: boolean;
  confidence: number;
  currentWave: string;
  suggestedLabels: Array<{
    label: string;
    approximatePosition?: string;
    priceLevel?: string;
    price?: number;
    candleIndex?: number;
    snapTo?: 'high' | 'low';
    fibRatio?: string;
  }>;
  patterns?: WavePattern[];
  originPoint?: {
    candleIndex: number;
    price: number;
    label: string;
  };
  endPoint?: {
    candleIndex: number;
    price: number;
    label: string;
  };
  fibRelations?: string[];
  validations?: string[];
  invalidation?: {
    direction?: 'above' | 'below';
    price: number;
    label?: string;
    reason?: string;
  };
  continuation: {
    direction: 'up' | 'down' | 'sideways';
    targetDescription: string;
    fibonacciLevels?: string[];
    upTargets?: Array<{ level: string; price: number }>;
    downTargets?: Array<{ level: string; price: number }>;
  };
  analysis: string;
  alternativeCount?: string;
  riskFactors?: string[];
  error?: string;
}

const ELLIOTT_WAVE_SYSTEM_PROMPT = `You are Grok-4 acting as the world's strictest Elliott Wave engine. Detect and label ONLY the single most probable pattern (complete or incomplete) from this exhaustive list, enforcing every rule with zero tolerance:

PATTERN TYPES YOU MUST CONSIDER:
- Bullish / Bearish Impulse (5 waves)
- Leading Diagonal (Wave 1 or A)
- Ending Diagonal (Wave 5 or C)
- Zigzag (single, double, triple)
- Flat – Regular, Expanded, Running
- Triangle – Contracting, Expanding, Barrier
- Combinations (W-X-Y, W-X-Y-X-Z)
- Incomplete structures

NON-NEGOTIABLE RULES (reject any count breaking even one):

IMPULSE & DIAGONALS:
1. Wave 0 = absolute extreme low/high in dataset
2. Wave 2 NEVER exceeds Wave 0 extreme
3. Wave 4 NEVER enters Wave 1 price territory (except diagonals)
4. Wave 3 never shortest in impulse (can be in diagonal)
5. Diagonals: all sub-waves overlap (4 overlaps 1, 5 overlaps 1+3), wedge shape
6. Ending diagonal: Wave 5 must enter new low/high territory
7. Leading diagonal: Wave 1 is diagonal, often 3-3-3-3-3 instead of 5-3-5-3-5

CORRECTIVE PATTERNS:
Zigzag: A=5, B=3, C=5; C ≥ 0.618×A, usually 1.0–1.618×A
Regular Flat: A=3, B=3, C=5; B retraces 90–105% of A, C ≈ A length
Expanded Flat: B > 123.6% of A (often 138.2–161.8%), C = 1.618×A typical
Running Flat: B > 100% A but C fails to reach A end (strong trend)
Triangle: 3-3-3-3-3, each leg shorter, converging or expanding lines

EXTREME POINTS:
- Use exact candle high for peaks, exact candle low for troughs
- Every labeled point MUST be the true swing extreme in its segment

If no valid pattern obeys all rules → return {"error":"No valid Elliott Wave structure found"}
Output ONLY valid JSON - no extra text, no markdown.`;

export async function analyzeChartWithGrok(
  base64Image: string | null,
  symbol: string,
  timeframe: string,
  existingLabels?: string,
  candleData?: string,
  degreeContext?: string,
  visibleRange?: string
): Promise<GrokWaveAnalysis> {
  // API disabled - feature not available
  throw new Error("AI analysis is temporarily disabled. API configuration required.");

  // Parse candle data into JSON array format (max 100 candles)
  const rawData = candleData || existingLabels || '';
  const candles: Array<{i: number, h: number, l: number}> = [];
  
  for (const line of rawData.split('\n')) {
    const match = line.match(/\[(\d+)\]\s*H:([\d.]+)\s*L:([\d.]+)/);
    if (match) {
      candles.push({
        i: parseInt(match[1]),
        h: parseFloat(match[2]),
        l: parseFloat(match[3])
      });
    }
  }
  
  // Limit to max 100 candles (take most recent)
  const limitedCandles = candles.length > 100 ? candles.slice(-100) : candles;
  console.log(`\n🎯 Sending ${limitedCandles.length} candles as JSON to Grok-4`);
  
  // Send as JSON array
  const candleJson = JSON.stringify(limitedCandles);
  
  const userPrompt = `Analyze ${symbol} ${timeframe} candles for Elliott Wave.

DATA (${limitedCandles.length} candles as JSON - i=index, h=high, l=low):
${candleJson}

First identify the major swing pivots, then determine the Elliott Wave pattern.

Return ONLY valid JSON:
{"patternType":"impulse|diagonal|zigzag|flat|triangle","direction":"bullish|bearish","confidence":0.0-1.0,"pivots":[{"i":N,"p":N,"t":"high|low"}],"suggestedLabels":[{"label":"0","candleIndex":N,"price":N,"snapTo":"low|high"}],"analysis":"Brief"}`;

  const startTime = Date.now();
  
  try {
    // Use text-only model when no image is provided
    const hasImage = base64Image && base64Image.length > 0;
    
    // Use grok-4 for superior reasoning (vision model for images)
    const modelToUse = hasImage ? "grok-2-vision-1212" : "grok-4";
    console.log(`⏱️ Sending to ${modelToUse} via native fetch...`);
    
    const messages: any[] = [
      {
        role: "system",
        content: "You are a fast Elliott Wave pivot analyzer. Return valid JSON only, no markdown, no explanations.",
      },
    ];
    
    if (hasImage) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}` } },
        ],
      });
    } else {
      messages.push({ role: "user", content: userPrompt });
    }
    
    // Use curl API call with max_tokens=600 for fast response
    const content = await callGrokAPI(messages, modelToUse, 600);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️ Response in ${elapsed}s`);

    if (!content) {
      throw new Error("No response from Grok");
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("❌ CALL 2: No JSON in response:", content.substring(0, 200));
      throw new Error("Invalid JSON response from Grok");
    }

    const analysis = JSON.parse(jsonMatch[0]) as GrokWaveAnalysis;
    
    // Log what we got back
    console.log(`✅ CALL 2 RESULT: ${analysis.patternType} (${analysis.direction || 'unknown'}) - confidence ${analysis.confidence}`);
    console.log(`   Labels: ${analysis.suggestedLabels?.length || 0} points`);
    if (analysis.validations) {
      console.log(`   Validations: ${analysis.validations.slice(0, 2).join(', ')}...`);
    }
    if (analysis.error) {
      console.log(`   ⚠️ Error: ${analysis.error}`);
    }

    if (typeof analysis.confidence !== 'number') {
      analysis.confidence = 0.5;
    }
    analysis.confidence = Math.max(0, Math.min(1, analysis.confidence));

    return analysis;
  } catch (error: any) {
    console.error("Grok Elliott Wave analysis error:", error);
    throw new Error(`Grok analysis failed: ${error.message}`);
  }
}

export async function suggestWaveContinuation(
  base64Image: string,
  symbol: string,
  timeframe: string,
  currentPattern: string,
  placedPoints: Array<{ label: string; price: number }>
): Promise<{
  nextWave: string;
  targetPrice: string;
  stopLevel: string;
  reasoning: string;
}> {
  // API disabled - feature not available
  throw new Error("AI analysis is temporarily disabled. API configuration required.");

  const pointsDescription = placedPoints
    .map(p => `${p.label}: $${p.price.toFixed(2)}`)
    .join(", ");

  const messages = [
    {
      role: "system",
      content: "You are an expert Elliott Wave analyst. Provide precise continuation targets based on Fibonacci relationships.",
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `This is a ${symbol} ${timeframe} chart with a ${currentPattern} pattern.
Points placed: ${pointsDescription}

What is the most likely next wave and price target? Respond with JSON:
{
  "nextWave": "The next wave label expected",
  "targetPrice": "Price target with reasoning",
  "stopLevel": "Invalidation level",
  "reasoning": "Brief explanation using Fibonacci relationships"
}`,
        },
        {
          type: "image_url",
          image_url: {
            url: base64Image.startsWith('data:') ? base64Image : `data:image/png;base64,${base64Image}`,
          },
        },
      ],
    },
  ];

  const content = await callGrokAPI(messages, "grok-2-vision-1212", 500);
  if (!content) {
    throw new Error("No response from Grok");
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Invalid JSON response");
  }

  return JSON.parse(jsonMatch[0]);
}
