import { ColorPicker } from './shared/ColorPicker';
import { OpacitySlider } from './shared/OpacitySlider';
import { LineStyleSelector } from './shared/LineStyleSelector';

interface ChannelSettingsProps {
  drawing: any; // Replace with proper type
  onUpdate: (updates: any) => void;
}

const CHANNEL_LEVELS = [0.25, 0.5, 0.75];

export function ChannelSettings({ drawing, onUpdate }: ChannelSettingsProps) {
  const hiddenLevels = drawing.style?.hiddenLevels || [];
  const customLabels = drawing.style?.customLabels || {};
  const levelColors = drawing.style?.levelColors || {};
  const boundaryColors = drawing.style?.boundaryColors || {};
  const opacity = drawing.style?.opacity ?? 1;
  const fillOpacity = drawing.style?.fillOpacity ?? 0.1;
  const hideLabels = drawing.style?.hideLabels || false;
  const lineStyle = drawing.style?.lineStyle || 'solid';
  const internalLineStyle = drawing.style?.internalLineStyle || 'dashed';

  const roundLevel = (n: number) => Math.round(n * 10000) / 10000;
  const isLevelHidden = (level: number) => 
    hiddenLevels.some((h: number) => roundLevel(h) === roundLevel(level));

  return (
    <div className="space-y-4 p-4 bg-slate-900 rounded-lg">
      {/* Boundary Line Style */}
      <LineStyleSelector
        value={lineStyle}
        onChange={(style) => onUpdate({ lineStyle: style })}
        label="Boundary Line Style"
      />

      {/* Internal Line Style */}
      <LineStyleSelector
        value={internalLineStyle}
        onChange={(style) => onUpdate({ internalLineStyle: style })}
        label="Internal Line Style"
      />

      {/* Opacity */}
      <OpacitySlider
        value={opacity}
        onChange={(val) => onUpdate({ opacity: val })}
        label="Line Opacity"
      />

      {/* Internal Markers */}
      <div>
        <div className="text-xs text-gray-300 mb-2 font-semibold">Internal Markers</div>
        <div className="space-y-2">
          {CHANNEL_LEVELS.map(level => {
            const isVisible = !isLevelHidden(level);
            const customLabel = customLabels[level] || '';
            const levelColor = levelColors[level] || '#facc15';
            
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
                <span className="text-gray-400 w-10">{(level * 100).toFixed(0)}%</span>
                
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

      {/* Boundary Labels */}
      <div>
        <div className="text-xs text-gray-300 mb-2 font-semibold">Boundary Labels</div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400 w-16">Top:</span>
            <ColorPicker
              color={boundaryColors.top || '#ef4444'}
              onChange={(c) => {
                onUpdate({ boundaryColors: { ...boundaryColors, top: c } });
              }}
            />
            <input
              type="text"
              value={customLabels['top'] || ''}
              onChange={(e) => {
                onUpdate({ customLabels: { ...customLabels, top: e.target.value } });
              }}
              placeholder="Top label..."
              className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500"
            />
          </div>
          
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400 w-16">Bottom:</span>
            <ColorPicker
              color={boundaryColors.bottom || '#22c55e'}
              onChange={(c) => {
                onUpdate({ boundaryColors: { ...boundaryColors, bottom: c } });
              }}
            />
            <input
              type="text"
              value={customLabels['bottom'] || ''}
              onChange={(e) => {
                onUpdate({ customLabels: { ...customLabels, bottom: e.target.value } });
              }}
              placeholder="Bottom label..."
              className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500"
            />
          </div>
        </div>
      </div>

      {/* Hide Labels Toggle */}
      <div className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={hideLabels}
          onChange={(e) => onUpdate({ hideLabels: e.target.checked })}
          className="rounded border-slate-600 w-4 h-4"
        />
        <span className="text-gray-300">Hide Labels</span>
      </div>

      {/* Fill Opacity */}
      <OpacitySlider
        value={fillOpacity}
        onChange={(val) => onUpdate({ fillOpacity: val })}
        label="Fill Opacity"
      />
    </div>
  );
}
