import { useState } from 'react';
import { Smartphone, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QbtcWalletPWAButtonProps {
  qbtcAddress?: string;
  className?: string;
}

export default function QbtcWalletPWAButton({ qbtcAddress, className }: QbtcWalletPWAButtonProps) {
  const [popupBlocked, setPopupBlocked] = useState(false);

  const handleClick = () => {
    const url = qbtcAddress
      ? `/qbtc-wallet/?from=${encodeURIComponent(qbtcAddress)}`
      : '/qbtc-wallet/';

    const popup = window.open(url, '_blank', 'noopener,noreferrer');

    if (!popup) {
      setPopupBlocked(true);
      return;
    }
    setPopupBlocked(false);
    popup.focus();
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className={cn(className)}
      >
        <Smartphone className="h-4 w-4 shrink-0" />
        qBTC Wallet App
      </button>

      {popupBlocked && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-left text-sm text-amber-100">
          <p className="flex items-center gap-2 font-medium text-amber-300">
            <AlertCircle className="h-4 w-4" />
            Popup blocked
          </p>
          <p className="mt-1">
            Allow popups for this site, then try again. Or{' '}
            <a
              href={qbtcAddress ? `/qbtc-wallet/?from=${encodeURIComponent(qbtcAddress)}` : '/qbtc-wallet/'}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-cyan-300"
            >
              open the wallet directly
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
