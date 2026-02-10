import { useState, useEffect } from 'react';

interface WatchlistSettingsPanelProps {
  structurePivotLength: number;
  emaLengths: number[];
  onChangeStructurePivot: (length: number) => void;
  onChangeEmaLength: (index: number, length: number) => void;
}

/**
 * Compact settings panel for watchlist bias configuration.
 * Displays small numeric inputs for pivot length and 3 EMA lengths.
 */
export function WatchlistSettingsPanel({
  structurePivotLength,
  emaLengths,
  onChangeStructurePivot,
  onChangeEmaLength,
}: WatchlistSettingsPanelProps) {
  const [pivotValue, setPivotValue] = useState(structurePivotLength.toString());
  const [ema1Value, setEma1Value] = useState(emaLengths[0]?.toString() || '21');
  const [ema2Value, setEma2Value] = useState(emaLengths[1]?.toString() || '50');
  const [ema3Value, setEma3Value] = useState(emaLengths[2]?.toString() || '200');

  // Sync local state when props change
  useEffect(() => {
    setPivotValue(structurePivotLength.toString());
  }, [structurePivotLength]);

  useEffect(() => {
    setEma1Value(emaLengths[0]?.toString() || '21');
    setEma2Value(emaLengths[1]?.toString() || '50');
    setEma3Value(emaLengths[2]?.toString() || '200');
  }, [emaLengths]);

  const handlePivotBlur = () => {
    const num = parseInt(pivotValue, 10);
    if (!isNaN(num) && num > 0) {
      onChangeStructurePivot(num);
    } else {
      setPivotValue(structurePivotLength.toString());
    }
  };

  const handleEmaBlur = (index: number, value: string, setter: (v: string) => void, fallback: number) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      onChangeEmaLength(index, num);
    } else {
      setter(fallback.toString());
    }
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 mb-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Structure Pivot Length */}
        <div className="flex items-center gap-2">
          <label htmlFor="pivot-length" className="text-sm text-slate-300 whitespace-nowrap">
            Structure Pivot:
          </label>
          <input
            id="pivot-length"
            type="number"
            min="1"
            value={pivotValue}
            onChange={(e) => setPivotValue(e.target.value)}
            onBlur={handlePivotBlur}
            className="w-16 px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* EMA Lengths */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-300 whitespace-nowrap">
            EMA Lengths:
          </label>
          <input
            type="number"
            min="1"
            value={ema1Value}
            onChange={(e) => setEma1Value(e.target.value)}
            onBlur={() => handleEmaBlur(0, ema1Value, setEma1Value, emaLengths[0] || 21)}
            className="w-16 px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="number"
            min="1"
            value={ema2Value}
            onChange={(e) => setEma2Value(e.target.value)}
            onBlur={() => handleEmaBlur(1, ema2Value, setEma2Value, emaLengths[1] || 50)}
            className="w-16 px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="number"
            min="1"
            value={ema3Value}
            onChange={(e) => setEma3Value(e.target.value)}
            onBlur={() => handleEmaBlur(2, ema3Value, setEma3Value, emaLengths[2] || 200)}
            className="w-16 px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}
