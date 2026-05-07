import { Wallet, MessageCircle } from 'lucide-react';

interface BottomNavProps {
  active: 'wallet' | 'messenger';
  onChange: (tab: 'wallet' | 'messenger') => void;
}

export default function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="flex border-t border-slate-700 bg-slate-900 safe-bottom">
      {(['wallet', 'messenger'] as const).map(tab => {
        const isActive = active === tab;
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors
              ${isActive ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {tab === 'wallet'
              ? <Wallet size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              : <MessageCircle size={22} strokeWidth={isActive ? 2.5 : 1.8} />
            }
            <span className="capitalize">{tab}</span>
          </button>
        );
      })}
    </nav>
  );
}
