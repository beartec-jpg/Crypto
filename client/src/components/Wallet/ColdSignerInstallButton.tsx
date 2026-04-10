import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { openColdSignerInstallPopup } from '@/lib/coldSignerInstall';

interface ColdSignerInstallButtonProps {
  label: string;
  className?: string;
}

export default function ColdSignerInstallButton({ label, className }: ColdSignerInstallButtonProps) {
  const [popupBlocked, setPopupBlocked] = useState(false);

  const handleInstallClick = () => {
    const popup = openColdSignerInstallPopup();

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
        onClick={handleInstallClick}
        className={cn(className)}
      >
        {label}
      </button>

      {popupBlocked && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-left text-sm text-amber-100">
          <p className="flex items-center gap-2 font-medium text-amber-300">
            <ShieldAlert className="h-4 w-4" />
            Popup blocked
          </p>
          <p className="mt-1">
            Allow popups for this site, then try again. The Cold Signer install prompt opens in its own window.
          </p>
        </div>
      )}
    </div>
  );
}