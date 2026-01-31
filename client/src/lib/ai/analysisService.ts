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
    throw new Error('AI analysis failed');
  }

  return await response.json();
}

export function formatAnalysisPrompt(request: AnalysisRequest): string {
  // Format the data into a prompt for the AI
  return `Analyze ${request.symbol} on ${request.interval} timeframe...`;
}
