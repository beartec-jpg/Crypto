import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Zap, User, Trash2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import beartecLogo from "@assets/Screenshot_20250823-074823_1755931718570.png";
import beartecFooter from "@assets/Screenshot_20250823-075417_1755932088384.png";

function startSubscription(tier: 'basic' | 'premium' | 'professional') {
  window.location.href = `./subscribe?tier=${tier}`;
}

function RefreshSubscriptionButton({ toast }: { toast: any }) {
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/refresh-subscription", {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Subscription Refreshed",
        description: data.message,
      });
      // Invalidate subscription status to refresh the UI
      queryClient.invalidateQueries({ queryKey: ["/api/subscription-status"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Refresh Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Button 
      variant="outline" 
      size="sm"
      onClick={() => refreshMutation.mutate()}
      disabled={refreshMutation.isPending}
      data-testid="button-refresh-subscription"
    >
      {refreshMutation.isPending ? 'Refreshing...' : 'Refresh Status'}
    </Button>
  );
}


function CancelSubscriptionButton({ currentTier: _currentTier, toast }: { currentTier: string; toast: any }) {
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/cancel-subscription", {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Subscription Cancelled",
        description: data.message,
      });
      // Invalidate subscription status to refresh
      queryClient.invalidateQueries({ queryKey: ["/api/subscription-status"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Cancellation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCancel = () => {
    if (confirm('Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.')) {
      cancelMutation.mutate();
    }
  };

  return (
    <Button 
      variant="destructive" 
      size="sm"
      onClick={handleCancel}
      disabled={cancelMutation.isPending}
      data-testid="button-cancel-subscription"
    >
      <Trash2 className="w-4 h-4 mr-2" />
      {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Subscription'}
    </Button>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const { data: subscription } = useQuery({
    queryKey: ["/api/subscription-status"],
    retry: false,
  });

  const currentTier = (subscription as any)?.tier || 'free';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-20 w-full overflow-hidden" style={{
            backgroundImage: `url(${beartecLogo})`,
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex items-center justify-between mb-6">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => window.location.href = '/'}
            className="flex items-center gap-2"
          >
            ← Back to Home
          </Button>
        </div>
        
        <div className="text-center">
          <h1 className="text-3xl font-bold">Account Management</h1>
          <p className="text-muted-foreground mt-2">Manage your subscription and account settings</p>
        </div>

        {/* User Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                <p className="text-sm">{(user as any)?.email || 'Not provided'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Name</label>
                <p className="text-sm">{(user as any)?.firstName || (user as any)?.lastName ? `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim() : 'Not provided'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Subscription */}
        <Card>
          <CardHeader>
            <CardTitle>Current Subscription</CardTitle>
            <CardDescription>Your current plan and billing information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  {currentTier === 'professional' ? (
                    <Crown className="w-5 h-5 text-yellow-600" />
                  ) : currentTier === 'premium' ? (
                    <Crown className="w-5 h-5 text-gray-500" />
                  ) : currentTier === 'basic' ? (
                    <Zap className="w-5 h-5 text-blue-600" />
                  ) : (
                    <User className="w-5 h-5 text-gray-500" />
                  )}
                  <div>
                    <h3 className="font-medium">
                      {currentTier === 'basic' ? 'Basic Plan' :
                       currentTier === 'premium' ? 'Premium Plan' :
                       currentTier === 'professional' ? 'Professional Plan' : 'Free Plan'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {currentTier === 'free' && 'Free plan with basic features'}
                      {currentTier === 'basic' && '£1/month - Full testing capabilities'}
                      {currentTier === 'premium' && '£2/month - Complete solution'}
                      {currentTier === 'professional' && '£5/month - Custom branded reports'}
                    </p>
                  </div>
                </div>
                <Badge className={`flex items-center gap-1 ${
                  currentTier === 'professional' ? 'bg-yellow-100 text-yellow-800' :
                  currentTier === 'premium' ? 'bg-gray-100 text-gray-800' :
                  currentTier === 'basic' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {currentTier === 'premium' ? (<><Crown className="w-3 h-3 text-gray-600" />Pr</>) : 
                   currentTier === 'basic' ? (<><Zap className="w-3 h-3 text-blue-600" />B</>) : 
                   currentTier === 'professional' ? (<><Crown className="w-3 h-3 text-yellow-600" />P</>) : 'F'}
                </Badge>
              </div>
              
              <div className="flex items-center gap-2">
                <RefreshSubscriptionButton toast={toast} />
                {currentTier !== 'free' && (
                  <CancelSubscriptionButton currentTier={currentTier} toast={toast} />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Plans */}
        <Card>
          <CardHeader>
            <CardTitle>Available Plans</CardTitle>
            <CardDescription>Upgrade or change your subscription plan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Free Tier */}
              <Card className={currentTier === 'free' ? 'ring-2 ring-primary' : ''}>
                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-lg flex items-center justify-center gap-2">
                    Free
                    {currentTier === 'free' && <Badge variant="secondary">Current</Badge>}
                  </CardTitle>
                  <div className="text-2xl font-bold">£0</div>
                  <CardDescription>Limited testing</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="space-y-2 text-sm">
                    <li>✓ Up to 1" pipe testing</li>
                    <li>✓ Basic calculations</li>
                    <li className="text-muted-foreground">✗ External reports</li>
                    <li className="text-muted-foreground">✗ PDF certificates</li>
                    <li className="text-muted-foreground">✗ Large pipe testing</li>
                    <li className="text-muted-foreground">✗ Purge calculations</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Basic Tier */}
              <Card className={currentTier === 'basic' ? 'ring-2 ring-primary' : 'relative'}>
                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-lg flex items-center justify-center gap-2">
                    <Zap className="w-4 h-4 text-amber-600" />
                    Basic
                    {currentTier === 'basic' && <Badge variant="secondary">Current</Badge>}
                  </CardTitle>
                  <div className="text-2xl font-bold">£1<span className="text-sm font-normal">/month</span></div>
                  <CardDescription>Full testing capabilities</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  <ul className="space-y-2 text-sm">
                    <li>✓ All pipe sizes</li>
                    <li>✓ Unlimited testing</li>
                    <li>✓ Advanced calculations</li>
                    <li>✓ External reports</li>
                    <li className="text-muted-foreground">✗ PDF certificates</li>
                    <li className="text-muted-foreground">✗ Purge calculations</li>
                  </ul>
                  {currentTier !== 'basic' && (
                    <Button 
                      className="w-full"
                      onClick={() => startSubscription('basic')}
                      data-testid="button-upgrade-basic"
                      variant={currentTier === 'free' ? 'default' : 'outline'}
                    >
                      {currentTier === 'free' ? 'Upgrade to Basic' : 'Downgrade to Basic'}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Premium Tier */}
              <Card className={currentTier === 'premium' ? 'ring-2 ring-primary' : 'relative'}>
                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-lg flex items-center justify-center gap-2">
                    <Crown className="w-4 h-4 text-gray-400" />
                    Premium
                    {currentTier === 'premium' && <Badge variant="secondary">Current</Badge>}
                  </CardTitle>
                  <div className="text-2xl font-bold">£2<span className="text-sm font-normal">/month</span></div>
                  <CardDescription>Complete solution</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  <ul className="space-y-2 text-sm">
                    <li>✓ All Basic features</li>
                    <li>✓ PDF certificates</li>
                    <li>✓ Purge calculations</li>
                    <li>✓ Priority support</li>
                    <li className="text-muted-foreground">✗ Custom company branding</li>
                    <li className="text-muted-foreground">✗ Logo on reports</li>
                  </ul>
                  {currentTier !== 'premium' && (
                    <Button 
                      className="w-full"
                      onClick={() => startSubscription('premium')}
                      data-testid="button-upgrade-premium"
                      variant={currentTier === 'basic' ? 'default' : 'outline'}
                    >
                      {currentTier === 'basic' || currentTier === 'free' ? 'Upgrade to Premium' : 'Downgrade to Premium'}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Professional Tier */}
              <Card className={currentTier === 'professional' ? 'ring-2 ring-primary' : 'relative'}>
                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-lg flex items-center justify-center gap-2">
                    <Crown className="w-4 h-4 text-yellow-500" />
                    Professional
                    {currentTier === 'professional' && <Badge variant="secondary">Current</Badge>}
                  </CardTitle>
                  <div className="text-2xl font-bold">£5<span className="text-sm font-normal">/month</span></div>
                  <CardDescription>Custom branded reports</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  <ul className="space-y-2 text-sm">
                    <li>✓ All Premium features</li>
                    <li>✓ Custom company branding</li>
                    <li>✓ Your logo on reports</li>
                    <li>✓ Custom colors & styling</li>
                    <li>✓ White-label certificates</li>
                  </ul>
                  {currentTier !== 'professional' && (
                    <Button 
                      className="w-full"
                      onClick={() => startSubscription('professional')}
                      data-testid="button-upgrade-professional"
                    >
                      Upgrade to Professional
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Cancellation Section */}
        {currentTier !== 'free' && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-lg text-red-600">Cancel Subscription</CardTitle>
              <CardDescription>
                Canceling will downgrade your account to the free plan at the end of your current billing period.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CancelSubscriptionButton currentTier={currentTier} toast={toast} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer Info */}
      <div className="bg-surface border-t border-border mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col items-center space-y-4">
            {/* Links Row */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
              <Link href="/calculations">
                <Button variant="link" size="sm" className="text-primary hover:underline h-auto p-0">
                  Reference & Calculations
                </Button>
              </Link>
              <Link href="/privacy">
                <Button variant="link" size="sm" className="text-primary hover:underline h-auto p-0">
                  Privacy Policy
                </Button>
              </Link>
              <Link href="/terms">
                <Button variant="link" size="sm" className="text-primary hover:underline h-auto p-0">
                  Terms of Service
                </Button>
              </Link>
              <a href="mailto:info@BearTec.uk" className="text-primary hover:underline">Support</a>
            </div>
            
            {/* Copyright Text */}
            <div className="text-sm text-muted-foreground text-center">
              © 2024 IGE/UP/1 Gas Purging Calculator. For use by qualified Gas Safe registered engineers only.
            </div>
            
            {/* Version */}
            <div className="text-sm text-muted-foreground text-center">
              Version 2.1.0
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-background border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="w-full overflow-hidden" style={{
            backgroundImage: `url(${beartecFooter})`,
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            height: '120px'
          }}>
          </div>
        </div>
      </footer>
    </div>
  );
}