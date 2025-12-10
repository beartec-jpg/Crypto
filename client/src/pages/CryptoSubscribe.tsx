import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Waves, AlertCircle, Loader2 } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { isDevelopment } from '@/hooks/useCryptoAuth';
import { useAuth, useUser, SignedIn, SignedOut, SignInButton } from '@clerk/clerk-react';

function useClerkHooks() {
  const auth = useAuth();
  const { user } = useUser();
  
  if (isDevelopment) {
    return {
      isSignedIn: true,
      getToken: async () => 'dev-token',
      user: { firstName: 'Dev', lastName: 'User' }
    };
  }
  return { ...auth, user };
}

function ClerkSignedIn({ children }: { children: React.ReactNode }) {
  if (isDevelopment) {
    return <>{children}</>;
  }
  return <SignedIn>{children}</SignedIn>;
}

function ClerkSignedOut({ children }: { children: React.ReactNode }) {
  if (isDevelopment) {
    return null;
  }
  return <SignedOut>{children}</SignedOut>;
}

function ClerkSignInButton({ children, mode }: { children: React.ReactNode; mode?: string }) {
  if (isDevelopment) {
    return <>{children}</>;
  }
  return <SignInButton mode={mode as any}>{children}</SignInButton>;
}

interface SubscriptionData {
  tier: string;
  hasElliottAddon: boolean;
  canUseElliott: boolean;
  canUseAI: boolean;
  hasUnlimitedAI: boolean;
  aiCredits: number;
  status: string;
  stripeSubscriptionId: string | null;
}

const TIER_PRICES: Record<string, { price: string; description: string }> = {
  free: { price: 'Free', description: 'Basic access' },
  intermediate: { price: '$15/mo', description: '50 AI credits/month' },
  pro: { price: '$30/mo', description: 'Unlimited AI + notifications' },
  elite: { price: '$50/mo', description: 'Everything included' },
};

