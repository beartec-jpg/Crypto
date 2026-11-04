// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import './index.css'
import { setupPerformanceMonitoring } from '@/lib/monitoring'
import { setupErrorTracking } from '@/lib/errorTracking'
import { AuthQueryIsolation } from '@/components/AuthQueryIsolation'

// Initialize monitoring
setupPerformanceMonitoring();
setupErrorTracking();

// Auto-reload on chunk load failures (stale cache after deploy)
window.addEventListener('unhandledrejection', (event) => {
  const msg = event?.reason?.message || '';
  if (msg.includes('Failed to fetch dynamically imported module') || msg.includes('Importing a module script failed')) {
    const reloadKey = '__chunk_reload_at__';
    const last = Number(sessionStorage.getItem(reloadKey) || 0);
    if (Date.now() - last > 10_000) {
      sessionStorage.setItem(reloadKey, String(Date.now()));
      window.location.reload();
    }
  }
});

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const isDevelopment = 
  window.location.hostname.includes('replit') || 
  window.location.hostname.includes('localhost') ||
  window.location.hostname.includes('127.0.0.1');

// In production, require the key
if (!isDevelopment && !PUBLISHABLE_KEY) {
  throw new Error('Missing Clerk Publishable Key - add VITE_CLERK_PUBLISHABLE_KEY to secrets')
}

const queryClient = new QueryClient();

function AppWrapper() {
  // In development (Replit), don't use ClerkProvider if no key
  if (isDevelopment && !PUBLISHABLE_KEY) {
    return (
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
    );
  }

  // Production: wrap with Clerk
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY!}>
        <QueryClientProvider client={queryClient}>
          <AuthQueryIsolation />
          <App />
        </QueryClientProvider>
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppWrapper />
);
