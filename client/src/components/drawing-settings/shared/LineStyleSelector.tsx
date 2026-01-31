import type { LineStyle } from '../../../types/drawing';

interface LineStyleSelectorProps {
  value: LineStyle;
  onChange: (style: LineStyle) => void;
  label?: string;
  className?: string;
}

export function LineStyleSelector({ 
  value, 
  onChange, 
  label = "Line Style",
  className = '' 
}: LineStyleSelectorProps) {
  const styles: LineStyle[] = ['solid', 'dashed', 'dotted'];
  
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="grid grid-cols-3 gap-2">
        {styles.map(style => (
          <button
            key={style}
            onClick={() => onChange(style)}
            className={`px-3 py-2 rounded flex items-center justify-center transition-colors ${
              value === style 
                ? 'bg-cyan-600 text-white border-2 border-cyan-400' 
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600 border-2 border-slate-600'
            }`}
            type="button"
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs capitalize">{style}</span>
              <svg width="24" height="4" viewBox="0 0 24 4" aria-hidden="true">
                {style === 'solid' && (
                  <line x1="0" y1="2" x2="24" y2="2" stroke="currentColor" strokeWidth="2" />
                )}
                {style === 'dashed' && (
                  <line x1="0" y1="2" x2="24" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray="5,5" />
                )}
                {style === 'dotted' && (
                  <line x1="0" y1="2" x2="24" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray="2,2" />
                )}
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
