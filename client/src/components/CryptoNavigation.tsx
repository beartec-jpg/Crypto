import { Link, useLocation } from 'wouter';
import { BarChart3, Bot, GraduationCap, User, Waves } from 'lucide-react';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';

export function CryptoNavigation() {
  const [location] = useLocation();
  
  const navItems = [
    { path: '/crypto/training', icon: GraduationCap, label: 'Training' },
    { path: '/cryptoindicators', icon: BarChart3, label: 'Indicators' },
    { path: '/cryptoai', icon: Bot, label: 'AI Analysis' },
    { path: '/cryptoelliottwave', icon: Waves, label: 'Waves' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-around py-3">
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
                  className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              </Link>
            );
          })}
          
          {/* Account / Login button */}
          <SignedOut>
            <SignInButton mode="modal">
              <button
                className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all text-slate-400 hover:text-white hover:bg-slate-800"
                data-testid="button-login"
              >
                <User className="w-5 h-5" />
                <span className="text-xs font-medium">Login</span>
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <div className="flex flex-col items-center gap-1 px-4 py-2">
              <UserButton 
                afterSignOutUrl="/" 
                appearance={{
                  elements: {
                    avatarBox: "w-5 h-5"
                  }
                }}
              />
              <span className="text-xs font-medium text-slate-400">Account</span>
            </div>
          </SignedIn>
        </div>
      </div>
    </div>
  );
}
