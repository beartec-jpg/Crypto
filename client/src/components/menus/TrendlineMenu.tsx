import React from 'react';
import { MenuButton } from './MenuButton';
import { MenuDragHandle } from './MenuDragHandle';

interface TrendlineMenuProps {
  position: { x: number; y: number };
  trendlineColor?: string;
  onDelete: () => void;
  onToggleColorSubmenu: () => void;
  onToggleExtendSubmenu: () => void;
  onToggleLabelSubmenu: () => void;
  onSaveAsFavorite: () => void;
  onDragStart: (e: React.MouseEvent | React.TouchEvent, position: { x: number; y: number }) => void;
  activeSubmenu: string | null;
}

export function TrendlineMenu({ 
  position, 
  trendlineColor = 'currentColor',
  onDelete, 
  onToggleColorSubmenu,
  onToggleExtendSubmenu,
  onToggleLabelSubmenu,
  onSaveAsFavorite,
  onDragStart,
  activeSubmenu
}: TrendlineMenuProps) {
  return (
    <div 
      className="absolute flex flex-col gap-1 bg-slate-800 border border-slate-600 rounded-b rounded-t-sm z-50"
      style={{ left: position.x, top: position.y }}
      data-menu="trendline"
    >
      <MenuDragHandle
        onMouseDown={(e) => {
          e.preventDefault();
          onDragStart(e, position);
        }}
        onTouchStart={(e) => {
          onDragStart(e, position);
        }}
      />
      <div className="p-1 flex flex-col gap-1">
        {/* Delete */}
        <MenuButton
          onClick={onDelete}
          className="text-red-400"
          title="Delete"
          icon={
            <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h12M6 6v10a2 2 0 002 2h4a2 2 0 002-2V6M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2" />
            </svg>
          }
        />
        
        {/* Colour */}
        <MenuButton
          onClick={onToggleColorSubmenu}
          active={activeSubmenu === 'color'}
          title="Colour"
          icon={
            <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="10" cy="10" r="7" />
              <circle cx="10" cy="10" r="3" fill={trendlineColor} stroke="none" />
            </svg>
          }
        />
        
        {/* Extend */}
        <MenuButton
          onClick={onToggleExtendSubmenu}
          active={activeSubmenu === 'extend'}
          title="Extend"
          icon={
            <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 10h12M16 10l-4-4M16 10l-4 4" />
            </svg>
          }
        />
        
        {/* Label */}
        <MenuButton
          onClick={onToggleLabelSubmenu}
          active={activeSubmenu === 'label'}
          title="Label"
          icon={
            <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
              <text x="5" y="15" fontSize="14" fontWeight="bold">T</text>
            </svg>
          }
        />
        
        {/* Save as Favorite */}
        <MenuButton
          onClick={onSaveAsFavorite}
          className="text-yellow-400"
          title="Save as Default"
          icon={
            <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
              <path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" />
            </svg>
          }
        />
      </div>
    </div>
  );
}
