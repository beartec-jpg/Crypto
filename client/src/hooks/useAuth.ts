// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
const openAccessUser = {
  id: 'open-access',
  email: 'user@open.access',
  firstName: 'Open',
  lastName: 'Access',
  tier: 'premium',
  subscriptionStatus: 'active',
};

export function useAuth(_options?: { enabled?: boolean }) {
  return {
    user: openAccessUser,
    isLoading: false,
    isAuthenticated: true,
    error: null,
  };
}
