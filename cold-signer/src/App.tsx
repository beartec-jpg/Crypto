import React, { useState, useEffect } from 'react';
import { QrCode, Shield, WifiOff, AlertTriangle } from 'lucide-react';
import QRScanner from './components/QRScanner';
import QRDisplay from './components/QRDisplay';
import TransactionPreview from './components/TransactionPreview';
import AuthGate from './components/AuthGate';
import ShareManager from './components/ShareManager';
import { AppStep, UnsignedTransaction, TransactionPreviewData } from './types/coldTypes';
import { signTransaction } from './lib/coldSigner';
import { loadAndDecryptShare, hasStoredShare } from './lib/offlineStorage';

function App() {
  const [step, setStep] = useState<AppStep>('idle');
  const [hasShare, setHasShare] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [scannedData, setScannedData] = useState<UnsignedTransaction | null>(null);
  const [signedTx, setSignedTx] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    checkShare();
    
    // Monitor network status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkShare = async () => {
    const exists = await hasStoredShare();
    setHasShare(exists);
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

  // Network warning
  if (isOnline) {
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
              Never connect this device to the internet after setup. Keep it offline permanently. Losing 2+ shares = permanent loss of funds.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
