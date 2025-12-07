interface CryptoUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
}

interface CryptoSubscription {
  id: string;
  userId: string;
  tier: string;
  subscriptionStatus: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  aiCredits?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const openAccessUser: CryptoUser = {
  id: 'open-access-crypto',
  email: 'crypto@open.access',
  firstName: 'Open',
  lastName: 'Access',
};

const openAccessSubscription: CryptoSubscription = {
  id: 'open-sub',
  userId: 'open-access-crypto',
  tier: 'elite',
  subscriptionStatus: 'active',
  aiCredits: 999999,
};

export function useCryptoAuth() {
  return {
    user: openAccessUser,
    subscription: openAccessSubscription,
    tier: 'elite',
    isAuthenticated: true,
    isLoading: false,
    error: null,
  };
}

export function cryptoLogin(_provider: 'replit' | 'google') {
  console.log('Open access mode - no login required');
}

export function cryptoLogout() {
  console.log('Open access mode - no logout required');
}
