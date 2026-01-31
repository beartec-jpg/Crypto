import React, { memo } from 'react';
import { MenuButton } from './MenuButton';
import { MenuDragHandle } from './MenuDragHandle';

interface ChannelMenuProps {
  position: { x: number; y: number };
  channelColor?: string;
  opacity: number;
  onDelete: () => void;
  onMove: () => void;
  onToggleColorSubmenu: () => void;
  onToggleLinesSubmenu: () => void;
  onOpacityChange: (value: number) => void;
  onSaveAsFavorite: () => void;
  onDragStart: (e: React.MouseEvent | React.TouchEvent, position: { x: number; y: number }) => void;
  activeSubmenu: string | null;
}

const ChannelMenuComponent = ({ 
  position, 
  channelColor = '#22c55e',
  opacity,
  onDelete,
  onMove,
  onToggleColorSubmenu,
  onToggleLinesSubmenu,
  onOpacityChange,
  onSaveAsFavorite,
  onDragStart,
  activeSubmenu
}: ChannelMenuProps) => {
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
        
        {/* Opacity Slider */}
        <div className="px-2 py-2 border-t border-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">Opacity:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(opacity * 100)}
              onChange={(e) => onOpacityChange(parseInt(e.target.value) / 100)}
              className="flex-1 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500"
            />
            <span className="text-xs text-slate-300 w-10 text-right">{Math.round(opacity * 100)}%</span>
          </div>
        </div>
        
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
};

ChannelMenuComponent.displayName = 'ChannelMenu';

export const ChannelMenu = memo(ChannelMenuComponent);
