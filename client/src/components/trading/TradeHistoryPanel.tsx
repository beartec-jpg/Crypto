import { Badge } from '@/components/ui/badge';

export interface CompletedTrade {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPercent: number;
  openTime: number;
  closeTime: number;
  notes?: string;
}

interface TradeHistoryPanelProps {
  trades: CompletedTrade[];
}

export function TradeHistoryPanel({ trades }: TradeHistoryPanelProps) {
  // Calculate statistics
  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => t.pnl > 0).length;
  const losingTrades = trades.filter(t => t.pnl < 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
  const avgWin = winningTrades > 0
    ? trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / winningTrades
    : 0;
  const avgLoss = losingTrades > 0
    ? Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0) / losingTrades)
    : 0;
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;

  return (
    <div className="bg-slate-900 rounded-lg p-4 space-y-4">
      <h3 className="text-lg font-semibold text-white">Trade History</h3>

      {/* Statistics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800 rounded p-3">
          <div className="text-gray-400 text-xs">Total P&L</div>
          <div className={`text-xl font-bold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${totalPnL.toFixed(2)}
          </div>
        </div>
        <div className="bg-slate-800 rounded p-3">
          <div className="text-gray-400 text-xs">Win Rate</div>
          <div className="text-xl font-bold text-white">
            {winRate.toFixed(1)}%
          </div>
        </div>
        <div className="bg-slate-800 rounded p-3">
          <div className="text-gray-400 text-xs">Total Trades</div>
          <div className="text-xl font-bold text-white">{totalTrades}</div>
        </div>
        <div className="bg-slate-800 rounded p-3">
          <div className="text-gray-400 text-xs">Profit Factor</div>
          <div className="text-xl font-bold text-white">
            {profitFactor.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Trades List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {trades.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">No trades yet</p>
        ) : (
          trades.map(trade => (
            <div key={trade.id} className="bg-slate-800 rounded p-3">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold">{trade.symbol}</span>
                  <Badge variant={trade.direction === 'LONG' ? 'default' : 'destructive'}>
                    {trade.direction}
                  </Badge>
                </div>
                <span className={`text-sm font-semibold ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {trade.pnl >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                <div>Entry: ${trade.entryPrice.toFixed(2)}</div>
                <div>Exit: ${trade.exitPrice.toFixed(2)}</div>
                <div>Size: ${trade.size.toFixed(2)}</div>
                <div>P&L: ${trade.pnl.toFixed(2)}</div>
              </div>

              {trade.notes && (
                <div className="mt-2 text-xs text-gray-400 italic">{trade.notes}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
