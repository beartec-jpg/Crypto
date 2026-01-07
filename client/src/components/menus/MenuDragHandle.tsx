import React, { memo } from 'react';

interface MenuDragHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
}

const MenuDragHandleComponent = ({ onMouseDown, onTouchStart }: MenuDragHandleProps) => {
  return (
    <div 
      className="h-2 bg-slate-600 rounded-t-sm cursor-grab active:cursor-grabbing flex items-center justify-center hover:bg-slate-500 transition-colors"
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      <div className="w-6 h-0.5 bg-slate-400 rounded" />
    </div>
  );
};

MenuDragHandleComponent.displayName = 'MenuDragHandle';

export const MenuDragHandle = memo(MenuDragHandleComponent);
