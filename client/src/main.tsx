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
import { setupGlobalErrorHandler } from '@/lib/errorHandler'

// Initialize monitoring
setupPerformanceMonitoring();
setupErrorTracking();
setupGlobalErrorHandler();

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID

const isDevelopment = 
  window.location.hostname.includes('replit') || 
  window.location.hostname.includes('localhost') ||
  window.location.hostname.includes('127.0.0.1') ||
  window.location.pathname.includes('/dev');

// In production, require the key
if (!isDevelopment && !PUBLISHABLE_KEY) {
  throw new Error('Missing Clerk Publishable Key - add VITE_CLERK_PUBLISHABLE_KEY to secrets')
}

// Warn if WalletConnect project ID is missing (but don't crash)
if (!WALLETCONNECT_PROJECT_ID) {
  console.warn('⚠️ WalletConnect Project ID not configured. WalletConnect will not work properly. Add VITE_WALLETCONNECT_PROJECT_ID to your environment variables.');
}

// Wagmi Configuration
const queryClient = new QueryClient();

// Build connectors array based on available configuration
const connectors = [
  metaMask(),
];

// Only add WalletConnect if we have a valid project ID
if (WALLETCONNECT_PROJECT_ID && WALLETCONNECT_PROJECT_ID !== 'demo-project-id') {
  connectors.push(
    walletConnect({ 
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: 'BearTec Sovereign Wallet',
        description: 'Post-quantum secure, non-custodial wallet',
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.ico`]
      },
      showQrModal: true,
    })
  );
}

const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors,
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
