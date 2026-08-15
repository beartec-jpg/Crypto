import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { isDevelopment } from '@/hooks/useCryptoAuth';
import { useAuth, useUser, SignedIn, SignedOut, SignInButton } from '@clerk/clerk-react';

function useClerkHooks() {
  // In development, return mock values without calling Clerk hooks
  if (isDevelopment) {
    return {
      isSignedIn: true,
      getToken: async () => 'dev-token',
      user: { firstName: 'Dev', lastName: 'User' }
    };
  }
  
  // Only call Clerk hooks in production
  const auth = useAuth();
  const { user } = useUser();
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
  canUseElliott: boolean;
  canUseAI: boolean;
  hasUnlimitedAI: boolean;
  aiCredits: number;
  status: string;
  stripeSubscriptionId: string | null;
}

export default function CryptoSubscribe() {
  const { isSignedIn, getToken } = useClerkHooks();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
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
      if (data.upgraded && data.message) {
        // Direct upgrade completed - show success and refresh
        toast({
          title: 'Subscription Upgraded!',
          description: data.message,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/crypto/my-subscription'] });
        // Still redirect to success URL if provided
        if (data.url) {
          window.location.href = data.url;
        }
      } else if (data.url) {
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
    checkoutMutation.mutate({ tier, type: 'base_tier' });
  };

  const handleManage = () => {
    checkoutMutation.mutate({ type: 'portal' });
  };

  const currentTier = subscription?.tier || 'free';

  const tiers = [
    {
      name: 'Free',
      tier: 'free',
      price: 'Free',
      description: 'Charts and tools with an email signup',
      features: [
        'Full indicator page after email signup',
        'All oscillators, drawings, and SMC tools',
        'Auto-Fibonacci and training lessons',
        'No AI trade ideas',
      ],
      current: currentTier === 'free' || currentTier === 'beginner',
    },
    {
      name: 'Core',
      tier: 'intermediate',
      price: '£15/mo',
      description: 'AI usage for one nominated ticker',
      features: [
        'Everything on Free',
        '1 nominated ticker on the AI page',
        '80 AI tokens / month',
        'General analysis = 1 token',
        'Deep dive = 1 token',
        'About 40 general+deep pair reads',
      ],
      current: currentTier === 'intermediate',
      popular: true,
    },
    {
      name: 'Pro',
      tier: 'pro',
      price: '£30/mo',
      description: 'AI usage for three nominated tickers',
      features: [
        'Everything in Core',
        '3 nominated tickers on the AI page',
        '160 AI tokens / month',
        'General analysis = 1 token',
        'Deep dive = 1 token',
        'About 80 general+deep pair reads',
      ],
      current: currentTier === 'pro',
    },
    {
      name: 'Elite',
      tier: 'elite',
      price: '£50/mo',
      description: 'AI usage for five nominated tickers',
      features: [
        'Everything in Pro',
        '5 nominated tickers on the AI page',
        '270 AI tokens / month',
        'General analysis = 1 token',
        'Deep dive = 1 token',
        'About 135 general+deep pair reads',
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
          <h1 className="text-4xl font-bold mb-4">AI usage plans</h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Charts and indicators are free with an email signup. Paid plans only add AI trade ideas —
            each general reading or deep dive uses 1 token.
          </p>
        </div>

        <ClerkSignedOut>
          <Card className="max-w-md mx-auto bg-slate-900 border-slate-800 mb-8">
            <CardContent className="pt-6 text-center">
              <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Sign in to manage a plan</h3>
              <p className="text-gray-400 mb-4">
                Create a free account for charts. Subscribe only if you want AI usage on nominated tickers.
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
                      <CardTitle className="text-xl text-white">{tier.name}</CardTitle>
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
              <p className="text-center text-sm text-slate-500 max-w-3xl mx-auto">
                Tokens are sized for about 50% margin after model cost (about £0.07 per token blended).
                A general overview and a deep dive on the same ticker use 2 tokens. Unused tokens reset each month.
              </p>
            </>
          )}
        </ClerkSignedIn>
      </div>
    </div>
  );
}
