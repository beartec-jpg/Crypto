import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TrendingUp, ArrowRight, Sparkles, BarChart2, LogIn } from 'lucide-react';
import { isDevelopment } from '@/hooks/useCryptoAuth';
import { useEffect, useMemo } from 'react';
import { useAuth, SignInButton } from '@clerk/clerk-react';

function DevelopmentLogin() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e] p-6">
      <Card className="w-full max-w-md bg-[#1a1a1a] border-[#2a2e39] shadow-2xl">
        <CardHeader className="space-y-4 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <TrendingUp className="w-10 h-10 text-[#00c4b4]" />
            <h1 className="text-3xl font-bold text-white">BearTec</h1>
          </div>
          <CardTitle className="text-2xl text-white">Development Mode</CardTitle>
          <CardDescription className="text-gray-400">
            All features are open for testing - no login required
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-lg p-4 text-center">
            <Sparkles className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-green-400 font-medium">Dev Access Granted</p>
            <p className="text-zinc-400 text-sm mt-1">
              Elite tier enabled for development
            </p>
          </div>

          <Link href="/cryptoindicators">
            <Button
              className="w-full bg-[#00c4b4] hover:bg-[#00a89c] text-black font-medium py-6 text-lg"
              data-testid="button-start-trading"
            >
              <BarChart2 className="w-5 h-5 mr-3" />
              Get free charts
              <ArrowRight className="w-5 h-5 ml-3" />
            </Button>
          </Link>

          <Link href="/">
            <Button
              variant="outline"
              className="w-full border-[#2a2e39] bg-transparent text-gray-300 hover:bg-[#2a2e39]"
            >
              Back to Home
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function ProductionLogin() {
  const { isSignedIn, isLoaded } = useAuth();
  const [, setLocation] = useLocation();

  const returnToUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo');
    return returnTo ? decodeURIComponent(returnTo) : '/cryptoindicators';
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setLocation(returnToUrl);
    }
  }, [isLoaded, isSignedIn, setLocation, returnToUrl]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e] p-6">
      <Card className="w-full max-w-md bg-[#1a1a1a] border-[#2a2e39] shadow-2xl">
        <CardHeader className="space-y-4 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <TrendingUp className="w-10 h-10 text-[#00c4b4]" />
            <h1 className="text-3xl font-bold text-white">BearTec</h1>
          </div>
          <CardTitle className="text-2xl text-white">Welcome Back</CardTitle>
          <CardDescription className="text-gray-400">
            Sign in to access your charts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SignInButton mode="modal" forceRedirectUrl={returnToUrl}>
            <Button
              className="w-full bg-[#00c4b4] hover:bg-[#00a89c] text-black font-medium py-6 text-lg"
              data-testid="button-sign-in"
            >
              <LogIn className="w-5 h-5 mr-3" />
              Sign in
              <ArrowRight className="w-5 h-5 ml-3" />
            </Button>
          </SignInButton>

          <div className="text-center text-sm text-gray-500">
            <p>Don&apos;t have an account? Sign up during login</p>
          </div>

          <Link href="/">
            <Button
              variant="outline"
              className="w-full border-[#2a2e39] bg-transparent text-gray-300 hover:bg-[#2a2e39]"
            >
              Back to Home
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CryptoLogin() {
  if (isDevelopment) {
    return <DevelopmentLogin />;
  }
  return <ProductionLogin />;
}
