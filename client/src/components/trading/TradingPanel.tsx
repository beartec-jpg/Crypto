import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Position } from '@/types/trading.types';

interface TradingPanelProps {
  symbol: string;
  currentPrice: number;
  onTrade: (side: 'long' | 'short', amount: number) => void;
  positions: Position[];
}

export function TradingPanel({ symbol, currentPrice, onTrade, positions }: TradingPanelProps) {
  const [amount, setAmount] = useState<string>('');

  const handleTrade = (side: 'long' | 'short') => {
    const numAmount = parseFloat(amount);
    if (!isNaN(numAmount) && numAmount > 0) {
      onTrade(side, numAmount);
      setAmount('');
    }
  };

  return (
    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-white mb-4">Trading Panel</h3>
      
      <div className="space-y-4">
        <div>
          <Label htmlFor="amount" className="text-gray-400">Amount ({symbol})</Label>
          <Input
            id="amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="bg-gray-900 border-gray-700 text-white mt-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => handleTrade('long')}
            disabled={!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            Long
          </Button>
          <Button
            onClick={() => handleTrade('short')}
            disabled={!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Short
          </Button>
        </div>

        {positions.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-400 mb-2">Open Positions</h4>
            <div className="space-y-2">
              {positions.map((position, index) => {
                const pnl = position.type === 'long' 
                  ? (currentPrice - position.entry) * position.quantity
                  : (position.entry - currentPrice) * position.quantity;
                const pnlPercent = ((pnl / (position.entry * position.quantity)) * 100).toFixed(2);
                
                return (
                  <div key={position.signalId || index} className="bg-gray-900 border border-gray-800 rounded p-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`font-semibold ${position.type === 'long' ? 'text-green-500' : 'text-red-500'}`}>
                        {position.type.toUpperCase()}
                      </span>
                      <span className={pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} ({pnlPercent}%)
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                      <div>Entry: <span className="text-white">{position.entry.toFixed(2)}</span></div>
                      <div>Qty: <span className="text-white">{position.quantity.toFixed(4)}</span></div>
                      <div>SL: <span className="text-white">{position.stopLoss.toFixed(2)}</span></div>
                      <div>TP1: <span className="text-white">{position.tp1.toFixed(2)}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
