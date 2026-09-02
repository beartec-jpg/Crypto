import { Link } from 'wouter';
import { MarketingPageFrame } from '@/components/marketing/MarketingPageFrame';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <MarketingPageFrame>
      <div className="text-center" data-testid="not-found-page">
        <p className="text-sm uppercase tracking-[0.28em] text-[#00c4b4]">404</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-4 text-zinc-400">That link doesn’t exist on BearTec.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/">
            <Button className="bg-[#00c4b4] text-black hover:bg-[#00a89c]">Home</Button>
          </Link>
          <Link href="/pricing">
            <Button className="border border-white/25 bg-transparent text-white hover:bg-white/10">
              Pricing
            </Button>
          </Link>
          <Link href="/contact">
            <Button className="border border-white/25 bg-transparent text-white hover:bg-white/10">
              Contact
            </Button>
          </Link>
        </div>
      </div>
    </MarketingPageFrame>
  );
}
