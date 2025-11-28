import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LogOut, Crown, Zap, Settings, MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

export function UserHeader() {
  const { user, isAuthenticated } = useAuth();
  const { data: subscription } = useQuery({
    queryKey: ["/api/subscription-status"],
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) return null;

  const tier = (subscription as any)?.tier || 'free';

  const getTierIcon = () => {
    switch (tier) {
      case 'basic': return <Zap className="w-3 h-3" />;
      case 'premium': return <Crown className="w-3 h-3" />;
      case 'professional': return <Crown className="w-3 h-3" />;
      default: return null;
    }
  };

  const getTierLetter = () => {
    switch (tier) {
      case 'basic': return 'B';
      case 'premium': return 'Pr';
      case 'professional': return 'P';
      default: return 'F';
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

  return (
    <div className="flex items-center justify-between py-3 mb-4">
      {/* Left side - Home text */}
      <div className="text-xl font-semibold">Home</div>
      
      {/* Right side - User info and controls */}
      <div className="flex items-center gap-3">
        {/* User badge with tier - clickable to subscription page */}
        <div className="flex items-center gap-2">
          <Badge 
            variant={getTierVariant() as "default" | "secondary" | "destructive" | "warning" | "outline"}
            className="flex items-center gap-1 cursor-pointer hover:opacity-80" 
            data-testid="badge-subscription-tier"
            onClick={() => window.location.href = '/account'}
          >
            {getTierIcon()}
            {getTierLetter()}
          </Badge>
        </div>
        
        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => window.location.href = '/feedback'}
            data-testid="button-feedback"
            className=""
            title="Give Feedback"
          >
            <MessageCircle className="w-4 h-4" />
          </Button>
          {tier === 'professional' && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => window.location.href = '/settings'}
              data-testid="button-settings"
              className=""
            >
              <Settings className="w-4 h-4" />
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => window.location.href = '/api/logout'}
            data-testid="button-logout"
            className=""
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}