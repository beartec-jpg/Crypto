import { AIAnalysisResult } from '@/components/ai/AIAnalysisPanel';

export interface AnalysisRequest {
  symbol: string;
  interval: string;
  candles: any[];
  indicators: any;
  smc: {
    fvgs: any[];
    orderBlocks: any[];
    bos: any[];
    choch: any[];
  };
}

export async function requestAIAnalysis(
  request: AnalysisRequest,
  apiKey: string
): Promise<AIAnalysisResult> {
  const response = await fetch('/api/ai/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Failed to parse error response');
    throw new Error(`AI analysis failed (${response.status}): ${errorText}`);
  }

  return await response.json();
}

export function formatAnalysisPrompt(request: AnalysisRequest): string {
  const { symbol, interval, candles, indicators, smc } = request;
  
  // Format recent price action
  const recentCandles = candles.slice(-50);
  const priceData = recentCandles.map(c => 
    `${new Date(c.time).toISOString()}: O=${c.open.toFixed(2)} H=${c.high.toFixed(2)} L=${c.low.toFixed(2)} C=${c.close.toFixed(2)} V=${c.volume.toFixed(0)}`
  ).join('\n');
  
  // Format SMC structures
  const fvgSummary = smc.fvgs.length > 0 ? `FVGs: ${smc.fvgs.length} zones detected` : 'No FVGs';
  const obSummary = smc.orderBlocks.length > 0 ? `Order Blocks: ${smc.orderBlocks.length} zones` : 'No Order Blocks';
  const bosChochSummary = `BOS: ${smc.bos.length}, CHoCH: ${smc.choch.length}`;
  
  return `Analyze ${symbol} on ${interval} timeframe:

Recent Price Action (last 50 candles):
${priceData}

Smart Money Concepts:
- ${fvgSummary}
- ${obSummary}
- ${bosChochSummary}

Technical Indicators:
${indicators ? JSON.stringify(indicators, null, 2) : 'Not available'}

Please provide:
1. Market bias (BULLISH/BEARISH/NEUTRAL) with confidence level
2. Key support and resistance levels with strength ratings
3. Potential trade setups with entry, stop loss, and targets
4. Reasoning based on price action and SMC structures`;
}
