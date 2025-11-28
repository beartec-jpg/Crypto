import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Zap, Crown } from "lucide-react";

interface SubscriptionGateProps {
  pipeSize?: number;
  operationType?: string;
  calculatorType?: 'commercial' | 'industrial';
  requiresExport?: boolean;
  children: React.ReactNode;
}

export function SubscriptionGate({ pipeSize, operationType, calculatorType, requiresExport, children }: SubscriptionGateProps) {
  const { data: status, isLoading } = useQuery({
    queryKey: ["/api/subscription-status"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const tier = (status as any)?.tier || 'free';
  const needsUpgrade = checkUpgradeNeeded(tier, pipeSize, operationType, calculatorType, requiresExport);

  if (!needsUpgrade) {
    return <>{children}</>;
  }

  return (
    <div className="space-y-6">
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-amber-600" />
          </div>
          <CardTitle className="text-xl">Upgrade Required</CardTitle>
          <CardDescription>
            {getUpgradeMessage(tier, pipeSize, operationType, calculatorType, requiresExport)}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <SubscriptionPlans currentTier={tier} />
        </CardContent>
      </Card>
    </div>
  );
}

function SubscriptionPlans({ currentTier }: { currentTier: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
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
            <li>✓ Up to 1" pipes</li>
            <li>✓ Commercial calculator only</li>
            <li>✓ Basic tests (strength, tightness)</li>
            <li className="text-muted-foreground">✗ Purge calculations</li>
            <li className="text-muted-foreground">✗ Export certificates</li>
          </ul>
        </CardContent>
      </Card>

      {/* Basic Tier */}
      <Card className={currentTier === 'basic' ? 'ring-2 ring-primary' : 'relative'}>
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-lg flex items-center justify-center gap-2">
            <Zap className="w-4 h-4 text-blue-600" />
            Basic
            {currentTier === 'basic' && <Badge variant="secondary">Current</Badge>}
          </CardTitle>
          <div className="text-2xl font-bold">£1<span className="text-sm font-normal">/month</span></div>
          <CardDescription>Extended pipe testing</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <ul className="space-y-2 text-sm">
            <li>✓ Up to 3" pipes</li>
            <li>✓ Commercial calculator only</li>
            <li>✓ Basic tests (strength, tightness)</li>
            <li className="text-muted-foreground">✗ Purge calculations</li>
            <li className="text-muted-foreground">✗ Export certificates</li>
          </ul>
          {currentTier !== 'basic' && (
            <Button 
              className="w-full"
              onClick={() => startSubscription('basic')}
              data-testid="button-upgrade-basic"
            >
              Upgrade to Basic
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Premium Tier */}
      <Card className={currentTier === 'premium' ? 'ring-2 ring-primary' : 'relative'}>
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-lg flex items-center justify-center gap-2">
            <Crown className="w-4 h-4 text-gray-500" />
            Premium
            {currentTier === 'premium' && <Badge variant="secondary">Current</Badge>}
          </CardTitle>
          <div className="text-2xl font-bold">£2<span className="text-sm font-normal">/month</span></div>
          <CardDescription>Commercial purge testing</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <ul className="space-y-2 text-sm">
            <li>✓ Up to 6" pipes</li>
            <li>✓ Commercial calculator only</li>
            <li>✓ All tests + purge</li>
            <li>✓ Advanced calculations</li>
            <li className="text-muted-foreground">✗ Export certificates</li>
          </ul>
          {currentTier !== 'premium' && (
            <Button 
              className="w-full"
              onClick={() => startSubscription('premium')}
              data-testid="button-upgrade-premium"
            >
              {currentTier === 'basic' ? 'Upgrade to Premium' : 'Upgrade to Premium'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Professional Tier */}
      <Card className={currentTier === 'professional' ? 'ring-2 ring-primary' : 'relative'}>
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-lg flex items-center justify-center gap-2">
            <Crown className="w-4 h-4 text-yellow-600" />
            Professional
            {currentTier === 'professional' && <Badge variant="secondary">Current</Badge>}
          </CardTitle>
          <div className="text-2xl font-bold">£5<span className="text-sm font-normal">/month</span></div>
          <CardDescription>Industrial + export access</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <ul className="space-y-2 text-sm">
            <li>✓ Industrial calculator access</li>
            <li>✓ All pipe sizes (up to 12")</li>
            <li>✓ All tests + purge</li>
            <li>✓ Export certificates</li>
            <li>✓ Custom branding</li>
          </ul>
          {currentTier !== 'professional' && (
            <Button 
              className="w-full bg-yellow-500 hover:bg-yellow-600"
              onClick={() => startSubscription('professional')}
              data-testid="button-upgrade-professional"
            >
              Upgrade to Professional
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function checkUpgradeNeeded(tier: string, pipeSize?: number, operationType?: string, calculatorType?: string, requiresExport?: boolean): boolean {
  // Industrial calculator access - only Professional
  if (calculatorType === 'industrial' && tier !== 'professional') return true;
  
  // Export functionality - only Professional
  if (requiresExport && tier !== 'professional') return true;
  
  // Pipe size restrictions
  if (tier === 'free' && pipeSize && pipeSize > 25) return true; // 1" limit
  if (tier === 'basic' && pipeSize && pipeSize > 76) return true; // 3" limit (76mm)
  if (tier === 'premium' && pipeSize && pipeSize > 152) return true; // 6" limit (152mm)
  
  // Purge operation restrictions
  if (operationType === 'Purge' && (tier === 'free' || tier === 'basic')) return true;
  
  return false;
}

function getUpgradeMessage(tier: string, pipeSize?: number, operationType?: string, calculatorType?: string, requiresExport?: boolean): string {
  if (calculatorType === 'industrial') {
    return `Professional subscription required for Industrial calculator access. Upgrade to access industrial installations and export certificates.`;
  }
  
  if (requiresExport) {
    return `Professional subscription required for PDF export. Upgrade to export branded certificates and access industrial calculator.`;
  }
  
  if (tier === 'free' && pipeSize && pipeSize > 25) { // 25mm = 1"
    return `Basic subscription required for pipes larger than 1". Upgrade to access pipes up to 3" and more features.`;
  }
  
  if (tier === 'basic' && pipeSize && pipeSize > 76) { // 76mm = 3"
    return `Premium subscription required for pipes larger than 3". Upgrade to access pipes up to 6" and purge calculations.`;
  }
  
  if (tier === 'premium' && pipeSize && pipeSize > 152) { // 152mm = 6"
    return `Professional subscription required for pipes larger than 6". Upgrade to access industrial calculator and export certificates.`;
  }
  
  if (operationType === 'Purge' && (tier === 'free' || tier === 'basic')) {
    return `Premium subscription required for purge calculations. Upgrade to access purging features.`;
  }
  
  return "Subscription upgrade required to access this feature.";
}

function startSubscription(tier: 'basic' | 'premium' | 'professional') {
  // This will be implemented with Stripe payment flow
  window.location.href = `/subscribe?tier=${tier}`;
}