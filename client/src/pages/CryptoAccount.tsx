import { Helmet } from 'react-helmet-async';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import { useCryptoAuth, isDevelopment } from '@/hooks/useCryptoAuth';
import { useQuery } from '@tanstack/react-query';
import { Crown, Sparkles, Info, CreditCard, Waves, Bot, Shield, LogIn, LogOut, User } from 'lucide-react';
import { Link } from 'wouter';
import { SignInButton, SignOutButton, useAuth, useUser } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';

interface SubscriptionData {
  tier: string;
  hasElliottAddon: boolean;
  canUseElliott: boolean;
  canUseAI: boolean;
  hasUnlimitedAI: boolean;
  aiCredits: number;
  status: string;
}

export default function CryptoAccount() {
  const { tier: localTier } = useCryptoAuth();
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  
  const { data: subscription, isLoading } = useQuery<SubscriptionData>({
    queryKey: ['/api/crypto/my-subscription'],
    enabled: isDevelopment || isSignedIn === true,
  });

  const tier = subscription?.tier || localTier || 'free';
  
  const getTierColor = (t: string) => {
    switch (t.toLowerCase()) {
      case 'elite': return 'from-purple-600 to-pink-600';
      case 'pro': return 'from-yellow-600 to-orange-600';
      case 'intermediate': return 'from-blue-600 to-cyan-600';
      case 'beginner': return 'from-green-600 to-emerald-600';
      default: return 'from-slate-600 to-slate-700';
    }
  };

  const getTierBadgeColor = (t: string) => {
    switch (t.toLowerCase()) {
      case 'elite': return 'bg-purple-900/50 text-purple-300 border-purple-500';
      case 'pro': return 'bg-yellow-900/50 text-yellow-300 border-yellow-500';
      case 'intermediate': return 'bg-blue-900/50 text-blue-300 border-blue-500';
      case 'beginner': return 'bg-green-900/50 text-green-300 border-green-500';
      default: return 'bg-slate-800 text-slate-300 border-slate-500';
    }
  };

  const authLoading = !isLoaded && !isDevelopment;

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-20">
      <Helmet>
        <title>Account - Crypto Analysis Platform</title>
        <meta name="description" content="Manage your account and subscription for the crypto trading analysis platform." />
      </Helmet>
      
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Shield className="w-6 h-6 text-blue-400" />
          Account
        </h1>
        
        {isDevelopment && (
          <div className="bg-slate-800/50 rounded-xl p-4 mb-6 border border-green-500/30">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-green-300 mb-1">Development Mode</h3>
                <p className="text-sm text-slate-300">
                  You're running in development mode with Elite tier access for testing all features.
                </p>
              </div>
            </div>
          </div>
        )}

        {!isDevelopment && !isSignedIn && isLoaded && (
          <div className="bg-slate-800/50 rounded-xl p-6 mb-6 border border-blue-500/30">
            <div className="text-center">
              <User className="w-12 h-12 text-blue-400 mx-auto mb-4" />
              <h3 className="font-semibold text-white text-lg mb-2">Sign in to your account</h3>
              <p className="text-sm text-slate-300 mb-4">
                Sign in to access your subscription, save Elliott Wave patterns, and unlock premium features.
              </p>
              <SignInButton mode="modal">
                <Button className="bg-[#00c4b4] hover:bg-[#00a89c] text-black font-medium" data-testid="button-sign-in">
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In with Google
                </Button>
              </SignInButton>
            </div>
          </div>
        )}

        {!isDevelopment && isSignedIn && user && (
          <div className="bg-slate-800/50 rounded-xl p-4 mb-6 border border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {user.imageUrl ? (
                  <img src={user.imageUrl} alt="Profile" className="w-10 h-10 rounded-full" />
                ) : (
                  <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-slate-400" />
                  </div>
                )}
                <div>
                  <p className="font-medium text-white">{user.fullName || user.primaryEmailAddress?.emailAddress}</p>
                  <p className="text-sm text-slate-400">{user.primaryEmailAddress?.emailAddress}</p>
                </div>
              </div>
              <SignOutButton>
                <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" data-testid="button-sign-out">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </SignOutButton>
            </div>
          </div>
        )}
        
        {(authLoading || isLoading) ? (
          <div className="bg-slate-900 rounded-xl p-6 animate-pulse">
            <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-slate-700 rounded w-2/3"></div>
          </div>
        ) : (isDevelopment || isSignedIn) && (
          <>
            <div className={`bg-gradient-to-r ${getTierColor(tier)} rounded-xl p-6 mb-6`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Crown className="w-8 h-8 text-white" />
                  <div>
                    <h2 className="text-xl font-bold capitalize">{tier} Tier</h2>
                    <p className="text-white/80 text-sm">
                      {subscription?.status === 'active' ? 'Active subscription' : 'Current plan'}
                    </p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getTierBadgeColor(tier)}`}>
                  {tier.toUpperCase()}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-black/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Waves className="w-4 h-4" />
                    <span className="text-sm font-medium">Elliott Wave</span>
                  </div>
                  <p className="text-white/80 text-xs">
                    {subscription?.canUseElliott ? 'Enabled' : 'Not available'}
                  </p>
                </div>
                
                <div className="bg-black/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Bot className="w-4 h-4" />
                    <span className="text-sm font-medium">AI Analysis</span>
                  </div>
                  <p className="text-white/80 text-xs">
                    {subscription?.canUseAI 
                      ? subscription?.hasUnlimitedAI 
                        ? 'Unlimited' 
                        : `${subscription?.aiCredits || 0} credits`
                      : 'Not available'}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-400" />
                Quick Actions
              </h3>
              
              <Link href="/crypto/subscribe">
                <div className="bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer transition-all" data-testid="link-manage-subscription">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-5 h-5 text-blue-400" />
                      <div>
                        <h4 className="font-medium">Manage Subscription</h4>
                        <p className="text-sm text-slate-400">View plans and upgrade options</p>
                      </div>
                    </div>
                    <span className="text-slate-500">&rarr;</span>
                  </div>
                </div>
              </Link>
              
              <Link href="/cryptoelliottwave">
                <div className="bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer transition-all" data-testid="link-elliott-wave">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Waves className="w-5 h-5 text-purple-400" />
                      <div>
                        <h4 className="font-medium">Elliott Wave Analysis</h4>
                        <p className="text-sm text-slate-400">Advanced wave pattern analysis</p>
                      </div>
                    </div>
                    <span className="text-slate-500">&rarr;</span>
                  </div>
                </div>
              </Link>
              
              <Link href="/cryptoai">
                <div className="bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer transition-all" data-testid="link-ai-analysis">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bot className="w-5 h-5 text-green-400" />
                      <div>
                        <h4 className="font-medium">AI Market Analysis</h4>
                        <p className="text-sm text-slate-400">Get AI-powered insights</p>
                      </div>
                    </div>
                    <span className="text-slate-500">&rarr;</span>
                  </div>
                </div>
              </Link>
            </div>
          </>
        )}
      </div>
      
      <CryptoNavigation />
    </div>
  );
}
