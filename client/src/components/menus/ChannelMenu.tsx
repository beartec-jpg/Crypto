import React from 'react';
import { MenuButton } from './MenuButton';
import { MenuDragHandle } from './MenuDragHandle';

interface ChannelMenuProps {
  position: { x: number; y: number };
  channelColor?: string;
  onDelete: () => void;
  onMove: () => void;
  onToggleColorSubmenu: () => void;
  onToggleLinesSubmenu: () => void;
  onSaveAsFavorite: () => void;
  onDragStart: (e: React.MouseEvent | React.TouchEvent, position: { x: number; y: number }) => void;
  activeSubmenu: string | null;
}

export function ChannelMenu({ 
  position, 
  channelColor = '#22c55e',
  onDelete,
  onMove,
  onToggleColorSubmenu,
  onToggleLinesSubmenu,
  onSaveAsFavorite,
  onDragStart,
  activeSubmenu
}: ChannelMenuProps) {
  return (
    <div 
      className="absolute flex flex-col gap-1 bg-slate-800 border border-slate-600 rounded-b rounded-t-sm z-50"
      style={{ left: position.x, top: position.y }}
      data-menu="channel"
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
        
        {/* Move */}
        <MenuButton
          onClick={onMove}
          title="Move"
          icon={
            <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 2v16M2 10h16M10 2l-3 3M10 2l3 3M10 18l-3-3M10 18l3-3M2 10l3-3M2 10l3 3M18 10l-3-3M18 10l-3 3" />
            </svg>
          }
        />
        
        {/* Color */}
        <MenuButton
          onClick={onToggleColorSubmenu}
          active={activeSubmenu === 'ch-color'}
          title="Colour"
          icon={
            <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="10" cy="10" r="7" />
              <circle cx="10" cy="10" r="3" fill={channelColor} stroke="none" />
            </svg>
          }
        />
        
        {/* Labels/Lines */}
        <MenuButton
          onClick={onToggleLinesSubmenu}
          active={activeSubmenu === 'ch-lines'}
          title="Lines"
          icon={
            <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 5h16M2 10h16M2 15h16" />
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
