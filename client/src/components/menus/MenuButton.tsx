import React from 'react';

interface MenuButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  className?: string;
  title?: string;
  active?: boolean;
}

export function MenuButton({ icon, onClick, className = '', title, active = false }: MenuButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`p-2 hover:bg-slate-700 rounded text-white ${active ? 'bg-slate-600' : ''} ${className}`}
      title={title}
    >
      {icon}
    </button>
  );
}
