interface LineWidthSelectorProps {
  value: number; // 1-5
  onChange: (value: number) => void;
  className?: string;
}

export function LineWidthSelector({ value, onChange, className = '' }: LineWidthSelectorProps) {
  const widths = [1, 2, 3, 4, 5];
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs text-slate-400 whitespace-nowrap">Width:</span>
      <div className="flex gap-1">
        {widths.map(w => (
          <button
            key={w}
            onClick={() => onChange(w)}
            className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
              value === w 
                ? 'bg-cyan-600 text-white' 
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
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
