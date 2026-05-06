import { ColorPicker } from './shared/ColorPicker';
import { OpacitySlider } from './shared/OpacitySlider';
import { useFibLevelValues } from './shared/useFibLevelValues';

interface FibRetracementSettingsProps {
  drawing: any;
  onUpdate: (updates: any) => void;
}

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];

export function FibRetracementSettings({ drawing, onUpdate }: FibRetracementSettingsProps) {
  const hiddenLevels = drawing.style?.hiddenLevels || [];
  const customLabels = drawing.style?.customLabels || {};
  const levelColors = drawing.style?.levelColors || {};
  const customValues = drawing.style?.customValues || {};
  const opacity = drawing.style?.opacity ?? 1;
  const hideLabels = drawing.style?.hideLabels || false;

  // Helper to wrap updates in { style: { ... } } format
  const handleUpdate = (styleUpdates: any) => {
    console.log('[FibRetracementSettings] Updating with:', styleUpdates);
    onUpdate({ style: { ...drawing.style, ...styleUpdates } });
  };

  const { getLevelDisplayPct, onDraftChange, commitLevelValue } = useFibLevelValues(
    customValues,
    (newCustomValues) => handleUpdate({ customValues: newCustomValues })
  );

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
            const levelColor = levelColors[level] || '#ffffff';
            
            return (
              <div key={level} className="flex items-center gap-2 text-xs">
                <input 
                  type="checkbox" 
                  checked={isVisible}
                  onChange={() => {
                    const newHidden = isVisible 
                      ? [...hiddenLevels, level]
                      : hiddenLevels.filter((l: number) => roundLevel(l) !== roundLevel(level));
                    handleUpdate({ hiddenLevels: newHidden });
                  }}
                  className="rounded border-slate-600 w-4 h-4"
                />
                <input
                  type="number"
                  value={getLevelDisplayPct(level)}
                  onChange={(e) => {
                    onDraftChange(level, e.target.value);
                  }}
                  onBlur={() => commitLevelValue(level)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                  className="w-16 bg-slate-800 border border-slate-600 rounded px-1 py-1 text-xs text-white text-right"
                  step="0.1"
                />
                <span className="text-gray-500 -ml-1">%</span>
                
                <ColorPicker
                  color={levelColor}
                  onChange={(c) => {
                    const newColors = { ...levelColors, [level]: c };
                    handleUpdate({ levelColors: newColors });
                  }}
                />
                
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => {
                    const newLabels = { ...customLabels, [level]: e.target.value };
                    handleUpdate({ customLabels: newLabels });
                  }}
                  placeholder="Custom label..."
                  className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Line Extension Options */}
      <div>
        <div className="text-xs text-slate-400 mb-2">Line Extension</div>
        <div className="space-y-2">
          {/* Auto Track */}
          <div className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={drawing.style?.autoTrack ?? true}
              onChange={(e) => {
                handleUpdate({ autoTrack: e.target.checked });
              }}
              className="rounded border-slate-600 w-4 h-4"
            />
            <span className="text-gray-300">Auto Track (follow latest candle)</span>
          </div>
          {/* Extend Left / Extend Right */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleUpdate({ extendLeft: !(drawing.style?.extendLeft ?? false) })}
              className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
                (drawing.style?.extendLeft ?? false)
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }`}
            >
              Extend Left
            </button>
            <button
              type="button"
              onClick={() => {
                const newExtendRight = !(drawing.style?.extendRight ?? false);
                // Turning on extend right deselects auto track
                handleUpdate({ extendRight: newExtendRight, ...(newExtendRight ? { autoTrack: false } : {}) });
              }}
              className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
                (drawing.style?.extendRight ?? false)
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }`}
            >
              Extend Right
            </button>
          </div>
        </div>
      </div>

      {/* Label Position */}
      <div>
        <div className="text-xs text-slate-400 mb-2">Label Position</div>
        <div className="flex gap-2">
          <button
            onClick={() => handleUpdate({ labelPosition: 'left' })}
            className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
              (drawing.style?.labelPosition || 'right') === 'left'
                ? 'bg-cyan-600 text-white' 
                : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
            }`}
            type="button"
          >
            Left
          </button>
          <button
            onClick={() => handleUpdate({ labelPosition: 'right' })}
            className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
              (drawing.style?.labelPosition || 'right') === 'right'
                ? 'bg-cyan-600 text-white' 
                : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
            }`}
            type="button"
          >
            Right
          </button>
        </div>
      </div>

      {/* Global Opacity */}
      <OpacitySlider
        value={opacity}
        onChange={(val) => handleUpdate({ opacity: val })}
        label="Line Opacity"
      />

      {/* Hide Labels Toggle */}
      <div className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={hideLabels}
          onChange={(e) => handleUpdate({ hideLabels: e.target.checked })}
          className="rounded border-slate-600 w-4 h-4"
        />
        <span className="text-gray-300">Hide All Labels</span>
      </div>
    </div>
  );
}
