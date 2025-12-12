import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, useUser } from '@clerk/clerk-react';
import { configureApiAuth } from '@/lib/apiAuth';

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

// Admin email gets unrestricted access everywhere
const ADMIN_EMAIL = 'beartec@beartec.uk';

function useClerkHooks() {
  // In development, skip Clerk hooks entirely to avoid ClerkProvider requirement
  if (isDevelopment) {
    return {
      isSignedIn: true,
      getToken: async () => 'dev-token',
      isLoaded: true,
      user: devUser,
    };
  }
  
  // In production, use real Clerk hooks
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const auth = useAuth();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { user } = useUser();
  
  return { ...auth, user };
}

export function useCryptoAuth() {
  const { isSignedIn, getToken, isLoaded, user } = useClerkHooks();
  
  // Configure API auth with Clerk's getToken in production
  // This ensures all authenticated API requests have the correct token
  useEffect(() => {
    if (!isDevelopment && isLoaded && isSignedIn) {
      configureApiAuth(getToken);
    }
  }, [isLoaded, isSignedIn, getToken]);
  
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
      canUseElliottFeatures: true,
      canUseAI: true,
      hasUnlimitedAI: true,
      isAdmin: true,
      refetchSubscription,
      getToken,
    };
  }

  const cryptoUser: CryptoUser | null = user ? {
    id: user.id,
    email: (user as any).primaryEmailAddress?.emailAddress || (user as any).email || '',
    firstName: user.firstName || undefined,
    lastName: user.lastName || undefined,
    profileImageUrl: (user as any).imageUrl || (user as any).profileImageUrl || undefined,
  } : null;

  // Admin email gets unrestricted elite access
  const isAdmin = cryptoUser?.email === ADMIN_EMAIL;
  
  if (isAdmin) {
    return {
      user: cryptoUser,
      subscription: {
        ...devSubscription,
        userId: cryptoUser?.id || 'admin',
        id: subscription?.id || 'admin-sub',
      },
      tier: 'elite' as const,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      canUseElliottFeatures: true,
      canUseAI: true,
      hasUnlimitedAI: true,
      isAdmin: true,
      refetchSubscription,
      getToken,
    };
  }

  return {
    user: cryptoUser,
    subscription: subscription || null,
    tier: subscription?.tier || 'free',
    isAuthenticated: isSignedIn === true && isLoaded,
    isLoading: !isLoaded || subscriptionLoading,
    error: null,
    canUseElliottFeatures: subscription?.canUseElliott || false,
    canUseAI: subscription?.canUseAI || false,
    hasUnlimitedAI: subscription?.hasUnlimitedAI || false,
    isAdmin: false,
    refetchSubscription,
    getToken,
  };
}
