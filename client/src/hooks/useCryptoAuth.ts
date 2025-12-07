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

// Check if we're in development mode (Replit dev environment)
const isDevelopment = typeof window !== 'undefined' && 
  (window.location.hostname.includes('replit') || 
   window.location.hostname.includes('localhost') ||
   window.location.hostname.includes('127.0.0.1'));

// Development fallback user
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

export function useCryptoAuth() {
  const { isSignedIn, getToken, isLoaded } = useAuth();
  const { user } = useUser();
  
  const { data: subscription, isLoading: subscriptionLoading, refetch: refetchSubscription } = useQuery<CryptoSubscription>({
    queryKey: ['/api/crypto/my-subscription'],
    enabled: isDevelopment || isSignedIn === true,
    queryFn: async () => {
      // In development, fetch without auth token (backend allows open access)
      if (isDevelopment) {
        const response = await fetch('/api/crypto/my-subscription');
        if (!response.ok) {
          // Return dev subscription as fallback
          return devSubscription;
        }
        return response.json();
      }
      
      // Production: require auth token
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

  // In development mode, return dev user with elite access
  if (isDevelopment) {
    return {
      user: devUser,
      subscription: subscription || devSubscription,
      tier: ((subscription?.tier || 'elite') as 'free' | 'beginner' | 'intermediate' | 'pro' | 'elite'),
      isAuthenticated: true,
      isLoading: subscriptionLoading,
      error: null,
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
