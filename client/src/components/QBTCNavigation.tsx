import { Link, useLocation } from 'wouter';
import { ArrowLeftRight, Droplets, House, Pickaxe, TrendingUp } from 'lucide-react';

const navItems = [
  { href: '/qbtc', paths: ['/qbtc'], label: 'Home', icon: House },
  { href: '/qbtc-mine', paths: ['/qbtc-mine', '/crypto/qbtc-mine'], label: 'Mine', icon: Pickaxe },
  { href: '/qbtc-faucet', paths: ['/qbtc-faucet', '/crypto/qbtc-faucet'], label: 'Faucet', icon: Droplets },
  { href: '/qbtc-scan', paths: ['/qbtc-scan', '/crypto/qbtc-scan'], label: 'Scan', icon: TrendingUp },
  { href: '/marketplace', paths: ['/marketplace'], label: 'Swap', icon: ArrowLeftRight },
];

export default function QBTCNavigation() {
  const [location] = useLocation();

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 z-50">
      <div className="max-w-5xl mx-auto px-2 sm:px-4">
        <div className="flex items-center justify-around py-2 sm:py-3">
          {navItems.map((item) => {
            const isActive = item.paths.includes(location);
            const Icon = item.icon;

            return (
              <Link key={item.href} href={item.href}>
                <button
                  className={`flex flex-col items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-all ${
                    isActive
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="text-[10px] sm:text-xs font-medium">{item.label}</span>
                </button>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
