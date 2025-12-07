import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Waves, AlertCircle, Loader2 } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SignedIn, SignedOut, SignInButton, useAuth, useUser } from '@clerk/clerk-react';
import { CryptoNavigation } from '@/components/CryptoNavigation';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

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
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  
  const { data: subscription, isLoading } = useQuery<SubscriptionData>({
    queryKey: ['/api/crypto/my-subscription'],
    enabled: isSignedIn,
  });

  // Handle success/cancel URL params
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

  // Checkout mutation
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
      } else if (data.added || data.success) {
        toast({
          title: 'Subscription updated!',
          description: data.message || 'Your subscription has been updated.',
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

  const handleTierSelect = (tier: string) => {
    if (tier === 'free') {
      // Open portal to cancel/downgrade
      checkoutMutation.mutate({ type: 'portal' });
    } else {
      checkoutMutation.mutate({ tier, type: 'base_tier' });
    }
  };

  const handleAddElliott = () => {
    checkoutMutation.mutate({ type: 'elliott_addon' });
  };

  const handleCancelElliott = () => {
    checkoutMutation.mutate({ type: 'cancel_elliott', action: 'cancel_elliott' });
  };

  const currentTier = subscription?.tier || 'free';
  const canUseElliott = subscription?.canUseElliott || false;

  const tiers = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      period: 'forever',
      features: ['View all pages', 'Basic chart access', 'Training content'],
      highlight: false,
    },
    {
      id: 'intermediate',
      name: 'Intermediate',
      price: '$15',
      period: '/month',
      features: ['Everything in Free', '50 AI credits/month', 'AI market analysis'],
      highlight: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$30',
      period: '/month',
      features: ['Everything in Intermediate', 'Unlimited AI credits*', 'Push notifications', 'Priority support'],
      highlight: true,
      footnote: '*Daily limits apply to maintain service quality',
    },
    {
      id: 'elite',
      name: 'Elite',
      price: '$50',
      period: '/month',
      features: ['Everything in Pro', 'Elliott Wave tools (included)', 'Custom indicators & features on request**', 'Early access to new features'],
      highlight: false,
      footnote: '**Subject to complexity and availability',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 to-zinc-900 pb-24">
      <div className="max-w-6xl mx-auto p-4 pt-8">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Subscription Plans</h1>
          <p className="text-zinc-400">Choose the plan that fits your trading needs</p>
        </div>

        <SignedOut>
          <Card className="max-w-md mx-auto bg-zinc-900/80 border-zinc-800 mb-8">
            <CardContent className="pt-6 text-center">
              <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Sign in to manage subscriptions</h3>
              <p className="text-zinc-400 mb-4">Create an account or sign in to subscribe and manage your plan.</p>
              <SignInButton mode="modal">
                <Button className="bg-blue-600 hover:bg-blue-700" data-testid="button-signin">
                  Sign In / Create Account
                </Button>
              </SignInButton>
            </CardContent>
          </Card>
        </SignedOut>

        <SignedIn>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
          ) : (
            <>
              <Card className="bg-zinc-900/80 border-zinc-800 mb-8">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    Current Plan
                    <Badge variant="secondary" className="ml-2 capitalize">
                      {currentTier}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-zinc-400">
                    {subscription?.status === 'active' ? 'Your subscription is active' : 'No active subscription'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4">
                    <div className="bg-zinc-800/50 rounded-lg p-4 flex-1 min-w-[200px]">
                      <p className="text-zinc-400 text-sm">Base Tier</p>
                      <p className="text-white text-lg font-semibold capitalize">{currentTier}</p>
                      <p className="text-zinc-500 text-sm">{TIER_PRICES[currentTier]?.price}</p>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-4 flex-1 min-w-[200px]">
                      <p className="text-zinc-400 text-sm">Elliott Wave Add-on</p>
                      <p className="text-white text-lg font-semibold">
                        {canUseElliott ? (
                          <span className="text-green-400">Active</span>
                        ) : (
                          <span className="text-zinc-500">Not subscribed</span>
                        )}
                      </p>
                      <p className="text-zinc-500 text-sm">$10/month</p>
                    </div>
                    {subscription?.canUseAI && (
                      <div className="bg-zinc-800/50 rounded-lg p-4 flex-1 min-w-[200px]">
                        <p className="text-zinc-400 text-sm">AI Credits</p>
                        <p className="text-white text-lg font-semibold">
                          {subscription?.hasUnlimitedAI ? 'Unlimited*' : subscription?.aiCredits || 0}
                        </p>
                        <p className="text-zinc-500 text-sm">
                          {subscription?.hasUnlimitedAI ? (
                            <span>*Daily limits apply ({currentTier === 'elite' ? '11' : '7'}/day)</span>
                          ) : 'Resets monthly'}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border-purple-800/50 mb-8">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Waves className="w-8 h-8 text-purple-400" />
                    <div>
                      <CardTitle className="text-white">Elliott Wave Add-on</CardTitle>
                      <CardDescription className="text-purple-300">
                        $10/month - Works with any tier
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-zinc-300">
                        <Check className="w-4 h-4 text-purple-400" />
                        <span>Draw and label Elliott Waves</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-300">
                        <Check className="w-4 h-4 text-purple-400" />
                        <span>AI-powered wave validation</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-zinc-300">
                        <Check className="w-4 h-4 text-purple-400" />
                        <span>Fibonacci projections</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-300">
                        <Check className="w-4 h-4 text-purple-400" />
                        <span>Multi-degree wave analysis</span>
                      </div>
                    </div>
                  </div>
                  {canUseElliott ? (
                    currentTier === 'elite' ? (
                      <p className="text-green-400 text-sm">Included with your Elite subscription</p>
                    ) : (
                      <Button 
                        variant="outline" 
                        className="border-red-600 text-red-400 hover:bg-red-900/20" 
                        data-testid="button-cancel-elliott"
                        onClick={handleCancelElliott}
                        disabled={checkoutMutation.isPending}
                      >
                        {checkoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Cancel Elliott Add-on
                      </Button>
                    )
                  ) : (
                    <Button 
                      className="bg-purple-600 hover:bg-purple-700" 
                      data-testid="button-add-elliott"
                      onClick={handleAddElliott}
                      disabled={checkoutMutation.isPending}
                    >
                      {checkoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Add Elliott Wave - $10/mo
                    </Button>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </SignedIn>

        <h2 className="text-2xl font-bold text-white text-center mb-6">Choose Your Base Plan</h2>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {tiers.map((tier) => (
            <Card 
              key={tier.id}
              className={`relative ${
                tier.highlight 
                  ? 'bg-gradient-to-b from-blue-900/50 to-zinc-900/80 border-blue-600' 
                  : 'bg-zinc-900/80 border-zinc-800'
              }`}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-blue-600">Popular</Badge>
                </div>
              )}
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-white">{tier.name}</CardTitle>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-3xl font-bold text-white">{tier.price}</span>
                  <span className="text-zinc-400 text-sm">{tier.period}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {tier.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-zinc-300">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                {'footnote' in tier && tier.footnote && (
                  <p className="text-xs text-zinc-500 italic mt-2">{tier.footnote}</p>
                )}
                <SignedIn>
                  {currentTier === tier.id ? (
                    <Button disabled className="w-full bg-zinc-700" data-testid={`button-current-${tier.id}`}>
                      Current Plan
                    </Button>
                  ) : (
                    <Button 
                      className={`w-full ${tier.highlight ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                      variant={tier.highlight ? 'default' : 'outline'}
                      data-testid={`button-select-${tier.id}`}
                      onClick={() => handleTierSelect(tier.id)}
                      disabled={checkoutMutation.isPending}
                    >
                      {checkoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      {tier.id === 'free' ? 'Manage Subscription' : 'Upgrade'}
                    </Button>
                  )}
                </SignedIn>
                <SignedOut>
                  <SignInButton mode="modal">
                    <Button 
                      className={`w-full ${tier.highlight ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                      variant={tier.highlight ? 'default' : 'outline'}
                      data-testid={`button-signup-${tier.id}`}
                    >
                      Get Started
                    </Button>
                  </SignInButton>
                </SignedOut>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center text-zinc-500 text-sm space-y-2">
          <p>All plans include a 7-day free trial. Cancel anytime.</p>
          <p>
            Questions? Contact us at{' '}
            <a href="mailto:info@BearTec.uk" className="text-blue-400 hover:underline">
              info@BearTec.uk
            </a>
          </p>
          <div className="flex justify-center gap-4 pt-4">
            <Link href="/cryptoterms">
              <span className="text-zinc-400 hover:text-white cursor-pointer">Terms of Service</span>
            </Link>
            <Link href="/cryptoprivacy">
              <span className="text-zinc-400 hover:text-white cursor-pointer">Privacy Policy</span>
            </Link>
          </div>
        </div>
      </div>
      
      <CryptoNavigation />
    </div>
  );
}
