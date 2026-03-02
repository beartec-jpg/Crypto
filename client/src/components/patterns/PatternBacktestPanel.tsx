import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Candle, CVDDataItem } from '@/types/chart';
import type { PatternBacktestReport } from '@/lib/backtest/patternBacktest';
import { runPatternBacktest, generateBacktestReport } from '@/lib/backtest/patternBacktest';
import type { PatternSensitivityProfile } from '@/services/patternDetectors';

interface PatternBacktestPanelProps {
  candles: Candle[];
  cvdData: CVDDataItem[];
}

export function PatternBacktestPanel({ candles, cvdData }: PatternBacktestPanelProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<PatternBacktestReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState<180 | 365 | 730>(365);
  const [sensitivityProfile, setSensitivityProfile] = useState<PatternSensitivityProfile>('neutral');

  const periodLabel = periodDays === 180 ? '6 months' : periodDays === 365 ? '1 year' : '2 years';
  const profileHint =
    sensitivityProfile === 'aggressive'
      ? 'Lenient requirements, more activations'
      : sensitivityProfile === 'tame'
        ? 'Strict requirements, fewer but cleaner activations'
        : 'Balanced requirements';

  async function handleRunBacktest() {
    setIsRunning(true);
    setError(null);
    setProgress(0);

    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - periodDays * 24 * 60 * 60 * 1000);

      const result = await runPatternBacktest(
        {
          candles,
          cvdData,
          startDate,
          endDate,
          sensitivityProfile,
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
            Validate pattern detection accuracy using {periodLabel} of historical data
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

      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs text-slate-400">Backtest Window:</span>
        {[180, 365, 730].map((days) => {
          const isActive = periodDays === days;
          const label = days === 180 ? '180d' : days === 365 ? '365d' : '730d';

          return (
            <Button
              key={days}
              type="button"
              size="sm"
              variant={isActive ? 'default' : 'outline'}
              className={isActive ? 'bg-blue-600 hover:bg-blue-700' : 'border-slate-600 text-slate-300 hover:bg-slate-800'}
              onClick={() => setPeriodDays(days as 180 | 365 | 730)}
              disabled={isRunning}
            >
              {label}
            </Button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Sensitivity:</span>
          {(['tame', 'neutral', 'aggressive'] as const).map((profile) => {
            const isActive = sensitivityProfile === profile;
            const label = profile.charAt(0).toUpperCase() + profile.slice(1);

            return (
              <Button
                key={profile}
                type="button"
                size="sm"
                variant={isActive ? 'default' : 'outline'}
                className={isActive ? 'bg-blue-600 hover:bg-blue-700' : 'border-slate-600 text-slate-300 hover:bg-slate-800'}
                onClick={() => setSensitivityProfile(profile)}
                disabled={isRunning}
              >
                {label}
              </Button>
            );
          })}
        </div>
        <p className="text-xs text-slate-400">{profileHint}</p>
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

          <p className="text-xs text-slate-400">
            Win Rate = wins / total activations for each horizon. Bullish patterns win on positive forward return, bearish on negative, and capitulation/fakeout require absolute move &gt; 2%.
          </p>

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
