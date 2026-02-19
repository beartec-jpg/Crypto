import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { ChartDrawingTool } from '@/types/drawing';

interface DrawingToolbarProps {
  activeTool: ChartDrawingTool | null;
  onSelectTool: (tool: ChartDrawingTool) => void;
  showToolPicker: boolean;
  onToggleToolPicker: () => void;
}

export function DrawingToolbar({ 
  activeTool, 
  onSelectTool, 
  showToolPicker, 
  onToggleToolPicker 
}: DrawingToolbarProps) {
  const { toast } = useToast();

  const tools = [
    { id: 'trendline', name: 'Trend Line', icon: '📈' },
    { id: 'horizontal', name: 'Horizontal Line', icon: '➖' },
    { id: 'rectangle', name: 'Rectangle', icon: '⬜' },
    { id: 'fib_retracement', name: 'Fib Retracement', icon: '📊' },
    { id: 'trend_fib', name: 'Trend-Based Fib', icon: '📉' },
    { id: 'channel', name: 'Channel', icon: '🐻‍❄️' },
  ];

  const handleToolSelect = (toolId: string) => {
    onSelectTool(toolId as ChartDrawingTool);
    toast({ 
      title: `${tools.find(t => t.id === toolId)?.name} Selected`, 
      description: 'Tap chart to place points',
      duration: 2000,
    });
  };

  return (
    <>
      {/* Pencil/Draw Button */}
      <button
        onClick={onToggleToolPicker}
        className={`p-2 rounded-lg transition-all ${
          showToolPicker 
            ? 'bg-blue-500 text-white' 
            : 'bg-slate-800/90 text-gray-300 hover:bg-slate-700'
        }`}
        title="Drawing Tools"
        data-testid="btn-drawing-tools"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>

      {/* Tool Picker Popup */}
      {showToolPicker && (
        <div className="absolute top-14 left-2 z-30 bg-slate-900 border border-slate-600 rounded-lg p-2 shadow-xl min-w-[180px]">
          <div className="text-xs text-gray-400 mb-2 px-2">Select Drawing Tool</div>
          {tools.map(tool => (
            <button
              key={tool.id}
              onClick={() => handleToolSelect(tool.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-700 transition-all text-left ${
                activeTool === tool.id ? 'bg-blue-500/30 text-blue-300' : 'text-gray-300'
              }`}
              data-testid={`tool-${tool.id}`}
            >
              <span>{tool.icon}</span>
              <span className="text-sm">{tool.name}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
