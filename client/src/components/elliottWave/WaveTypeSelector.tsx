import { Button } from '@/components/ui/button';
import type { SimpleWaveType } from '@/hooks/useSimpleElliottWave';

interface WaveTypeSelectorProps {
  onSelect: (type: SimpleWaveType) => void;
  onCancel: () => void;
}

export function WaveTypeSelector({ onSelect, onCancel }: WaveTypeSelectorProps) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50"
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 shadow-2xl w-72 select-none">
        <h3 className="text-white font-semibold text-lg mb-4">Select Wave Pattern</h3>

        <div className="flex flex-col gap-3">
          <Button
            onClick={() => onSelect('impulse')}
            className="bg-blue-600 hover:bg-blue-700 text-white w-full h-12"
          >
            <span className="font-bold mr-2">Impulse</span>
            <span className="text-sm opacity-80">(1-2-3-4-5)</span>
          </Button>

          <Button
            onClick={() => onSelect('abc')}
            className="bg-amber-600 hover:bg-amber-700 text-white w-full h-12"
          >
            <span className="font-bold mr-2">Correction</span>
            <span className="text-sm opacity-80">(A-B-C)</span>
          </Button>

          <Button
            onClick={() => onSelect('wxy')}
            className="bg-purple-600 hover:bg-purple-700 text-white w-full h-12"
          >
            <span className="font-bold mr-2">Complex</span>
            <span className="text-sm opacity-80">(W-X-Y)</span>
          </Button>
        </div>

        <Button
          variant="ghost"
          onClick={onCancel}
          className="w-full mt-3 text-slate-400 hover:text-white"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
