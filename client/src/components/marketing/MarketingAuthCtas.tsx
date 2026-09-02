import type { ReactNode } from 'react';
import { SignedIn, SignedOut, SignInButton, SignUpButton } from '@clerk/clerk-react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { isDevelopment } from '@/hooks/useCryptoAuth';
import { cn } from '@/lib/utils';

const AFTER_AUTH = '/cryptoindicators';

const primaryClass =
  'bg-[#00c4b4] hover:bg-[#00a89c] text-black font-semibold px-6 h-11 text-sm shadow-[0_0_24px_rgba(0,196,180,0.25)]';
const secondaryClass =
  'border border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white h-11 px-6 text-sm';

function CtaRow({
  className,
  primary,
  secondary,
}: {
  className?: string;
  primary: ReactNode;
  secondary: ReactNode;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)} data-testid="marketing-auth-ctas">
      {primary}
      {secondary}
    </div>
  );
}

function DevCtas({ className }: { className?: string }) {
  const [, setLocation] = useLocation();
  return (
    <CtaRow
      className={className}
      primary={
        <Button
          className={primaryClass}
          data-testid="cta-get-free-charts"
          onClick={() => setLocation(AFTER_AUTH)}
        >
          Get free charts
        </Button>
      }
      secondary={
        <Button
          variant="outline"
          className={secondaryClass}
          data-testid="cta-sign-in"
          onClick={() => setLocation('/login')}
        >
          Sign in
        </Button>
      }
    />
  );
}

function ProductionCtas({ className }: { className?: string }) {
  return (
    <>
      <SignedOut>
        <CtaRow
          className={className}
          primary={
            <SignUpButton mode="modal" forceRedirectUrl={AFTER_AUTH}>
              <Button className={primaryClass} data-testid="cta-get-free-charts">
                Get free charts
              </Button>
            </SignUpButton>
          }
          secondary={
            <SignInButton mode="modal" forceRedirectUrl={AFTER_AUTH}>
              <Button variant="outline" className={secondaryClass} data-testid="cta-sign-in">
                Sign in
              </Button>
            </SignInButton>
          }
        />
      </SignedOut>
      <SignedIn>
        <CtaRow
          className={className}
          primary={
            <Link href={AFTER_AUTH}>
              <Button className={primaryClass} data-testid="cta-get-free-charts">
                Get free charts
              </Button>
            </Link>
          }
          secondary={
            <Link href={AFTER_AUTH}>
              <Button variant="outline" className={secondaryClass} data-testid="cta-sign-in">
                Sign in
              </Button>
            </Link>
          }
        />
      </SignedIn>
    </>
  );
}

export function MarketingAuthCtas({ className }: { className?: string }) {
  if (isDevelopment) {
    return <DevCtas className={className} />;
  }
  return <ProductionCtas className={className} />;
}
