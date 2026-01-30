import { Button } from '@/components/ui/button';

interface BacktestPanelProps {
  onRunBacktest: (config: any) => void;
  isRunning: boolean;
}

export function BacktestPanel({ onRunBacktest, isRunning }: BacktestPanelProps) {
  const handleRunBacktest = () => {
    // Placeholder configuration - parent component should handle actual backtest logic
    const config = {
      strategy: 'default',
      startDate: null, // null = use all available data
      endDate: null,
    };
    onRunBacktest(config);
  };

  return (
    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-white mb-4">Backtest</h3>
      
      <div className="space-y-4">
        <div className="text-sm text-gray-400">
          <p>Configure backtest parameters:</p>
          <ul className="mt-2 space-y-1 text-xs">
            <li>• Date Range: All available data</li>
            <li>• Strategy: Default trading strategy</li>
            <li>• Initial Capital: $10,000</li>
            <li>• Risk per Trade: 1%</li>
          </ul>
        </div>

        <Button
          onClick={handleRunBacktest}
          disabled={isRunning}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-700"
        >
          {isRunning ? 'Running...' : 'Run Backtest'}
        </Button>
      </div>
    </div>
  );
}
