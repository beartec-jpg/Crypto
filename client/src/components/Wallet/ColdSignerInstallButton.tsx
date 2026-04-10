import { useState } from 'react';
import { Download, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { openColdSignerInstallPopup } from '@/lib/coldSignerInstall';

interface ColdSignerInstallButtonProps {
  label: string;
  className?: string;
}

export default function ColdSignerInstallButton({ label, className }: ColdSignerInstallButtonProps) {
  const [open, setOpen] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);

  const handleConfirmInstall = () => {
    const popup = openColdSignerInstallPopup();

    if (!popup) {
      setPopupBlocked(true);
      return;
    }

    setPopupBlocked(false);
    setOpen(false);
    popup.focus();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(className)}
      >
        {label}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md border-gray-800 bg-gray-950 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl text-white">
              <Download className="h-5 w-5 text-cyan-400" />
              Install Cold Signer on this device?
            </DialogTitle>
            <DialogDescription className="text-gray-300">
              This opens a dedicated install window for the Cold Signer PWA. After installation, close the browser page and launch Cold Signer from your home screen or app list.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
            <p className="font-medium text-cyan-200">Expected flow</p>
            <p className="mt-2">1. Confirm install.</p>
            <p>2. Browser shows the install prompt.</p>
            <p>3. Once installed, open Cold Signer as an installed app, not in the browser tab.</p>
          </div>

          {popupBlocked && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
              <p className="flex items-center gap-2 font-medium text-amber-300">
                <ShieldAlert className="h-4 w-4" />
                Popup blocked
              </p>
              <p className="mt-2">
                Allow popups for this site, then try again. The install prompt needs a dedicated window so it does not replace your current wallet page.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-gray-700 bg-transparent text-gray-200 hover:bg-gray-800 hover:text-white"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-cyan-500 text-gray-950 hover:bg-cyan-400"
              onClick={handleConfirmInstall}
            >
              Install Cold Signer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}