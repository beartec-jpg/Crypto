import React, { memo } from 'react';

interface MenuButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  className?: string;
  title?: string;
  active?: boolean;
}

const MenuButtonComponent = ({ icon, onClick, className = '', title, active = false }: MenuButtonProps) => {
  return (
    <button
      onClick={onClick}
      className={`p-2 hover:bg-slate-700 rounded text-white ${active ? 'bg-slate-600' : ''} ${className}`}
      title={title}
    >
      {icon}
    </button>
  );
};

MenuButtonComponent.displayName = 'MenuButton';

export const MenuButton = memo(MenuButtonComponent);
