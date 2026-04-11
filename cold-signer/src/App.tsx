import { useEffect, useState } from 'react';
import { QrCode, Shield, WifiOff, AlertTriangle, Download, X, Eye, EyeOff, Lock } from 'lucide-react';
import QRScanner from './components/QRScanner';
import QRDisplay from './components/QRDisplay';
import TransactionPreview from './components/TransactionPreview';
import AuthGate from './components/AuthGate';
import ShareManager from './components/ShareManager';
import { AppStep, UnsignedTransaction, TransactionPreviewData } from './types/coldTypes';
import { signTransaction } from './lib/coldSigner';
import { clearAllShares, loadAndDecryptShare, hasStoredShare } from './lib/offlineStorage';

const COLD_SIGNER_INSTALL_REQUEST_KEY = 'cold-signer-install-request';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function App() {
  const [step, setStep] = useState<AppStep>('idle');
  const [hasShare, setHasShare] = useState(false);
  const [isCheckingShare, setIsCheckingShare] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isPopupInstallFlow, setIsPopupInstallFlow] = useState(false);
  const [hasInstallIntent, setHasInstallIntent] = useState(false);
  const [postInstallMessage, setPostInstallMessage] = useState('');
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [scannedData, setScannedData] = useState<UnsignedTransaction | null>(null);
  const [signedTx, setSignedTx] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [pendingShareImport, setPendingShareImport] = useState<{ share: string; mode: 'recover' | 'rotate' } | null>(null);
  const [showShareView, setShowShareView] = useState(false);
  const [shareViewPassword, setShareViewPassword] = useState('');
  const [shareViewData, setShareViewData] = useState('');
  const [shareViewError, setShareViewError] = useState('');
  const [shareViewLoading, setShareViewLoading] = useState(false);
  const [showSharePassword, setShowSharePassword] = useState(false);
  const [removeShareStep, setRemoveShareStep] = useState<'hidden' | 'password' | 'confirm'>('hidden');
  const [removeSharePassword, setRemoveSharePassword] = useState('');
  const [removeShareError, setRemoveShareError] = useState('');
  const [removeShareLoading, setRemoveShareLoading] = useState(false);
  const [showRemovePassword, setShowRemovePassword] = useState(false);
  useEffect(() => {
    const displayModeQuery = window.matchMedia('(display-mode: standalone)');
    const updateStandaloneState = () => {
      const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
      setIsStandalone(displayModeQuery.matches || iosStandalone);
    };

    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    updateStandaloneState();
    const installUrl = new URL(window.location.href);
    const installFromQuery = installUrl.searchParams.get('install') === '1';
    const popupInstallFlow = installUrl.searchParams.get('popup') === '1';
    const installFromStorage = window.localStorage.getItem(COLD_SIGNER_INSTALL_REQUEST_KEY) !== null;

    if (installFromQuery) {
      installUrl.searchParams.delete('install');
    }

    if (popupInstallFlow) {
      installUrl.searchParams.delete('popup');
    }

    if (installFromQuery || popupInstallFlow) {
      window.history.replaceState({}, '', installUrl.toString());
    }

    if (installFromStorage) {
      window.localStorage.removeItem(COLD_SIGNER_INSTALL_REQUEST_KEY);
    }

    const shouldOpenInstallModal = installFromQuery || popupInstallFlow || installFromStorage;
    setIsPopupInstallFlow(popupInstallFlow);
    setHasInstallIntent(shouldOpenInstallModal);
    setShowInstallModal(shouldOpenInstallModal);
    void checkShare();

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setShowInstallModal(false);

      if (popupInstallFlow) {
        setPostInstallMessage('Cold Signer installed. Close this window and reopen it from the installed app icon on the device.');
        window.setTimeout(() => {
          window.close();
        }, 1200);
      }
    };
    
    // Monitor network status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    displayModeQuery.addEventListener('change', updateStandaloneState);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      displayModeQuery.removeEventListener('change', updateStandaloneState);
    };
  }, []);

  const checkShare = async () => {
    try {
      const exists = await hasStoredShare();
      setHasShare(exists);
    } finally {
      setIsCheckingShare(false);
    }
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      return;
    }
  };

  const handleScanComplete = (data: string) => {
    try {
      const parsed = JSON.parse(data);

      // Detect share import payloads (from rotation/recovery QR)
      if (parsed.type === 'cold-share-import' && parsed.share) {
        setPendingShareImport({ share: parsed.share, mode: parsed.mode || 'recover' });
        setStep('idle');
        setError('');
        return;
      }
      
      // Otherwise treat as unsigned transaction
      if (!parsed.tx || !parsed.hotShare) {
        throw new Error('Invalid QR code format');
      }
      
      setScannedData(parsed as UnsignedTransaction);
      setStep('preview');
      setError('');
    } catch (err) {
      setError('Invalid QR code. Please scan a valid transaction or share import QR.');
      setStep('idle');
    }
  };

  const handlePreviewApprove = () => {
    setStep('auth');
  };

  const handlePreviewReject = () => {
    setScannedData(null);
    setStep('idle');
  };

  const handleAuthenticated = async (password: string) => {
    if (!scannedData) return;

    setError('');

    // Decrypt share first — AuthGate stays mounted, so its catch shows errors
    const coldShare = await loadAndDecryptShare('cold-share', password);

    // Decryption succeeded — now safe to leave AuthGate
    setStep('signing');

    try {
      const signed = await signTransaction(
        coldShare,
        scannedData.hotShare,
        scannedData
      );

      setSignedTx(signed);
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed');
      setStep('idle');
    }
  };

  const handleAuthCancel = () => {
    setStep('preview');
  };

  const handleComplete = () => {
    setScannedData(null);
    setSignedTx('');
    setStep('idle');
  };

  const handleScanCancel = () => {
    setStep('idle');
  };

  const handleShareLoaded = () => {
    setHasShare(true);
    setError('');
  };

  const handleShowShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setShareViewError('');
    setShareViewLoading(true);

    try {
      const decrypted = await loadAndDecryptShare('cold-share', shareViewPassword);
      setShareViewData(decrypted);
    } catch (err) {
      setShareViewError(err instanceof Error ? err.message : 'Failed to decrypt share');
    } finally {
      setShareViewLoading(false);
    }
  };

  const handleCloseShareView = () => {
    setShowShareView(false);
    setShareViewPassword('');
    setShareViewData('');
    setShareViewError('');
    setShowSharePassword(false);
  };

  const handleRemoveSharePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setRemoveShareError('');
    setRemoveShareLoading(true);

    try {
      // Verify password is correct before allowing removal
      await loadAndDecryptShare('cold-share', removeSharePassword);
      setRemoveShareStep('confirm');
    } catch (err) {
      setRemoveShareError(err instanceof Error ? err.message : 'Invalid password');
    } finally {
      setRemoveShareLoading(false);
    }
  };

  const handleRemoveShareConfirm = async () => {
    setRemoveShareLoading(true);
    try {
      await clearAllShares();
      setHasShare(false);
      setRemoveShareStep('hidden');
      setRemoveSharePassword('');
      setRemoveShareError('');
    } catch (err) {
      setRemoveShareError('Failed to remove share');
    } finally {
      setRemoveShareLoading(false);
    }
  };

  const handleCloseRemoveShare = () => {
    setRemoveShareStep('hidden');
    setRemoveSharePassword('');
    setRemoveShareError('');
    setShowRemovePassword(false);
  };

  const handleEmergencyClearShare = async () => {
    const confirmed = window.confirm(
      'Remove the stored cold signer share from this browser/device? You will need to reprovision the cold signer before signing again.'
    );

    if (!confirmed) {
      return;
    }

    try {
      await clearAllShares();
      setHasShare(false);
      setError('Stored cold signer share removed from this browser.');
    } catch (err) {
      setError('Failed to remove the stored cold signer share.');
    }
  };

  const canConfigureShare = isStandalone;
  const isReinstallBrowserFlow = hasInstallIntent && !isStandalone;

  if (isCheckingShare) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Checking secure storage...</p>
        </div>
      </div>
    );
  }

  // Network warning
  if (isOnline && hasShare && !isReinstallBrowserFlow) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-red-900 text-white p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full mb-6">
            <AlertTriangle className="w-12 h-12 text-red-900" />
          </div>
          <h1 className="text-3xl font-bold mb-4">NETWORK DETECTED</h1>
          <p className="text-xl mb-8">
            This device appears to be connected to the internet. For security, please disconnect immediately and restart the app.
          </p>
          <div className="bg-white text-red-900 rounded-lg p-6">
            <p className="font-bold mb-2">Security Violation</p>
            <p className="text-sm">
              Cold signers must NEVER be connected to the internet. Disable WiFi and mobile data now.
            </p>
          </div>

          <div className="mt-6 rounded-lg border border-white/20 bg-black/20 p-4 text-left">
            <p className="font-semibold mb-2">Stuck after uninstall/reinstall?</p>
            <p className="text-sm text-red-100/90">
              Uninstalling the PWA may leave the encrypted cold share in browser storage. Remove it here if you need to reprovision this device from scratch.
            </p>
            <button
              type="button"
              onClick={() => void handleEmergencyClearShare()}
              className="mt-4 w-full rounded-lg bg-white px-4 py-3 font-semibold text-red-900 transition-colors hover:bg-red-50"
            >
              Remove Stored Share
            </button>
          </div>
        </div>
      </div>
    );
  }

  if ((!hasShare && !canConfigureShare) || isReinstallBrowserFlow) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gray-950 px-4 py-10 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_42%),radial-gradient(circle_at_bottom,_rgba(6,182,212,0.16),_transparent_35%)]" />
        <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-gray-900/85 p-8 shadow-2xl backdrop-blur">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15">
              <Shield className="h-11 w-11 text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold">BearTec Cold Signer</h1>
            <p className="mt-3 text-gray-300">
              Install the dedicated Cold Signer app on this device before importing your Shamir share.
            </p>
          </div>

          {isReinstallBrowserFlow && hasShare && (
            <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-left text-sm text-amber-100">
              <p className="font-semibold text-amber-200">Existing cold share detected in browser storage</p>
              <p className="mt-2">
                Browser PWAs do not expose a reliable uninstall event, so removing the app icon may leave the encrypted share behind. Clear it here to make this device clean before reinstalling or reprovisioning.
              </p>
              <button
                type="button"
                onClick={() => void handleEmergencyClearShare()}
                className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-semibold text-amber-950 transition-colors hover:bg-amber-200"
              >
                Remove Stored Share And Start Clean
              </button>
            </div>
          )}

          <div className="space-y-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-5 text-sm text-cyan-100">
            <p className="font-semibold text-cyan-200">What happens next</p>
            <p>1. Install Cold Signer to this device.</p>
            <p>2. Turn off Wi-Fi and mobile data.</p>
            <p>3. Enter or scan your Shamir share inside the app.</p>
          </div>

          <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-gray-950/70 p-5 text-sm text-gray-300">
            <p className="font-semibold text-white">Install status</p>
            {isIOS ? (
              <p>Use the browser share menu and choose Add to Home Screen, then reopen Cold Signer from the installed app icon.</p>
            ) : deferredPrompt ? (
              <p>The app is ready to install on this device.</p>
            ) : (
              <p>Waiting for the browser install prompt. If it never appears, this browser may require using its menu and choosing Install app.</p>
            )}
            {postInstallMessage && (
              <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-200">
                {postInstallMessage}
              </p>
            )}
            {error && (
              <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white">
                {error}
              </p>
            )}
            {isPopupInstallFlow && !isStandalone && (
              <p>This browser window is only for installation. Share import stays disabled here until Cold Signer is opened as the installed app.</p>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowInstallModal(true)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-gray-950 transition-colors hover:bg-cyan-300"
            >
              <Download className="h-5 w-5" />
              Install Cold Signer
            </button>
            {isIOS && (
              <button
                type="button"
                onClick={() => setShowInstallModal(true)}
                className="rounded-xl border border-white/15 px-5 py-3 font-semibold text-white transition-colors hover:bg-white/5"
              >
                Show iPhone steps
              </button>
            )}
          </div>
        </div>

        {showInstallModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-gray-950 p-6 shadow-2xl">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">Install Cold Signer on this device?</h2>
                  <p className="mt-2 text-sm text-gray-300">
                    Install first, then disable network access and import your Shamir share inside the installed app.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInstallModal(false)}
                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
                  aria-label="Close install dialog"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-100">
                {isIOS ? (
                  <p>Tap Share, then choose Add to Home Screen. After it installs, launch Cold Signer from your home screen and continue setup there.</p>
                ) : deferredPrompt ? (
                  <p>The browser is ready to show the install prompt for Cold Signer.</p>
                ) : (
                  <p>The browser has not exposed the install prompt yet. If it does not appear, use the browser menu and choose Install app.</p>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowInstallModal(false)}
                  className="rounded-xl border border-white/15 px-4 py-2.5 font-semibold text-gray-200 transition-colors hover:bg-white/5 hover:text-white"
                >
                  Not now
                </button>
                {!isIOS && deferredPrompt && (
                  <button
                    type="button"
                    onClick={() => void handleInstallClick()}
                    className="rounded-xl bg-cyan-400 px-4 py-2.5 font-semibold text-gray-950 transition-colors hover:bg-cyan-300"
                  >
                    Install to device
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Share setup required
  if (!hasShare) {
    return <ShareManager onShareLoaded={handleShareLoaded} />;
  }

  // Main app flow
  if (step === 'scanning') {
    return <QRScanner onScan={handleScanComplete} onCancel={handleScanCancel} />;
  }

  if (step === 'preview' && scannedData) {
    const previewData: TransactionPreviewData = {
      chain: scannedData.tx.chain,
      to: scannedData.tx.to,
      amount: scannedData.tx.amount,
      fee: scannedData.tx.fee,
      additionalInfo: {
        ...(scannedData.tx.nonce !== undefined && { nonce: String(scannedData.tx.nonce) }),
        ...(scannedData.tx.chainId !== undefined && { chainId: String(scannedData.tx.chainId) }),
        ...(scannedData.tx.gasLimit && { gasLimit: scannedData.tx.gasLimit }),
      },
    };
    
    return (
      <TransactionPreview
        transaction={previewData}
        onApprove={handlePreviewApprove}
        onReject={handlePreviewReject}
      />
    );
  }

  if (step === 'auth') {
    return <AuthGate onAuthenticated={handleAuthenticated} onCancel={handleAuthCancel} />;
  }

  if (step === 'signing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-2">Signing Transaction...</h2>
          <p className="text-gray-400">Please wait</p>
        </div>
      </div>
    );
  }

  if (step === 'complete' && signedTx) {
    return <QRDisplay data={signedTx} onComplete={handleComplete} />;
  }

  // Share import scanned from main scanner — show ShareManager in replace mode
  if (pendingShareImport) {
    return (
      <ShareManager
        onShareLoaded={handleShareLoaded}
        initialImport={pendingShareImport}
        onImportHandled={() => setPendingShareImport(null)}
      />
    );
  }

  // Remove Share flow
  if (removeShareStep !== 'hidden') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/20 rounded-full mb-4">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Remove Cold Share</h2>
            <p className="text-gray-400">
              {removeShareStep === 'password'
                ? 'Enter your password to proceed'
                : 'Final confirmation required'}
            </p>
          </div>

          {removeShareStep === 'password' && (
            <form onSubmit={handleRemoveSharePassword} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showRemovePassword ? 'text' : 'password'}
                    value={removeSharePassword}
                    onChange={(e) => setRemoveSharePassword(e.target.value)}
                    placeholder="Enter your cold signer password"
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 pr-12"
                    autoFocus
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRemovePassword(!showRemovePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                  >
                    {showRemovePassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {removeShareError && (
                <div className="bg-red-500/10 border border-red-500 rounded-lg p-3">
                  <p className="text-red-500 text-sm">{removeShareError}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={handleCloseRemoveShare}
                  className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={removeShareLoading || !removeSharePassword}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {removeShareLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Verify'
                  )}
                </button>
              </div>
            </form>
          )}

          {removeShareStep === 'confirm' && (
            <div className="space-y-6">
              <div className="bg-red-500/10 border-2 border-red-500 rounded-lg p-6">
                <p className="text-red-400 font-bold text-lg mb-3">⚠️ Are you sure?</p>
                <p className="text-red-300 text-sm mb-3">
                  This action is <strong>irreversible</strong>. The encrypted cold share will be permanently deleted from this device.
                </p>
                <p className="text-red-300 text-sm mb-3">
                  If you do not have another copy of this share, <strong>this may compromise the safety of your holdings</strong>. You will not be able to sign transactions until a new share is provisioned.
                </p>
                <p className="text-red-200 text-sm font-semibold">
                  Do you wish to continue?
                </p>
              </div>

              {removeShareError && (
                <div className="bg-red-500/10 border border-red-500 rounded-lg p-3">
                  <p className="text-red-500 text-sm">{removeShareError}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={handleCloseRemoveShare}
                  className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold transition-colors"
                >
                  Keep Share
                </button>
                <button
                  type="button"
                  onClick={() => void handleRemoveShareConfirm()}
                  disabled={removeShareLoading}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {removeShareLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Yes, Remove Share'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show Share view
  if (showShareView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-cyan-500/20 rounded-full mb-4">
              <Lock className="w-10 h-10 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2">View Cold Share</h2>
            <p className="text-gray-400">
              {shareViewData ? 'Your decrypted cold share' : 'Enter your password to reveal the stored share'}
            </p>
          </div>

          {!shareViewData ? (
            <form onSubmit={handleShowShare} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showSharePassword ? 'text' : 'password'}
                    value={shareViewPassword}
                    onChange={(e) => setShareViewPassword(e.target.value)}
                    placeholder="Enter your cold signer password"
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 pr-12"
                    autoFocus
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSharePassword(!showSharePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                  >
                    {showSharePassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {shareViewError && (
                <div className="bg-red-500/10 border border-red-500 rounded-lg p-3">
                  <p className="text-red-500 text-sm">{shareViewError}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={handleCloseShareView}
                  className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={shareViewLoading || !shareViewPassword}
                  className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {shareViewLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Decrypt'
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="bg-gray-800 border border-cyan-500/30 rounded-lg p-4">
                <label className="block text-xs font-medium text-cyan-400 mb-2">COLD SHARE (Share 2)</label>
                <p className="text-sm font-mono break-all select-all text-white leading-relaxed">
                  {shareViewData}
                </p>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-4">
                <p className="text-yellow-500 text-sm">
                  ⚠️ Do not share this with anyone or transmit it over the internet. This share is part of your wallet&apos;s Shamir secret.
                </p>
              </div>

              <button
                onClick={handleCloseShareView}
                className="w-full px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold transition-colors"
              >
                Done — Hide Share
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Idle state
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-500/20 rounded-full mb-4">
            <Shield className="w-12 h-12 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-bold mb-2">BearTec Cold Signer</h1>
          <p className="text-gray-400">Air-gapped transaction signing</p>
        </div>

        {/* Offline Badge */}
        <div className="bg-emerald-500/10 border border-emerald-500 rounded-lg p-4 mb-8 flex items-center justify-center gap-2">
          <WifiOff className="w-5 h-5 text-emerald-500" />
          <span className="text-emerald-500 font-semibold">OFFLINE MODE</span>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        )}

        {/* Main Action Button */}
        <button
          onClick={() => setStep('scanning')}
          className="w-full px-8 py-6 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-semibold text-lg transition-colors flex items-center justify-center gap-3"
        >
          <QrCode className="w-8 h-8" />
          Scan Transaction QR
        </button>

        {/* Show Share Button */}
        <button
          onClick={() => setShowShareView(true)}
          className="w-full mt-3 px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 text-gray-300"
        >
          <Eye className="w-5 h-5" />
          Show Stored Share
        </button>

        {/* Info */}
        <div className="mt-8 space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="font-semibold mb-2">How it works:</h3>
            <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
              <li>Scan unsigned transaction QR from hot wallet</li>
              <li>Review transaction details carefully</li>
              <li>Authenticate with your password</li>
              <li>View signed transaction QR</li>
              <li>Scan signed QR with hot wallet to broadcast</li>
            </ol>
          </div>

          <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
            <p className="text-red-500 text-sm font-semibold mb-1">
              ⚠️ CRITICAL SECURITY WARNING
            </p>
            <p className="text-red-500 text-xs">
              Never connect this device to the internet after setup. Keep it offline permanently. Losing 2 or more shares means permanent loss of funds.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
