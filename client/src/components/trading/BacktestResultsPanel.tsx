import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart2, Loader2, Play } from 'lucide-react';

interface Trade {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  profit: number;
  entryTime?: number;
  exitTime?: number;
}

interface BacktestResults {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  totalProfit: number;
  maxDrawdown: number;
  avgWin: number;
  avgLoss: number;
  trades: Trade[];
}

interface BacktestResultsPanelProps {
  results: BacktestResults | null;
  isRunning: boolean;
  onRun: () => void;
  onClear: () => void;
}

export function BacktestResultsPanel({
  results,
  isRunning,
  onRun,
  onClear
}: BacktestResultsPanelProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-cyan-400" />
            Backtest Results
          </CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={onRun}
              disabled={isRunning}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 mr-1" />
                  Run
                </>
              )}
            </Button>
            {results && (
              <Button
                size="sm"
                variant="outline"
                onClick={onClear}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {results && (
        <CardContent className="space-y-4">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-900 p-3 rounded">
              <div className="text-xs text-gray-400">Win Rate</div>
              <div className={`text-lg font-bold ${results.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                {results.winRate.toFixed(1)}%
              </div>
            </div>
            <div className="bg-slate-900 p-3 rounded">
              <div className="text-xs text-gray-400">Profit Factor</div>
              <div className={`text-lg font-bold ${results.profitFactor >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                {results.profitFactor.toFixed(2)}
              </div>
            </div>
            <div className="bg-slate-900 p-3 rounded">
              <div className="text-xs text-gray-400">Total P&L</div>
              <div className={`text-lg font-bold ${results.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${results.totalProfit.toFixed(2)}
              </div>
            </div>
            <div className="bg-slate-900 p-3 rounded">
              <div className="text-xs text-gray-400">Max Drawdown</div>
              <div className="text-lg font-bold text-red-400">
                {results.maxDrawdown.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Trade Statistics */}
          <div className="bg-slate-900 p-3 rounded space-y-2">
            <div className="text-xs text-gray-400 font-medium">Trade Statistics</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-gray-400">Total</div>
                <div className="text-white font-medium">{results.totalTrades}</div>
              </div>
              <div>
                <div className="text-gray-400">Wins</div>
                <div className="text-green-400 font-medium">{results.winningTrades}</div>
              </div>
              <div>
                <div className="text-gray-400">Losses</div>
                <div className="text-red-400 font-medium">{results.losingTrades}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-700">
              <div>
                <div className="text-gray-400">Avg Win</div>
                <div className="text-green-400 font-medium">${results.avgWin.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-400">Avg Loss</div>
                <div className="text-red-400 font-medium">${results.avgLoss.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Trade History Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full"
          >
            {showDetails ? 'Hide' : 'Show'} Trade History ({results.trades.length})
          </Button>

          {/* Trade History Table */}
          {showDetails && (
            <div className="bg-slate-900 rounded overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left text-gray-400">Type</th>
                      <th className="px-2 py-1 text-right text-gray-400">Entry</th>
                      <th className="px-2 py-1 text-right text-gray-400">Exit</th>
                      <th className="px-2 py-1 text-right text-gray-400">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.trades.map((trade, idx) => (
                      <tr key={idx} className="border-t border-slate-800">
                        <td className="px-2 py-1">
                          <span className={trade.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}>
                            {trade.direction}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right text-gray-300">
                          ${trade.entryPrice.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-right text-gray-300">
                          ${trade.exitPrice.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <span className={trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                            ${trade.profit.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      )}

      {!results && !isRunning && (
        <CardContent>
          <div className="text-center text-gray-400 py-8 text-sm">
            <BarChart2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No backtest results yet</p>
            <p className="text-xs mt-1">Configure a strategy and click "Run" to start</p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
