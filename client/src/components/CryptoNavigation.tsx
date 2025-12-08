import { Link, useLocation } from 'wouter';
import { BarChart3, Bot, GraduationCap, Waves, Crown, CreditCard, User } from 'lucide-react';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { useQuery } from '@tanstack/react-query';

interface SubscriptionData {
  tier: string;
  hasElliottAddon: boolean;
  canUseElliott: boolean;
  canUseAI: boolean;
}

export function CryptoNavigation() {
  const [location] = useLocation();
  const { tier: localTier } = useCryptoAuth();
  
  const { data: subData } = useQuery<SubscriptionData>({
    queryKey: ['/api/crypto/my-subscription'],
  });
  
  const tier = subData?.tier || localTier || 'free';
  
  const getTierColor = (t: string) => {
    switch (t.toLowerCase()) {
      case 'elite': return 'text-purple-400 bg-purple-900/50';
      case 'pro': return 'text-yellow-400 bg-yellow-900/50';
      case 'intermediate': return 'text-blue-400 bg-blue-900/50';
      case 'beginner': return 'text-green-400 bg-green-900/50';
      default: return 'text-slate-400 bg-slate-800';
    }
  };
  
  const navItems = [
    { path: '/crypto/training', icon: GraduationCap, label: 'Training' },
    { path: '/cryptoindicators', icon: BarChart3, label: 'Charts' },
    { path: '/cryptoai', icon: Bot, label: 'AI' },
    { path: '/cryptoelliottwave', icon: Waves, label: 'Waves' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 z-50">
      <div className="max-w-7xl mx-auto px-2 sm:px-4">
        <div className="flex items-center justify-around py-2 sm:py-3">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.path}
                href={item.path}
                data-testid={`link-nav-${item.label.toLowerCase().replace(' ', '-')}`}
              >
                <button
                  className={`flex flex-col items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="text-[10px] sm:text-xs font-medium">{item.label}</span>
                </button>
              </Link>
            );
          })}
          
          <Link href="/crypto/subscribe" data-testid="link-subscribe">
            <button
              className={`flex flex-col items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-all ${
                location === '/crypto/subscribe'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-[10px] sm:text-xs font-medium">Plans</span>
            </button>
          </Link>
          
          <Link href="/crypto/account" data-testid="link-account">
            <button
              className={`flex flex-col items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-all ${
                location === '/crypto/account'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <User className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-[10px] sm:text-xs font-medium">Account</span>
            </button>
          </Link>
          
          <Link href="/crypto/account" data-testid="tier-indicator">
            <button
              className={`flex flex-col items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg ${getTierColor(tier)}`}
            >
              <Crown className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-[10px] sm:text-xs font-medium capitalize">{tier}</span>
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
