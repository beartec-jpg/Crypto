import { ReactNode } from 'react';
import { GripHorizontal, X } from 'lucide-react';
import { useDraggable } from '@/hooks/useDraggable';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OscillatorPopoutWindowProps {
  oscillatorType: 'rsi' | 'macd' | 'volume';
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  storageKey?: string;
  defaultSize?: { width: number; height: number };
}

export function OscillatorPopoutWindow({
  oscillatorType,
  title,
  isOpen,
  onClose,
  children,
  storageKey = `oscillator-${oscillatorType}-position`,
  defaultSize = { width: 400, height: 200 },
}: OscillatorPopoutWindowProps) {
  // Calculate default position - offset each oscillator type
  const getDefaultPosition = () => {
    const baseX = window.innerWidth / 2 - defaultSize.width / 2;
    const baseY = 100;
    
    // Offset each oscillator type so they don't stack on top of each other
    const offset = oscillatorType === 'rsi' ? 0 : oscillatorType === 'macd' ? 30 : 60;
    
    return {
      x: baseX + offset,
      y: baseY + offset,
    };
  };

  const { position, isDragging, dragHandleProps } = useDraggable({
    initialPosition: getDefaultPosition(),
    storageKey,
  });

  if (!isOpen) return null;

  return (
    <div
      data-draggable
      className={cn(
        "fixed z-50 select-none shadow-2xl",
        isDragging && "opacity-90"
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${defaultSize.width}px`,
      }}
    >
      {/* Draggable Title Bar */}
      <div
        {...dragHandleProps}
        className="flex items-center justify-between bg-slate-800/95 backdrop-blur-sm border border-slate-700 border-b-0 rounded-t-lg px-3 py-2 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 px-2 text-xs text-slate-300 hover:text-white hover:bg-slate-700"
          >
            Dock
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Window Content */}
      <div
        className="bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-b-lg overflow-hidden"
        style={{ height: `${defaultSize.height}px` }}
      >
        {children}
      </div>
    </div>
  );
}
