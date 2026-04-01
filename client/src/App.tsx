import { Switch, Route } from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Toaster } from '@/components/ui/toaster';
import { HelmetProvider } from 'react-helmet-async';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CryptoAuthGate } from '@/components/CryptoAuthGate';
import { InstallPrompt } from '@/components/InstallPrompt';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { lazy, Suspense } from 'react';
import '@/utils/sandboxBootstrap';

// Lazy load all route components for code splitting
const CryptoLanding = lazy(() => import('@/pages/CryptoLanding'));
const CryptoLogin = lazy(() => import('@/pages/CryptoLogin'));
const CryptoPrivacy = lazy(() => import('@/pages/CryptoPrivacy'));
const CryptoTerms = lazy(() => import('@/pages/CryptoTerms'));
const CryptoIndicators = lazy(() => import('@/pages/CryptoIndicatorsClean'));
const CryptoAI = lazy(() => import('@/pages/CryptoAI'));
const CryptoElliottWave = lazy(() => import('@/pages/CryptoElliottWave'));
const CryptoTraining = lazy(() => import('@/pages/CryptoTraining'));
const CryptoSubscribe = lazy(() => import('@/pages/CryptoSubscribe'));
const CryptoAccount = lazy(() => import('@/pages/CryptoAccount'));
const CryptoFeedbackBoard = lazy(() => import('@/pages/CryptoFeedbackBoard'));
const CryptoElliottWaveLessons = lazy(() => import('@/pages/CryptoElliottWaveLessons'));
const DevAnalytics = lazy(() => import('@/pages/DevAnalytics'));
const CryptoSandbox = lazy(() => import('@/pages/CryptoSandbox'));
const NotFound = lazy(() => import('@/pages/not-found'));
// 1. Add with other lazy imports (around line 22)
const Wallet = lazy(() => import('@/pages/Wallet'));
const ChartPage = lazy(() => import('@/pages/ChartPage'));
const QBTCFaucet = lazy(() => import('@/pages/QBTCFaucet'));

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <CryptoAuthGate>
      <Suspense fallback={<LoadingSpinner message="Loading..." />}>
        <Component />
      </Suspense>
    </CryptoAuthGate>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <Switch>
            {/* Public routes */}
            <Route path="/">
              <Suspense fallback={<LoadingSpinner message="Loading..." />}>
                <CryptoLanding />
              </Suspense>
            </Route>
            <Route path="/crypto">
              <Suspense fallback={<LoadingSpinner message="Loading..." />}>
                <CryptoLanding />
              </Suspense>
            </Route>
            <Route path="/cryptologin">
              <Suspense fallback={<LoadingSpinner message="Loading..." />}>
                <CryptoLogin />
              </Suspense>
            </Route>
            <Route path="/cryptoprivacy">
              <Suspense fallback={<LoadingSpinner message="Loading..." />}>
                <CryptoPrivacy />
              </Suspense>
            </Route>
            <Route path="/cryptoterms">
              <Suspense fallback={<LoadingSpinner message="Loading..." />}>
                <CryptoTerms />
              </Suspense>
            </Route>
            <Route path="/qbtc-faucet">
              <Suspense fallback={<LoadingSpinner message="Loading faucet..." />}>
                <QBTCFaucet />
              </Suspense>
            </Route>
            <Route path="/crypto/qbtc-faucet">
              <Suspense fallback={<LoadingSpinner message="Loading faucet..." />}>
                <QBTCFaucet />
              </Suspense>
            </Route>
            
            {/* Protected routes - require authentication */}
            <Route path="/cryptoindicators">
              <ProtectedRoute component={CryptoIndicators} />
            </Route>
            <Route path="/chart">
              <ProtectedRoute component={ChartPage} />
            </Route>
            <Route path="/cryptoai">
              <ProtectedRoute component={CryptoAI} />
            </Route>
            <Route path="/cryptoelliottwave">
              <ProtectedRoute component={CryptoElliottWave} />
            </Route>
            <Route path="/crypto/training">
              <ProtectedRoute component={CryptoTraining} />
            </Route>
            <Route path="/cryptosubscribe">
              <ProtectedRoute component={CryptoSubscribe} />
            </Route>
            <Route path="/crypto/subscribe">
              <ProtectedRoute component={CryptoSubscribe} />
            </Route>
            <Route path="/crypto/account">
              <ProtectedRoute component={CryptoAccount} />
            </Route>
            <Route path="/crypto/feedback">
              <ProtectedRoute component={CryptoFeedbackBoard} />
            </Route>
            <Route path="/crypto/elliott-lessons">
              <ProtectedRoute component={CryptoElliottWaveLessons} />
            </Route>
            <Route path="/dev/analytics">
              <ProtectedRoute component={DevAnalytics} />
            </Route>
            <Route path="/dev/sandbox">
              <ProtectedRoute component={CryptoSandbox} />
            </Route>
            <Route path="/wallet">
              <ProtectedRoute component={Wallet} />
            </Route>
            
            <Route>
              <Suspense fallback={<LoadingSpinner message="Loading..." />}>
                <NotFound />
              </Suspense>
            </Route>
          </Switch>
          <Toaster />
          <InstallPrompt />
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
