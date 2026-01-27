import { ColorPicker } from './shared/ColorPicker';
import { OpacitySlider } from './shared/OpacitySlider';

interface FibRetracementSettingsProps {
  drawing: any;
  onUpdate: (updates: any) => void;
}

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];

export function FibRetracementSettings({ drawing, onUpdate }: FibRetracementSettingsProps) {
  const hiddenLevels = drawing.style?.hiddenLevels || [];
  const customLabels = drawing.style?.customLabels || {};
  const levelColors = drawing.style?.levelColors || {};
  const opacity = drawing.style?.opacity ?? 1;
  const hideLabels = drawing.style?.hideLabels || false;

  const roundLevel = (n: number) => Math.round(n * 10000) / 10000;
  const isLevelHidden = (level: number) => 
    hiddenLevels.some((h: number) => roundLevel(h) === roundLevel(level));

  return (
    <div className="space-y-4 p-4 bg-slate-900 rounded-lg">
      {/* Fibonacci Levels */}
      <div>
        <div className="text-xs text-gray-300 mb-2 font-semibold">Fibonacci Levels</div>
        <div className="space-y-2">
          {FIB_LEVELS.map(level => {
            const isVisible = !isLevelHidden(level);
            const customLabel = customLabels[level] || '';
            const levelColor = levelColors[level] || '#3b82f6';
            
            return (
              <div key={level} className="flex items-center gap-2 text-xs">
                <input 
                  type="checkbox" 
                  checked={isVisible}
                  onChange={() => {
                    const newHidden = isVisible 
                      ? [...hiddenLevels, level]
                      : hiddenLevels.filter((l: number) => roundLevel(l) !== roundLevel(level));
                    onUpdate({ hiddenLevels: newHidden });
                  }}
                  className="rounded border-slate-600 w-4 h-4"
                />
                <span className="text-gray-400 w-12">{(level * 100).toFixed(1)}%</span>
                
                <ColorPicker
                  color={levelColor}
                  onChange={(c) => {
                    const newColors = { ...levelColors, [level]: c };
                    onUpdate({ levelColors: newColors });
                  }}
                />
                
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => {
                    const newLabels = { ...customLabels, [level]: e.target.value };
                    onUpdate({ customLabels: newLabels });
                  }}
                  placeholder="Custom label..."
                  className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Global Opacity */}
      <OpacitySlider
        value={opacity}
        onChange={(val) => onUpdate({ opacity: val })}
        label="Line Opacity"
      />

      {/* Hide Labels Toggle */}
      <div className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={hideLabels}
          onChange={(e) => onUpdate({ hideLabels: e.target.checked })}
          className="rounded border-slate-600 w-4 h-4"
        />
        <span className="text-gray-300">Hide All Labels</span>
      </div>
    </div>
  );
}
