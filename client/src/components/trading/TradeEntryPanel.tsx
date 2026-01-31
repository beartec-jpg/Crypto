import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';

export interface TradeSetup {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  targets: number[];
  positionSize: number;
  leverage: number;
}

interface TradeEntryPanelProps {
  currentPrice: number;
  symbol: string;
  onSubmitTrade: (trade: TradeSetup) => void;
  userBalance?: number;
  maxLeverage?: number;
}

export function TradeEntryPanel({ 
  currentPrice, 
  symbol,
  onSubmitTrade,
  userBalance = 10000,
  maxLeverage = 20
}: TradeEntryPanelProps) {
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [entryPrice, setEntryPrice] = useState(currentPrice);
  const [stopLoss, setStopLoss] = useState(0);
  const [targets, setTargets] = useState([0, 0, 0]);
  const [positionSize, setPositionSize] = useState(0);
  const [leverage, setLeverage] = useState(1);
  const [riskPercent, setRiskPercent] = useState(1);

  // Calculate risk amount
  const riskAmount = (userBalance * riskPercent) / 100;
  const stopLossDistance = Math.abs(entryPrice - stopLoss);
  const calculatedPositionSize = stopLossDistance > 0 
    ? (riskAmount / stopLossDistance) * entryPrice 
    : 0;

  // Calculate R:R ratio
  const rewardRatio = targets.map(target => {
    const targetDistance = Math.abs(target - entryPrice);
    return stopLossDistance > 0 ? targetDistance / stopLossDistance : 0;
  });

  const handleSubmit = () => {
    const trade: TradeSetup = {
      direction,
      entryPrice,
      stopLoss,
      targets,
      positionSize: calculatedPositionSize,
      leverage
    };
    onSubmitTrade(trade);
  };

  return (
    <div className="bg-slate-900 rounded-lg p-4 space-y-4">
      <h3 className="text-lg font-semibold text-white">Trade Entry</h3>

      {/* Direction Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={() => setDirection('LONG')}
          variant={direction === 'LONG' ? 'default' : 'outline'}
          className={direction === 'LONG' ? 'bg-green-600 hover:bg-green-700 flex-1' : 'flex-1'}
        >
          LONG
        </Button>
        <Button
          onClick={() => setDirection('SHORT')}
          variant={direction === 'SHORT' ? 'default' : 'outline'}
          className={direction === 'SHORT' ? 'bg-red-600 hover:bg-red-700 flex-1' : 'flex-1'}
        >
          SHORT
        </Button>
      </div>

      {/* Entry Price */}
      <div>
        <Label className="text-white text-sm">Entry Price</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            value={entryPrice}
            onChange={(e) => setEntryPrice(parseFloat(e.target.value))}
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEntryPrice(currentPrice)}
          >
            Market
          </Button>
        </div>
      </div>

      {/* Stop Loss */}
      <div>
        <Label className="text-white text-sm">Stop Loss</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            value={stopLoss}
            onChange={(e) => setStopLoss(parseFloat(e.target.value))}
            className="flex-1"
          />
          <Input
            type="number"
            placeholder="%"
            className="w-20"
            onChange={(e) => {
              const percent = parseFloat(e.target.value) / 100;
              const slPrice = direction === 'LONG'
                ? entryPrice * (1 - percent)
                : entryPrice * (1 + percent);
              setStopLoss(slPrice);
            }}
          />
        </div>
      </div>

      {/* Take Profit Targets */}
      <div>
        <Label className="text-white text-sm">Take Profit Targets</Label>
        {targets.map((target, index) => (
          <div key={index} className="flex gap-2 mt-2">
            <span className="text-gray-400 text-sm w-8">TP{index + 1}</span>
            <Input
              type="number"
              value={target}
              onChange={(e) => {
                const newTargets = [...targets];
                newTargets[index] = parseFloat(e.target.value);
                setTargets(newTargets);
              }}
              className="flex-1"
            />
            <span className="text-gray-400 text-sm w-16">
              {rewardRatio[index] > 0 ? `${rewardRatio[index].toFixed(1)}R` : '-'}
            </span>
          </div>
        ))}
      </div>

      {/* Risk Percentage */}
      <div>
        <Label className="text-white text-sm">Risk %</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={riskPercent}
            onChange={(e) => setRiskPercent(parseFloat(e.target.value))}
            className="w-20"
            step="0.5"
            min="0.5"
            max="5"
          />
          <span className="text-gray-400 text-sm">${riskAmount.toFixed(2)}</span>
        </div>
      </div>

      {/* Leverage */}
      <div>
        <Label className="text-white text-sm">Leverage: {leverage}x</Label>
        <Slider
          value={[leverage]}
          onValueChange={([value]) => setLeverage(value)}
          min={1}
          max={maxLeverage}
          step={1}
          className="mt-2"
        />
      </div>

      {/* Position Size */}
      <div className="p-3 bg-slate-800 rounded">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Position Size:</span>
          <span className="text-white font-semibold">
            ${calculatedPositionSize.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span className="text-gray-400">Risk Amount:</span>
          <span className="text-red-400">${riskAmount.toFixed(2)}</span>
        </div>
      </div>

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        className="w-full"
        disabled={stopLoss === 0 || targets.every(t => t === 0)}
      >
        Place Trade
      </Button>
    </div>
  );
}