export default function CryptoSubscribe() {
  const { isSignedIn, getToken, user } = useClerkHooks();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  
  const { data: subscription, isLoading } = useQuery<SubscriptionData>({
    queryKey: ['/api/crypto/my-subscription'],
    enabled: isSignedIn,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      toast({
        title: 'Subscription updated!',
        description: 'Your subscription has been successfully updated.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/my-subscription'] });
      window.history.replaceState({}, '', '/cryptosubscribe');
    } else if (params.get('canceled') === 'true') {
      toast({
        title: 'Checkout canceled',
        description: 'Your subscription was not changed.',
        variant: 'destructive',
      });
      window.history.replaceState({}, '', '/cryptosubscribe');
    }
  }, [toast, queryClient]);

  const checkoutMutation = useMutation({
    mutationFn: async ({ tier, type, action }: { tier?: string; type: string; action?: string }) => {
      const token = await getToken();
      if (!token) {
        throw new Error('Please sign in to manage your subscription');
      }

      const response = await fetch('/api/crypto/checkout', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          tier,
          type,
          action,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Checkout failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else if (data.message) {
        toast({
          title: 'Success',
          description: data.message,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/crypto/my-subscription'] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubscribe = (tier: string) => {
    checkoutMutation.mutate({ tier, type: 'subscription' });
  };

  const handleAddon = () => {
    checkoutMutation.mutate({ type: 'addon' });
  };

  const handleManage = () => {
    checkoutMutation.mutate({ type: 'manage', action: 'portal' });
  };

  const currentTier = subscription?.tier || 'free';
  const hasElliottAddon = subscription?.hasElliottAddon || false;

  const tiers = [
    {
      name: 'Free',
      tier: 'free',
      price: 'Free',
      description: 'Get started with basic features',
      features: [
        'Basic chart indicators',
        'Standard timeframes',
        'Price alerts (limited)',
      ],
      current: currentTier === 'free',
    },
    {
      name: 'Intermediate',
      tier: 'intermediate',
      price: '£15/mo',
      description: 'Enhanced trading tools',
      features: [
        'All Free features',
        '50 AI credits/month',
        'Advanced indicators',
        'CCI & ADX alerts',
      ],
      current: currentTier === 'intermediate',
      popular: true,
    },
    {
      name: 'Pro',
      tier: 'pro',
      price: '£30/mo',
      description: 'Professional trading suite',
      features: [
        'All Intermediate features',
        'Unlimited AI analysis',
        'Priority notifications',
        'Multi-timeframe analysis',
      ],
      current: currentTier === 'pro',
    },
    {
      name: 'Elite',
      tier: 'elite',
      price: '£50/mo',
      description: 'Complete trading arsenal',
      features: [
        'All Pro features',
        'Elliott Wave analysis',
        'Wave Stack system',
        'Predictive projections',
        'Priority support',
      ],
      current: currentTier === 'elite',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-20">
      <CryptoNavigation />
      
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-gray-400 text-lg">
            Unlock powerful trading tools and analysis features
          </p>
        </div>

        <ClerkSignedOut>
          <Card className="max-w-md mx-auto bg-slate-900 border-slate-800 mb-8">
            <CardContent className="pt-6 text-center">
              <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Sign in to Subscribe</h3>
              <p className="text-gray-400 mb-4">
                Create an account or sign in to access premium features
              </p>
              <ClerkSignInButton mode="modal">
                <Button className="bg-cyan-600 hover:bg-cyan-700">
                  Sign In
                </Button>
              </ClerkSignInButton>
            </CardContent>
          </Card>
        </ClerkSignedOut>

        <ClerkSignedIn>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                {tiers.map((tier) => (
                  <Card 
                    key={tier.tier}
                    className={`bg-slate-900 border-slate-800 relative ${
                      tier.current ? 'ring-2 ring-cyan-500' : ''
                    } ${tier.popular ? 'border-cyan-500' : ''}`}
                  >
                    {tier.popular && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <Badge className="bg-cyan-600 text-white">Most Popular</Badge>
                      </div>
                    )}
                    {tier.current && (
                      <div className="absolute -top-3 right-4">
                        <Badge className="bg-green-600 text-white">Current</Badge>
                      </div>
                    )}
                    <CardHeader>
                      <CardTitle className="text-xl">{tier.name}</CardTitle>
                      <CardDescription className="text-gray-400">
                        {tier.description}
                      </CardDescription>
                      <div className="text-3xl font-bold text-white mt-2">
                        {tier.price}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 mb-6">
                        {tier.features.map((feature, idx) => (
                          <li key={idx} className="flex items-center gap-2 text-sm text-gray-300">
                            <Check className="w-4 h-4 text-cyan-500" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      {tier.tier === 'free' ? (
                        tier.current ? (
                          <Button disabled className="w-full bg-slate-700">
                            Current Plan
                          </Button>
                        ) : (
                          <Button 
                            onClick={handleManage}
                            className="w-full bg-slate-700 hover:bg-slate-600"
                          >
                            Downgrade
                          </Button>
                        )
                      ) : tier.current ? (
                        <Button 
                          onClick={handleManage}
                          className="w-full bg-slate-700 hover:bg-slate-600"
                        >
                          Manage Subscription
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handleSubscribe(tier.tier)}
                          disabled={checkoutMutation.isPending}
                          className="w-full bg-cyan-600 hover:bg-cyan-700"
                        >
                          {checkoutMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            `Subscribe to ${tier.name}`
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {currentTier !== 'elite' && (
                <Card className="max-w-2xl mx-auto bg-gradient-to-r from-purple-900/50 to-pink-900/50 border-purple-500">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Waves className="w-8 h-8 text-purple-400" />
                      <div>
                        <CardTitle>Elliott Wave Add-on</CardTitle>
                        <CardDescription className="text-purple-300">
                          Advanced wave analysis for any subscription tier
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-2xl font-bold text-white">£10/mo</p>
                        <p className="text-sm text-purple-300">
                          Add Elliott Wave analysis to your current plan
                        </p>
                      </div>
                      {hasElliottAddon ? (
                        <Badge className="bg-green-600 text-white">Active</Badge>
                      ) : (
                        <Button
                          onClick={handleAddon}
                          disabled={checkoutMutation.isPending}
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          {checkoutMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Add Elliott Wave'
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </ClerkSignedIn>
      </div>
    </div>
  );
}
