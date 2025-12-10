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

export const isDevelopment = typeof window !== 'undefined' && 
  (window.location.hostname.includes('replit') || 
   window.location.hostname.includes('localhost') ||
   window.location.hostname.includes('127.0.0.1'));

const devUser: CryptoUser = {
  id: 'dev-open-access',
  email: 'dev@open.access',
  firstName: 'Dev',
  lastName: 'User',
};

const devSubscription: CryptoSubscription = {
  id: 'dev-sub',
  userId: 'dev-open-access',
  tier: 'elite',
  subscriptionStatus: 'active',
  aiCredits: 999999,
  hasElliottAddon: true,
  canUseElliott: true,
  canUseAI: true,
  hasUnlimitedAI: true,
};

function useClerkHooks() {
  if (isDevelopment) {
    return {
      isSignedIn: true,
      getToken: async () => 'dev-token',
      isLoaded: true,
      user: devUser,
    };
  }
  
  const { useAuth, useUser } = require('@clerk/clerk-react');
  const auth = useAuth();
  const { user } = useUser();
  return { ...auth, user };
}

export function useCryptoAuth() {
  const { isSignedIn, getToken, isLoaded, user } = useClerkHooks();
  
  const { data: subscription, isLoading: subscriptionLoading, refetch: refetchSubscription } = useQuery<CryptoSubscription>({
    queryKey: ['/api/crypto/my-subscription'],
    enabled: isDevelopment || isSignedIn === true,
    queryFn: async () => {
      if (isDevelopment) {
        const response = await fetch('/api/crypto/my-subscription');
        if (!response.ok) {
          return devSubscription;
        }
        return response.json();
      }
      
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

  if (isDevelopment) {
    const eliteSubscription: CryptoSubscription = {
      ...devSubscription,
      ...(subscription || {}),
      tier: 'elite',
      canUseElliott: true,
      canUseAI: true,
      hasUnlimitedAI: true,
      hasElliottAddon: true,
    };
    return {
      user: devUser,
      subscription: eliteSubscription,
      tier: 'elite' as const,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      isElite: true,
      getToken: async () => 'dev-token',
      refetchSubscription,
    };
  }

  if (!isLoaded) {
    return {
      user: null,
      subscription: null,
      tier: 'free' as const,
      isAuthenticated: false,
      isLoading: true,
      error: null,
      isElite: false,
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
      isElite: false,
      getToken,
      refetchSubscription,
    };
  }

  const cryptoUser: CryptoUser = {
    id: user.id,
    email: user.primaryEmailAddress?.emailAddress || '',
    firstName: user.firstName || undefined,
    lastName: user.lastName || undefined,
    profileImageUrl: user.imageUrl || undefined,
  };

  const tier = subscription?.tier || 'free';
  const isElite = tier === 'elite';

  return {
    user: cryptoUser,
    subscription: subscription || null,
    tier: tier as 'free' | 'beginner' | 'intermediate' | 'pro' | 'elite',
    isAuthenticated: true,
    isLoading: subscriptionLoading,
    error: null,
    isElite,
    getToken,
    refetchSubscription,
  };
}
