import { useState, useEffect } from 'react';
import { X, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already running as standalone PWA
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);
    if (standalone) return;

    // Check if iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Check if user previously dismissed the banner
    const dismissed = localStorage.getItem('installPromptDismissed');
    const dismissedAt = dismissed ? parseInt(dismissed, 10) : 0;
    const daysSinceDismissed = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
    
    // Show again after 7 days
    if (dismissed && daysSinceDismissed < 7) return;

    // For iOS, show manual instructions after a delay
    if (iOS) {
      const timer = setTimeout(() => setShowBanner(true), 3000);
      return () => clearTimeout(timer);
    }

    // Listen for the beforeinstallprompt event (Android/Chrome)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show banner after a short delay
      setTimeout(() => setShowBanner(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Listen for successful installation
    const handleAppInstalled = () => {
      setShowBanner(false);
      setDeferredPrompt(null);
      localStorage.removeItem('installPromptDismissed');
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Trigger the install prompt
    await deferredPrompt.prompt();

    // Wait for user choice
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowBanner(false);
    }

    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('installPromptDismissed', Date.now().toString());
  };

  // Don't show if already installed or banner is hidden
  if (isStandalone || !showBanner) return null;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 px-3 pb-2 animate-in slide-in-from-bottom duration-300">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg border border-blue-500/30 p-3">
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <img 
              src="/icon-192.png" 
              alt="BearTec" 
              className="w-7 h-7 rounded"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm">Add to Home Screen</p>
            <p className="text-blue-100 text-xs truncate">
              {isIOS ? 'Tap Share then "Add to Home Screen"' : 'Install BearTec for quick access'}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isIOS ? (
              <div className="bg-white/20 rounded-lg p-2">
                <Share className="w-5 h-5 text-white" />
              </div>
            ) : (
              <button
                onClick={handleInstallClick}
                className="bg-white text-blue-600 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors"
                data-testid="button-install-app"
              >
                Install
              </button>
            )}
            
            <button
              onClick={handleDismiss}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Dismiss"
              data-testid="button-dismiss-install"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
