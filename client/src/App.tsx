import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HelmetProvider } from "react-helmet-async";
import { useDynamicTheme } from "@/hooks/useDynamicTheme";
import { useLocation } from "wouter";
import Home from "@/pages/home";
import Calculations from "@/pages/calculations";
import Landing from "@/pages/Landing";
import Subscribe from "@/pages/Subscribe";
import AccountPage from "@/pages/AccountPage";
import CompanySettings from "@/pages/CompanySettings";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import ConsultancyServices from "@/pages/ConsultancyServices";
import NotFound from "@/pages/not-found";
import CalculatorSelection from "@/pages/CalculatorSelection";
import CommercialCalculator from "@/pages/CommercialCalculator";
import IndustrialCalculatorFlow from "@/pages/IndustrialCalculatorFlow";
import FeedbackPage from "@/pages/FeedbackPage";
import CryptoIndicators from "@/pages/CryptoIndicators";
import CryptoAI from "@/pages/CryptoAI";
import CryptoLanding from "@/pages/CryptoLanding";
import CryptoLogin from "@/pages/CryptoLogin";
import CryptoSubscribe from "@/pages/CryptoSubscribe";
import CryptoPrivacy from "@/pages/CryptoPrivacy";
import CryptoTerms from "@/pages/CryptoTerms";
import CryptoTraining from "@/pages/CryptoTraining";
import CryptoElliottWave from "@/pages/CryptoElliottWave";

function Router() {
  const [location] = useLocation();
  const isCryptoPage = location === '/' || location.startsWith('/crypto') || location === '/cryptologin' || location === '/cryptoindicators' || location === '/cryptoai' || location === '/cryptosubscribe' || location === '/cryptoelliottwave';
  
  // Apply dynamic theme colors based on company branding (calculator only)
  useDynamicTheme({ enabled: !isCryptoPage });

  return (
    <Switch>
      {/* Click to enter landing page */}
      <Route path="/" component={CryptoLanding} />
      
      {/* Calculator routes - all open access */}
      <Route path="/calculator" component={CalculatorSelection} />
      <Route path="/home" component={CalculatorSelection} />
      <Route path="/industrial" component={IndustrialCalculatorFlow} />
      <Route path="/commercial" component={CommercialCalculator} />
      <Route path="/calc" component={Home} />
      <Route path="/calculations" component={Calculations} />
      <Route path="/subscribe" component={Subscribe} />
      <Route path="/account" component={AccountPage} />
      <Route path="/settings" component={CompanySettings} />
      <Route path="/landing" component={Landing} />
      
      {/* Public pages */}
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfService} />
      <Route path="/consultancy" component={ConsultancyServices} />
      <Route path="/feedback" component={FeedbackPage} />
      
      {/* Crypto pages - all open access */}
      <Route path="/crypto" component={CryptoLanding} />
      <Route path="/cryptologin" component={CryptoLogin} />
      <Route path="/cryptoindicators" component={CryptoIndicators} />
      <Route path="/cryptoai" component={CryptoAI} />
      <Route path="/cryptosubscribe" component={CryptoSubscribe} />
      <Route path="/crypto/privacy" component={CryptoPrivacy} />
      <Route path="/crypto/terms" component={CryptoTerms} />
      <Route path="/crypto/training" component={CryptoTraining} />
      <Route path="/cryptoelliottwave" component={CryptoElliottWave} />
      <Route path="/crypto/elliott-wave" component={CryptoElliottWave} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
