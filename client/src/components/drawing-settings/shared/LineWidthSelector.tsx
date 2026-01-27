interface LineWidthSelectorProps {
  value: number; // 1-5
  onChange: (value: number) => void;
  className?: string;
}

export function LineWidthSelector({ value, onChange, className = '' }: LineWidthSelectorProps) {
  const widths = [1, 2, 3, 4, 5];
  
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="text-xs text-slate-400">Line Width</div>
      <div className="flex gap-2">
        {widths.map(w => (
          <button
            key={w}
            onClick={() => onChange(w)}
            className={`w-10 h-10 rounded flex items-center justify-center transition-colors ${
              value === w 
                ? 'bg-cyan-600 text-white border-2 border-cyan-400' 
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600 border-2 border-slate-600'
            }`}
            type="button"
          >
            <div 
              className="bg-current rounded-full" 
              style={{ 
                width: `${w * 2}px`, 
                height: `${w * 2}px` 
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
