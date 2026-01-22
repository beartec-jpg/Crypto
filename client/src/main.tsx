import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { metaMask, walletConnect } from 'wagmi/connectors'
import App from './App.tsx'
import './index.css'
import { setupPerformanceMonitoring } from '@/lib/monitoring'
import { setupErrorTracking } from '@/lib/errorTracking'

// Initialize monitoring
setupPerformanceMonitoring();
setupErrorTracking();

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const isDevelopment = 
  window.location.hostname.includes('replit') || 
  window.location.hostname.includes('localhost') ||
  window.location.hostname.includes('127.0.0.1') ||
  window.location.pathname.includes('/dev');

// In production, require the key
if (!isDevelopment && !PUBLISHABLE_KEY) {
  throw new Error('Missing Clerk Publishable Key - add VITE_CLERK_PUBLISHABLE_KEY to secrets')
}

// Wagmi Configuration
const queryClient = new QueryClient();

const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [
    metaMask(),
    walletConnect({ 
      projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo-project-id' 
    }),
  ],
  transports: {
    [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL || 'https://rpc.sepolia.org'),
  },
});

function AppWrapper() {
  // In development (Replit), don't use ClerkProvider if no key
  if (isDevelopment && !PUBLISHABLE_KEY) {
    return (
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </WagmiProvider>
    );
  }

  // Production: Use both Clerk and Wagmi
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY!}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </WagmiProvider>
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppWrapper />
);
