import { useAuth, useUser } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';

interface CryptoUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
}

interface DailyUsage {
  used: number;
  limit: number;
  remainingToday: number;
}

interface CryptoSubscription {
  id: string;
  userId: string;
  tier: string;
  subscriptionStatus: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  aiCredits?: number;
  hasElliottAddon?: boolean;
  canUseElliott?: boolean;
  canUseAI?: boolean;
  hasUnlimitedAI?: boolean;
  dailyUsage?: DailyUsage;
  createdAt?: Date;
  updatedAt?: Date;
}

export function useCryptoAuth() {
  const { isSignedIn, getToken, isLoaded } = useAuth();
  const { user } = useUser();
  
  const { data: subscription, isLoading: subscriptionLoading, refetch: refetchSubscription } = useQuery<CryptoSubscription>({
    queryKey: ['/api/crypto/my-subscription'],
    enabled: isSignedIn === true,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('No auth token');
      
      const response = await fetch('/api/crypto/my-subscription', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required');
        }
        throw new Error('Failed to fetch subscription');
      }
      
      return response.json();
    },
  });

  if (!isLoaded) {
    return {
      user: null,
      subscription: null,
      tier: 'free' as const,
      isAuthenticated: false,
      isLoading: true,
      error: null,
      getToken,
      refetchSubscription,
    };
  }

  if (!isSignedIn || !user) {
    return {
      user: null,
      subscription: null,
      tier: 'free' as const,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      getToken,
      refetchSubscription,
    };
  }

  const cryptoUser: CryptoUser = {
    id: user.id,
    email: user.primaryEmailAddress?.emailAddress || '',
    firstName: user.firstName || undefined,
    lastName: user.lastName || undefined,
    profileImageUrl: user.imageUrl,
  };

  return {
    user: cryptoUser,
    subscription: subscription || null,
    tier: (subscription?.tier || 'free') as 'free' | 'beginner' | 'intermediate' | 'pro' | 'elite',
    isAuthenticated: true,
    isLoading: subscriptionLoading,
    error: null,
    getToken,
    refetchSubscription,
  };
}

export async function cryptoLogin(_provider: 'replit' | 'google') {
  console.log('Login is handled by Clerk SignInButton');
}

export function cryptoLogout() {
  console.log('Logout is handled by Clerk UserButton');
}
