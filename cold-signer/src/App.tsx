import { useEffect, useState } from 'react';
import { QrCode, Shield, WifiOff, AlertTriangle, Download, X } from 'lucide-react';
import QRScanner from './components/QRScanner';
import QRDisplay from './components/QRDisplay';
import TransactionPreview from './components/TransactionPreview';
import AuthGate from './components/AuthGate';
import ShareManager from './components/ShareManager';
import { AppStep, UnsignedTransaction, TransactionPreviewData } from './types/coldTypes';
import { signTransaction } from './lib/coldSigner';
import { loadAndDecryptShare, hasStoredShare } from './lib/offlineStorage';

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
  const [postInstallMessage, setPostInstallMessage] = useState('');
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [scannedData, setScannedData] = useState<UnsignedTransaction | null>(null);
  const [signedTx, setSignedTx] = useState<string>('');
  const [error, setError] = useState<string>('');

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
      const parsed = JSON.parse(data) as UnsignedTransaction;
      
      if (!parsed.tx || !parsed.hotShare) {
        throw new Error('Invalid QR code format');
      }
      
      setScannedData(parsed);
      setStep('preview');
      setError('');
    } catch (err) {
      setError('Invalid QR code. Please scan a valid transaction QR.');
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

    setStep('signing');
    setError('');

    try {
      // Load and decrypt the cold share
      const coldShare = await loadAndDecryptShare('cold-share', password);

      // Sign the transaction
      const signed = await signTransaction(
        coldShare,
        scannedData.hotShare,
        scannedData
      );

      setSignedTx(signed);
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed');
      setStep('auth');
      throw err; // Re-throw to show error in AuthGate
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
  };

  const canConfigureShare = isStandalone;

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
  if (isOnline && hasShare) {
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
        </div>
      </div>
    );
  }

  if (!hasShare && !canConfigureShare) {
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

        {/* Info */}
        <div className="mt-8 space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="font-semibold mb-2">How it works:</h3>
            <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
              <li>Scan unsigned transaction QR from hot wallet</li>
              <li>Review transaction details carefully</li>
              <li>Authenticate with PIN and password</li>
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
