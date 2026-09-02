import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { MarketingFooter } from './MarketingFooter';

export function MarketingPageFrame({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#0e0e0e] text-white">
      <header className="border-b border-white/10 px-6 py-4">
        <Link href="/">
          <a className="text-lg font-semibold tracking-tight text-white hover:text-[#00c4b4]">
            BearTec
          </a>
        </Link>
      </header>
      <main className={`mx-auto w-full flex-1 px-6 py-12 ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}>
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
