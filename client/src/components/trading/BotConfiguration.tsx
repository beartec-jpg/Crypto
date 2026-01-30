import { BotTPSLConfig } from '@/types/trading.types';

interface BotConfigurationProps {
  config: BotTPSLConfig;
  onChange: (config: BotTPSLConfig) => void;
}

export function BotConfiguration({ config }: BotConfigurationProps) {
  return (
    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-white mb-4">Bot Configuration</h3>
      
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Take Profit Settings</h4>
          <div className="text-xs text-gray-400 space-y-1">
            <p>• Number of TPs: {config.numTPs}</p>
            <p>• TP1 Type: {config.tp1.type}</p>
            {config.tp2 && <p>• TP2 Type: {config.tp2.type}</p>}
            {config.tp3 && <p>• TP3 Type: {config.tp3.type}</p>}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Stop Loss Settings</h4>
          <div className="text-xs text-gray-400 space-y-1">
            <p>• SL Type: {config.sl.type}</p>
            {config.sl.atrMultiplier && <p>• ATR Multiplier: {config.sl.atrMultiplier}x</p>}
            {config.sl.fixedDistance && <p>• Fixed Distance: {config.sl.fixedDistance}</p>}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Risk Management</h4>
          <div className="text-xs text-gray-400 space-y-1">
            <p>• Position sizing based on risk per trade</p>
            <p>• Dynamic stop loss adjustment</p>
            <p>• Partial position exits at each TP level</p>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Strategy Parameters</h4>
          <div className="text-xs text-gray-400 space-y-1">
            <p>• Swing detection and structure analysis</p>
            <p>• Multi-timeframe confirmation</p>
            <p>• Volume and momentum filters</p>
          </div>
        </div>
      </div>
    </div>
  );
}
