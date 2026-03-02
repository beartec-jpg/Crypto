import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Candle, CVDDataItem } from '@/types/chart';
import type { PatternBacktestReport } from '@/lib/backtest/patternBacktest';
import { runPatternBacktest, generateBacktestReport } from '@/lib/backtest/patternBacktest';

interface PatternBacktestPanelProps {
  candles: Candle[];
  cvdData: CVDDataItem[];
}

export function PatternBacktestPanel({ candles, cvdData }: PatternBacktestPanelProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<PatternBacktestReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRunBacktest() {
    setIsRunning(true);
    setError(null);
    setProgress(0);

    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      const result = await runPatternBacktest(
        {
          candles,
          cvdData,
          startDate,
          endDate,
          activationThreshold: 70,
          forwardLookPeriods: [4, 8, 12, 24, 48],
        },
        (current, total) => {
          setProgress((current / total) * 100);
        }
      );

      setReport(result);
      console.log(generateBacktestReport(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backtest failed');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Card className="bg-slate-900 border-slate-700 p-4 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-lg font-semibold text-white">🧪 Pattern Backtest Engine</h4>
          <p className="text-xs text-slate-400 mt-1">
            Validate pattern detection accuracy using 30 days of historical data
          </p>
        </div>
        <Button
          onClick={handleRunBacktest}
          disabled={isRunning || candles.length < 100}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isRunning ? 'Running...' : 'Run Backtest'}
        </Button>
      </div>

      {isRunning && (
        <div className="mb-4">
          <div className="w-full bg-slate-800 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">{progress.toFixed(0)}% complete</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-600 rounded p-3 mb-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {report && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-800/50 rounded p-2">
              <p className="text-slate-400">Period</p>
              <p className="text-white font-semibold">
                {report.startDate.toLocaleDateString()} - {report.endDate.toLocaleDateString()}
              </p>
            </div>
            <div className="bg-slate-800/50 rounded p-2">
              <p className="text-slate-400">Snapshots Analyzed</p>
              <p className="text-white font-semibold">{report.totalSnapshots}</p>
            </div>
          </div>

          <div className="space-y-3">
            {report.results.map((result) => (
              <div key={result.patternKey} className="bg-slate-800/50 rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-semibold text-white">{result.patternName}</h5>
                  <span className="text-xs text-slate-400">
                    {result.totalActivations} activations
                  </span>
                </div>

                {result.totalActivations > 0 ? (
                  <div className="grid grid-cols-5 gap-2 text-xs">
                    {Object.entries(result.performance).map(([hours, perf]) => (
                      <div key={hours} className="text-center">
                        <p className="text-slate-400">{hours}h</p>
                        <p
                          className={`font-semibold ${
                            perf.avgPriceChangePercent > 0 ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {perf.avgPriceChangePercent > 0 ? '+' : ''}
                          {perf.avgPriceChangePercent.toFixed(2)}%
                        </p>
                        <p className="text-slate-400">{perf.winRate.toFixed(0)}% WR</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No activations in test period</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
