import { ClerkProvider } from '@clerk/clerk-react';
import { createContext, useContext } from 'react';

// Check if we're in development mode
const isDevelopment = typeof window !== 'undefined' && 
  (window.location.hostname.includes('replit') || 
   window.location.hostname.includes('localhost') ||
   window.location.hostname.includes('127.0.0.1'));

// Mock context for when ClerkProvider isn't available
const MockClerkContext = createContext({
  isLoaded: true,
  isSignedIn: false,
  user: null,
  sessionId: null,
  session: null,
  userId: null,
  signOut: async () => {},
  getToken: async () => null,
});

// Custom hook wrappers that work without ClerkProvider in dev
export const useMockAuth = () => useContext(MockClerkContext);

interface DevClerkProviderProps {
  children: React.ReactNode;
  publishableKey: string;
}

export function DevClerkProvider({ children, publishableKey }: DevClerkProviderProps) {
  // In development, provide mock context if Clerk can't connect
  // This allows the app to render while development auth falls back to dev-open-access
  if (isDevelopment) {
    return (
      <ClerkProvider publishableKey={publishableKey}>
        {children}
      </ClerkProvider>
    );
  }
  
  return (
    <ClerkProvider publishableKey={publishableKey}>
      {children}
    </ClerkProvider>
  );
}
