import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface MarketSummaryCardProps {
  tier: 'free' | 'intermediate' | 'professional';
  grokLogo: string;
  minimized: boolean;
  onToggleMinimize: () => void;
  analysis: string | null;
  loading: boolean;
  timestamp: number | null;
  candlesLength: number;
  onRefresh: () => void;
  onUpgrade: () => void;
}

export function MarketSummaryCard({
  tier,
  grokLogo,
  minimized,
  onToggleMinimize,
  analysis,
  loading,
  timestamp,
  candlesLength,
  onRefresh,
  onUpgrade
}: MarketSummaryCardProps) {
  if (tier === 'free') {
    return (
      <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <span className="text-lg">🤖</span>
              AI Market Summary
            </CardTitle>
            <img src={grokLogo} alt="Grok" className="h-4 brightness-110" />
            <span className="ml-auto px-2 py-0.5 bg-purple-600/30 text-purple-300 text-[10px] font-semibold rounded border border-purple-500/50">
              INTERMEDIATE+
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-gray-300 bg-slate-900/50 p-3 rounded border border-slate-700/50 blur-sm select-none">
            1. **Current Trend and Momentum:** XRP/USD is currently in a bearish trend...
            <br /><br />
            2. **Key Support/Resistance Levels:** Immediate support is at $2.0838...
          </div>
          <div className="text-center py-2">
            <p className="text-sm text-gray-300 mb-3">
              Unlock AI-powered market analysis with Grok
            </p>
            <Button
              onClick={onUpgrade}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm"
              data-testid="button-upgrade-market-summary"
            >
              Upgrade to Intermediate - $15/month
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="pb-2 cursor-pointer" onClick={onToggleMinimize}>
        <div className="flex items-center gap-2">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <span className={`transition-transform duration-200 ${minimized ? '' : 'rotate-90'}`}>▶</span>
            <span className="text-lg">🤖</span>
            Market Summary
          </CardTitle>
          <img src={grokLogo} alt="Grok" className="h-4 brightness-110" />
        </div>
      </CardHeader>
      {!minimized && (
        <CardContent className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              <span className="ml-2 text-sm text-gray-400">Analyzing market...</span>
            </div>
          ) : analysis ? (
            <>
              <div className="text-xs text-gray-300 whitespace-pre-wrap bg-slate-900 p-3 rounded border border-slate-700">
                {analysis}
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-slate-700">
                <span className="italic">
                  Written with Grok
                </span>
                <span>
                  {timestamp ? new Date(timestamp).toLocaleTimeString() : '-'}
                </span>
              </div>
              <div className="text-xs text-gray-600 px-2 py-1 bg-slate-900/50 rounded border border-slate-700/50">
                <span className="opacity-75">Note: This analysis uses Grok API. We are not affiliated with or endorsed by xAI.</span>
              </div>
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); onRefresh(); }}
                className="w-full h-7 text-xs"
                disabled={loading}
              >
                Refresh Analysis
              </Button>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-xs text-gray-400 mb-2">
                {candlesLength < 100 ? 'Loading chart data...' : 'Click to analyze market conditions'}
              </p>
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); onRefresh(); }}
                className="h-7 text-xs"
                disabled={candlesLength < 100}
              >
                Generate Analysis
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
