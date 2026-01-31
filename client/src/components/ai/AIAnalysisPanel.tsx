import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface AIAnalysisResult {
  summary: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  keyLevels: { price: number; type: 'support' | 'resistance'; strength: number }[];
  tradeSetups: {
    direction: 'LONG' | 'SHORT';
    entry: number;
    stopLoss: number;
    targets: number[];
    confluence: number;
    reasoning: string;
  }[];
  timeframe: string;
  timestamp: number;
}

interface AIAnalysisPanelProps {
  symbol: string;
  interval: string;
  candles: any[];
  indicators: any;
  onRequestAnalysis: () => void;
  analysisResult?: AIAnalysisResult;
  loading: boolean;
}

export function AIAnalysisPanel({
  symbol,
  interval,
  candles,
  indicators,
  onRequestAnalysis,
  analysisResult,
  loading
}: AIAnalysisPanelProps) {
  return (
    <div className="bg-slate-900 rounded-lg p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">AI Analysis</h3>
        <Button
          onClick={onRequestAnalysis}
          disabled={loading}
          size="sm"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            'Get Analysis'
          )}
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
        </div>
      )}

      {!loading && analysisResult && (
        <div className="space-y-4">
          {/* Market Bias */}
          <div className="bg-slate-800 rounded p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400 text-sm">Market Bias</span>
              <Badge
                variant={
                  analysisResult.bias === 'BULLISH' ? 'default' :
                  analysisResult.bias === 'BEARISH' ? 'destructive' :
                  'secondary'
                }
              >
                {analysisResult.bias}
              </Badge>
            </div>
            <div className="text-white text-sm">{analysisResult.summary}</div>
            <div className="mt-2">
              <div className="text-gray-400 text-xs mb-1">
                Confidence: {(analysisResult.confidence * 100).toFixed(0)}%
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-cyan-500 h-2 rounded-full"
                  style={{ width: `${analysisResult.confidence * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Key Levels */}
          <div>
            <h4 className="text-white font-semibold mb-2">Key Levels</h4>
            <div className="space-y-2">
              {analysisResult.keyLevels.map((level, idx) => (
                <div key={idx} className="flex justify-between items-center bg-slate-800 rounded p-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${
                      level.type === 'support' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {level.type.toUpperCase()}
                    </span>
                    <span className="text-white">${level.price.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-1">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className={`w-2 h-4 rounded ${
                          i < level.strength ? 'bg-cyan-500' : 'bg-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Trade Setups */}
          <div>
            <h4 className="text-white font-semibold mb-2">Suggested Setups</h4>
            <div className="space-y-3">
              {analysisResult.tradeSetups.map((setup, idx) => (
                <div key={idx} className="bg-slate-800 rounded p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <Badge variant={setup.direction === 'LONG' ? 'default' : 'destructive'}>
                      {setup.direction}
                    </Badge>
                    <span className="text-cyan-400 text-sm">
                      Confluence: {(setup.confluence * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-400">Entry:</span>
                      <span className="text-white ml-2">${setup.entry.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Stop:</span>
                      <span className="text-white ml-2">${setup.stopLoss.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="text-xs text-gray-400">
                    Targets: {setup.targets.map(t => `$${t.toFixed(2)}`).join(', ')}
                  </div>

                  <div className="text-xs text-gray-300">{setup.reasoning}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && !analysisResult && (
        <div className="text-center py-12 text-gray-400 text-sm">
          Click "Get Analysis" to analyze current market conditions
        </div>
      )}
    </div>
  );
}
