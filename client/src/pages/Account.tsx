import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Zap, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Account() {
  const { user, isAuthenticated } = useAuth();
  const { data: subscription } = useQuery({
    queryKey: ["/api/subscription-status"],
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p>Please log in to view your account.</p>
            <Button asChild className="mt-4">
              <Link href="/">Go to Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tier = (subscription as any)?.tier || 'free';

  const getTierIcon = () => {
    switch (tier) {
      case 'basic': return <Zap className="w-4 h-4" />;
      case 'premium': return <Crown className="w-4 h-4" />;
      case 'professional': return <Crown className="w-4 h-4" />;
      default: return null;
    }
  };

  const getTierVariant = () => {
    switch (tier) {
      case 'basic': return 'secondary';
      case 'premium': return 'default';
      case 'professional': return 'warning';
      default: return 'secondary';
    }
  };

  const getTierName = () => {
    switch (tier) {
      case 'basic': return 'Basic';
      case 'premium': return 'Premium';
      case 'professional': return 'Professional';
      default: return 'Free';
    }
  };

  const getTierPrice = () => {
    switch (tier) {
      case 'basic': return '£1/month';
      case 'premium': return '£2/month';
      case 'professional': return '£5/month';
      default: return 'Free';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Home
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Account</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* User Information */}
          <Card>
            <CardHeader>
              <CardTitle>User Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Email:</span>
                  <p>{(user as any)?.email || 'N/A'}</p>
                </div>
                {(user as any)?.firstName && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Name:</span>
                    <p>{(user as any).firstName} {(user as any).lastName || ''}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Subscription Information */}
          <Card>
            <CardHeader>
              <CardTitle>Subscription</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Current Plan:</span>
                  <Badge variant={getTierVariant() as "default" | "secondary" | "destructive" | "warning" | "outline"} className="flex items-center gap-1">
                    {getTierIcon()}
                    {getTierName()}
                  </Badge>
                </div>
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Price:</span>
                  <p className="text-lg font-semibold">{getTierPrice()}</p>
                </div>
                {tier !== 'professional' && (
                  <Button asChild className="w-full">
                    <Link href="/subscribe?tier=basic">
                      Upgrade Plan
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Features by Tier */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Plan Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {/* Free Features */}
              <div className="space-y-2">
                <h3 className="font-semibold text-muted-foreground">Free</h3>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• Basic calculations</li>
                  <li>• Standard reports</li>
                </ul>
              </div>

              {/* Basic Features */}
              <div className="space-y-2">
                <h3 className="font-semibold text-primary">Basic (£1/month)</h3>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• All Free features</li>
                  <li>• PDF export</li>
                  <li>• Advanced calculations</li>
                </ul>
              </div>

              {/* Professional Features */}
              <div className="space-y-2">
                <h3 className="font-semibold text-warning">Professional (£5/month)</h3>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• All Basic features</li>
                  <li>• Custom company branding</li>
                  <li>• White-label reports</li>
                  <li>• Priority support</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}