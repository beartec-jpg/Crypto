import { Helmet } from 'react-helmet-async';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { useQuery } from '@tanstack/react-query';
import { Crown, Sparkles, Info, CreditCard, Waves, Bot, Shield } from 'lucide-react';
import { Link } from 'wouter';

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
  
  const { data: subscription, isLoading } = useQuery<SubscriptionData>({
    queryKey: ['/api/crypto/my-subscription'],
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
        
        <div className="bg-slate-800/50 rounded-xl p-4 mb-6 border border-blue-500/30">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-blue-300 mb-1">Open Access Mode</h3>
              <p className="text-sm text-slate-300">
                This platform is currently in open access mode. All features are available without requiring login. 
                Your settings and preferences are stored locally.
              </p>
            </div>
          </div>
        </div>
        
        {isLoading ? (
          <div className="bg-slate-900 rounded-xl p-6 animate-pulse">
            <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-slate-700 rounded w-2/3"></div>
          </div>
        ) : (
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
