import { BacktestResults } from '@/types/trading.types';

interface BacktestResultsProps {
  results: BacktestResults | null;
}

export function BacktestResults({ results }: BacktestResultsProps) {
  if (!results) return null;

  return (
    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-white mb-4">Results</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-400">Total Trades</p>
          <p className="text-2xl font-bold text-white">{results.totalTrades}</p>
        </div>
        
        <div>
          <p className="text-xs text-gray-400">Win Rate</p>
          <p className="text-2xl font-bold text-white">{results.winRate.toFixed(1)}%</p>
        </div>
        
        <div>
          <p className="text-xs text-gray-400">Total PnL</p>
          <p className={`text-2xl font-bold ${results.totalPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {results.totalPL >= 0 ? '+' : ''}{results.totalPL.toFixed(2)}
          </p>
        </div>
        
        <div>
          <p className="text-xs text-gray-400">Profit Factor</p>
          <p className="text-2xl font-bold text-white">
            {results.profitFactor.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-800 text-sm text-gray-400">
        <div className="flex justify-between">
          <span>Winners: {results.winners}</span>
          <span>Losers: {results.losers}</span>
        </div>
        <div className="flex justify-between mt-1">
          <span>Avg R:R: {results.avgRR.toFixed(2)}</span>
          <span>Return: {results.returnPercent.toFixed(2)}%</span>
        </div>
      </div>
    </div>
  );
}
