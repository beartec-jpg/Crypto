import { ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { useDraggable } from '@/hooks/useDraggable';
import { cn } from '@/lib/utils';

interface DraggableToolbarProps {
  children: ReactNode;
  storageKey?: string;
  initialPosition?: { x: number; y: number } | (() => { x: number; y: number });
}

// Default position function evaluated at render time
const defaultPosition = () => ({
  x: window.innerWidth / 2 - 150,
  y: window.innerHeight - 150
});

export function DraggableToolbar({ 
  children, 
  storageKey, 
  initialPosition = defaultPosition 
}: DraggableToolbarProps) {
  const { position, isDragging, handleMouseDown } = useDraggable({
    storageKey,
    initialPosition,
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
      className="fixed z-30"
      style={{
        left: position.x,
        top: position.y,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      <div className="flex flex-col items-center bg-slate-800/90 backdrop-blur rounded-lg shadow-lg border border-slate-600">
        {/* Drag Handle */}
        <div
          className="w-full px-2 py-1 cursor-grab active:cursor-grabbing flex justify-center border-b border-slate-600"
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          <GripVertical className="h-4 w-4 text-slate-400" />
        </div>
        {/* Toolbar Content */}
        <div className="p-2">
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
