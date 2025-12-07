import { Switch, Route } from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Toaster } from '@/components/ui/toaster';
import { HelmetProvider } from 'react-helmet-async';
import { ErrorBoundary } from '@/components/ErrorBoundary';

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
import NotFound from '@/pages/not-found';

function App() {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <Switch>
            <Route path="/" component={CryptoLanding} />
            <Route path="/crypto" component={CryptoLanding} />
            <Route path="/cryptoindicators" component={CryptoIndicators} />
            <Route path="/cryptoai" component={CryptoAI} />
            <Route path="/cryptoelliottwave" component={CryptoElliottWave} />
            <Route path="/crypto/training" component={CryptoTraining} />
            <Route path="/cryptologin" component={CryptoLogin} />
            <Route path="/cryptosubscribe" component={CryptoSubscribe} />
            <Route path="/crypto/subscribe" component={CryptoSubscribe} />
            <Route path="/crypto/account" component={CryptoAccount} />
            <Route path="/cryptoprivacy" component={CryptoPrivacy} />
            <Route path="/cryptoterms" component={CryptoTerms} />
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
