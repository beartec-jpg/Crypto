import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface Position {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  size: number;
  stopLoss: number;
  targets: { price: number; filled: boolean }[];
  openTime: number;
}

interface PositionTrackerPanelProps {
  positions: Position[];
  onClosePosition: (positionId: string) => void;
  onModifyPosition: (positionId: string, updates: Partial<Position>) => void;
}

export function PositionTrackerPanel({
  positions,
  onClosePosition,
  onModifyPosition
}: PositionTrackerPanelProps) {
  const calculatePnL = (position: Position) => {
    const priceDiff = position.direction === 'LONG'
      ? position.currentPrice - position.entryPrice
      : position.entryPrice - position.currentPrice;
    return (priceDiff / position.entryPrice) * position.size;
  };

  const calculatePnLPercent = (position: Position) => {
    const priceDiff = position.direction === 'LONG'
      ? position.currentPrice - position.entryPrice
      : position.entryPrice - position.currentPrice;
    return (priceDiff / position.entryPrice) * 100;
  };

  return (
    <div className="bg-slate-900 rounded-lg p-4 space-y-4">
      <h3 className="text-lg font-semibold text-white">Active Positions</h3>

      {positions.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">No active positions</p>
      ) : (
        <div className="space-y-3">
          {positions.map(position => {
            const pnl = calculatePnL(position);
            const pnlPercent = calculatePnLPercent(position);
            const isProfitable = pnl > 0;

            return (
              <div key={position.id} className="bg-slate-800 rounded p-3 space-y-2">
                {/* Header */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold">{position.symbol}</span>
                    <Badge variant={position.direction === 'LONG' ? 'default' : 'destructive'}>
                      {position.direction}
                    </Badge>
                  </div>
                  <span className={`text-sm font-semibold ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
                    {isProfitable ? '+' : ''}{pnlPercent.toFixed(2)}%
                  </span>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-400">Entry:</span>
                    <span className="text-white ml-2">${position.entryPrice.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Current:</span>
                    <span className="text-white ml-2">${position.currentPrice.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Size:</span>
                    <span className="text-white ml-2">${position.size.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">P&L:</span>
                    <span className={`ml-2 ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
                      ${pnl.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Targets */}
                <div className="flex gap-1">
                  {position.targets.map((target, idx) => (
                    <div
                      key={idx}
                      className={`flex-1 text-center text-xs py-1 rounded ${
                        target.filled ? 'bg-green-600' : 'bg-slate-700'
                      }`}
                    >
                      TP{idx + 1}: ${target.price.toFixed(2)}
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onModifyPosition(position.id, {})}
                  >
                    Modify
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    onClick={() => onClosePosition(position.id)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
