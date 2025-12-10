// This file provides safe wrappers for Clerk hooks that work in both
// development (no ClerkProvider) and production (with ClerkProvider) modes

export const isDevelopment = typeof window !== 'undefined' && 
  (window.location.hostname.includes('replit') || 
   window.location.hostname.includes('localhost') ||
   window.location.hostname.includes('127.0.0.1'));

// In development, we need to provide mock implementations
// These will be used when ClerkProvider is not present
export const devAuthState = {
  isSignedIn: true,
  isLoaded: true,
  userId: 'dev-open-access',
  getToken: async () => 'dev-token',
};

export const devUserState = {
  user: {
    id: 'dev-open-access',
    firstName: 'Dev',
    lastName: 'User',
    primaryEmailAddress: { emailAddress: 'dev@open.access' },
    imageUrl: null,
  },
  isLoaded: true,
};
