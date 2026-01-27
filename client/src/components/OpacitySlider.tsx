interface OpacitySliderProps {
  value: number; // 0-1
  onChange: (value: number) => void;
  className?: string;
}

export function OpacitySlider({ value, onChange, className = '' }: OpacitySliderProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs text-slate-400 whitespace-nowrap">Opacity:</span>
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round(value * 100)}
        onChange={(e) => onChange(parseInt(e.target.value) / 100)}
        className="flex-1 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500"
      />
      <span className="text-xs text-slate-300 w-10 text-right">{Math.round(value * 100)}%</span>
    </div>
  );
}
