import { Helmet } from 'react-helmet-async';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import { useCryptoAuth, isDevelopment } from '@/hooks/useCryptoAuth';
import { useQuery } from '@tanstack/react-query';
import { Crown, Sparkles, Info, CreditCard, Waves, Bot, Shield, LogIn, LogOut, User } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { useAuth, useUser, SignInButton, SignOutButton } from '@clerk/clerk-react';

function useClerkHooks() {
  // In development, skip Clerk hooks entirely to avoid ClerkProvider requirement
  if (isDevelopment) {
    return {
      isSignedIn: true,
      isLoaded: true,
      user: { firstName: 'Dev', lastName: 'User', primaryEmailAddress: { emailAddress: 'dev@open.access' }, imageUrl: null }
    };
  }
  
  // In production, use real Clerk hooks
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const auth = useAuth();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { user } = useUser();
  
  return { ...auth, user };
}

function ClerkSignInButton({ children, mode }: { children: React.ReactNode; mode?: string }) {
  if (isDevelopment) {
    return <>{children}</>;
  }
  return <SignInButton mode={mode as any}>{children}</SignInButton>;
}

function ClerkSignOutButton({ children }: { children: React.ReactNode }) {
  if (isDevelopment) {
    return <>{children}</>;
  }
  return <SignOutButton>{children}</SignOutButton>;
}

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
  const { tier: localTier, subscription: authSubscription, isAdmin } = useCryptoAuth();
  const { isSignedIn, isLoaded, user } = useClerkHooks();
  
  const { data: apiSubscription, isLoading } = useQuery<SubscriptionData>({
    queryKey: ['/api/crypto/my-subscription'],
    enabled: isDevelopment || isSignedIn === true,
  });

  // Admin users get the overridden subscription from useCryptoAuth
  const subscription = isAdmin ? authSubscription as SubscriptionData : apiSubscription;
  const tier = isAdmin ? 'elite' : (subscription?.tier || localTier || 'free');
  
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
  const showContent = isDevelopment || isSignedIn;

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-20">
      <Helmet>
        <title>Account | BearTec Crypto</title>
        <meta name="description" content="Manage your BearTec Crypto account and subscription" />
      </Helmet>
      
      <CryptoNavigation />
      
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">My Account</h1>
        
        {authLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
          </div>
        ) : !showContent ? (
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center">
            <LogIn className="w-12 h-12 text-cyan-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Sign In Required</h2>
            <p className="text-gray-400 mb-6">Please sign in to view your account</p>
            <ClerkSignInButton mode="modal">
              <Button className="bg-cyan-600 hover:bg-cyan-700">
                <LogIn className="w-4 h-4 mr-2" />
                Sign In
              </Button>
            </ClerkSignInButton>
          </div>
        ) : (
          <div className="space-y-6">
            {/* User Info Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
              <div className="flex items-center gap-4 mb-6">
                {user?.imageUrl ? (
                  <img src={user.imageUrl} alt="Profile" className="w-16 h-16 rounded-full" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                    <User className="w-8 h-8 text-gray-500" />
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-bold">
                    {isAdmin ? 'BearTec' : `${user?.firstName} ${user?.lastName}`}
                  </h2>
                  <p className="text-gray-400">{user?.primaryEmailAddress?.emailAddress}</p>
                </div>
              </div>
              
              {!isDevelopment && (
                <ClerkSignOutButton>
                  <Button variant="outline" className="border-slate-700 text-gray-300">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </ClerkSignOutButton>
              )}
            </div>

            {/* Subscription Card */}
            <div className={`bg-gradient-to-r ${getTierColor(tier)} p-1 rounded-lg`}>
              <div className="bg-slate-900 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Crown className="w-6 h-6 text-yellow-400" />
                    <h3 className="text-lg font-bold">Subscription</h3>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getTierBadgeColor(tier)}`}>
                    {tier.charAt(0).toUpperCase() + tier.slice(1)}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <Bot className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">AI Credits</p>
                    <p className="text-lg font-bold">
                      {subscription?.hasUnlimitedAI ? '∞' : subscription?.aiCredits || 0}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <Waves className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Elliott Wave</p>
                    <p className="text-lg font-bold">
                      {subscription?.canUseElliott ? 'Active' : 'Locked'}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <Sparkles className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">AI Analysis</p>
                    <p className="text-lg font-bold">
                      {subscription?.canUseAI ? 'Active' : 'Locked'}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <Shield className="w-6 h-6 text-green-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Status</p>
                    <p className="text-lg font-bold capitalize">
                      {subscription?.status || 'Active'}
                    </p>
                  </div>
                </div>

                <Link href="/cryptosubscribe">
                  <Button className="w-full bg-cyan-600 hover:bg-cyan-700">
                    <CreditCard className="w-4 h-4 mr-2" />
                    Manage Subscription
                  </Button>
                </Link>
              </div>
            </div>

            {/* Info */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-cyan-400 mt-0.5" />
                <div className="text-sm text-gray-400">
                  <p className="mb-1">
                    Your subscription renews automatically each month. You can cancel anytime from the subscription management page.
                  </p>
                  <p>
                    Need help? Contact support at <a href="mailto:support@beartec.uk" className="text-cyan-400 hover:underline">support@beartec.uk</a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
