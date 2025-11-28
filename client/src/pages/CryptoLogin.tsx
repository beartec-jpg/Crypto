import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TrendingUp, ArrowRight, Sparkles, BarChart2 } from 'lucide-react';

export default function CryptoLogin() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e] p-6">
      <Card className="w-full max-w-md bg-[#1a1a1a] border-[#2a2e39] shadow-2xl">
        <CardHeader className="space-y-4 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <TrendingUp className="w-10 h-10 text-[#00c4b4]" />
            <h1 className="text-3xl font-bold text-white">Crypto Trading Suite</h1>
          </div>
          <CardTitle className="text-2xl text-white">Welcome!</CardTitle>
          <CardDescription className="text-gray-400">
            All features are now open - no login required!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-lg p-4 text-center">
            <Sparkles className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-green-400 font-medium">Full Access Granted</p>
            <p className="text-zinc-400 text-sm mt-1">
              Enjoy all premium features completely free
            </p>
          </div>

          <Link href="/cryptoindicators">
            <Button
              className="w-full bg-[#00c4b4] hover:bg-[#00a89c] text-black font-medium py-6 text-lg"
              data-testid="button-start-trading"
            >
              <BarChart2 className="w-5 h-5 mr-3" />
              Start Trading
              <ArrowRight className="w-5 h-5 ml-3" />
            </Button>
          </Link>

          <Link href="/">
            <Button
              variant="outline"
              className="w-full border-[#2a2e39] text-gray-300 hover:bg-[#2a2e39] py-6 text-lg"
              data-testid="button-elliott-wave"
            >
              Elliott Wave Analysis
            </Button>
          </Link>

          <Link href="/cryptoai">
            <Button
              variant="ghost"
              className="w-full text-gray-400 hover:text-white hover:bg-[#2a2e39]"
              data-testid="button-ai-analysis"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              AI Market Analysis
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
