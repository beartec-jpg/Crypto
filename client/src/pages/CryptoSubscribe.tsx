import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Crown, Rocket, Zap, Sparkles } from 'lucide-react';
import { Link } from 'wouter';

export default function CryptoSubscribe() {
  const features = [
    { icon: Zap, text: 'Real-time market data and charts' },
    { icon: Rocket, text: 'All technical indicators (VWAP, Supertrend, Ichimoku, etc.)' },
    { icon: Crown, text: 'Elliott Wave analysis tools' },
    { icon: Sparkles, text: 'AI-powered market insights and trade ideas' },
    { icon: Check, text: 'Push notifications for price alerts' },
    { icon: Check, text: 'Custom indicator builder' },
    { icon: Check, text: 'Multi-exchange orderflow data' },
    { icon: Check, text: 'Training resources and tutorials' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 to-zinc-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg bg-zinc-900/80 border-zinc-800">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center">
            <Crown className="w-10 h-10 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold text-white">
            All Features Unlocked!
          </CardTitle>
          <p className="text-zinc-400 text-lg">
            Enjoy full access to all premium trading tools - completely free!
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="space-y-3">
            {features.map((feature, index) => (
              <div key={index} className="flex items-center gap-3 text-zinc-300">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <feature.icon className="w-4 h-4 text-green-400" />
                </div>
                <span>{feature.text}</span>
              </div>
            ))}
          </div>

          <div className="pt-4 space-y-3">
            <Link href="/cryptoindicators">
              <Button className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white" data-testid="button-start-trading">
                Start Trading Now
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800" data-testid="button-view-charts">
                View Elliott Wave Analysis
              </Button>
            </Link>
          </div>

          <p className="text-center text-zinc-500 text-sm pt-4">
            No credit card required. No hidden fees. Just powerful trading tools.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
