import { Switch, Route } from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Toaster } from '@/components/ui/toaster';
import { HelmetProvider } from 'react-helmet-async';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CryptoAuthGate } from '@/components/CryptoAuthGate';

import CryptoLanding from '@/pages/CryptoLanding';
import CryptoIndicators from '@/pages/CryptoIndicators';
import CryptoAI from '@/pages/CryptoAI';
import CryptoElliottWave from '@/pages/CryptoElliottWave';
import CryptoTraining from '@/pages/CryptoTraining';
import CryptoLogin from '@/pages/CryptoLogin';
import CryptoSubscribe from '@/pages/CryptoSubscribe';
import CryptoPrivacy from '@/pages/CryptoPrivacy';
import CryptoTerms from '@/pages/CryptoTerms';
import CryptoAccount from '@/pages/CryptoAccount';
import CryptoFeedbackBoard from '@/pages/CryptoFeedbackBoard';
import NotFound from '@/pages/not-found';

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <CryptoAuthGate>
      <Component />
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
            <Route path="/" component={CryptoLanding} />
            <Route path="/crypto" component={CryptoLanding} />
            <Route path="/cryptologin" component={CryptoLogin} />
            <Route path="/cryptoprivacy" component={CryptoPrivacy} />
            <Route path="/cryptoterms" component={CryptoTerms} />
            
            {/* Protected routes - require authentication */}
            <Route path="/cryptoindicators">
              <ProtectedRoute component={CryptoIndicators} />
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
            
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
