import { ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { useDraggable } from '@/hooks/useDraggable';
import { cn } from '@/lib/utils';

interface DraggableToolbarProps {
  children: ReactNode;
  storageKey?: string;
  defaultPosition?: () => { x: number; y: number };
  className?: string;
}

export function DraggableToolbar({
  children,
  storageKey = 'draggable-toolbar-position',
  defaultPosition = () => ({ 
    x: typeof window !== 'undefined' ? window.innerWidth / 2 - 30 : 0, 
    y: typeof window !== 'undefined' ? window.innerHeight - 150 : 0 
  }),
  className,
}: DraggableToolbarProps) {
  const { position, isDragging, dragHandleProps } = useDraggable({
    initialPosition: defaultPosition(),
    bounds: 'parent',
    storageKey,
  });

  return (
    <div
      data-draggable
      className={cn(
        "fixed z-50 select-none",
        isDragging && "opacity-80",
        className
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="flex flex-col">
        {/* Drag Handle */}
        <div
          {...dragHandleProps}
          className="flex items-center justify-center bg-slate-800/95 backdrop-blur-sm border border-slate-700 border-b-0 rounded-t-lg px-3 py-1 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4 text-slate-400" />
        </div>

        {/* Toolbar Content - children should have their own styling */}
        <div className="[&>*]:rounded-t-none">
          {children}
        </div>
      </div>
    </div>
  );
}
