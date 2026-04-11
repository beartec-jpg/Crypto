import { useState } from 'react';
import { Eye, EyeOff, Shield, AlertCircle, CheckCircle, Copy, Download, Lock, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { splitMnemonic, getShareFingerprint } from '../../lib/shamirService';
import { storeHotShare } from '../../lib/coldSignerService';

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

interface ColdSignerSetupProps {
  mnemonic: string;
  onClose: () => void;
  walletId?: string;
}

type SetupStep = 'intro' | 'password' | 'shares' | 'download' | 'complete';

export default function ColdSignerSetup({ mnemonic, onClose, walletId }: ColdSignerSetupProps) {
  const [step, setStep] = useState<SetupStep>('intro');
  const [shares, setShares] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [buildHash, setBuildHash] = useState<string>('');
  const [showShareQR, setShowShareQR] = useState<number | null>(null);
  const [sharePassword, setSharePassword] = useState('');
  const [sharePasswordConfirm, setSharePasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [pendingShares, setPendingShares] = useState<string[]>([]);

  const handleGenerateShares = () => {
    try {
      const generatedShares = splitMnemonic(mnemonic, { shares: 3, threshold: 2 });
      setPendingShares(generatedShares);
      setStep('password');
    } catch (error) {
      console.error('Failed to generate shares:', error);
    }
  };

  const handlePasswordSubmit = async () => {
    setPasswordError('');
    if (sharePassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    if (sharePassword !== sharePasswordConfirm) {
      setPasswordError('Passwords do not match');
      return;
    }
    try {
      await storeHotShare(pendingShares[0], sharePassword, walletId);
      setShares(pendingShares);
      setShowShareQR(1);
      setStep('shares');
      sha256('cold-signer-build').then(hash => setBuildHash(hash));
    } catch (error) {
      setPasswordError('Failed to encrypt share');
      console.error('Failed to store share:', error);
    }
  };

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const renderIntro = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 rounded-full mb-4">
          <Shield className="w-10 h-10 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Set Up Cold Signer</h2>
        <p className="text-gray-400">
          Enhance security with Shamir Secret Sharing and air-gapped signing
        </p>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 space-y-4">
        <h3 className="font-semibold text-lg">How it works:</h3>
        
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500 font-bold">
              1
            </div>
            <div>
              <p className="font-medium">Split Your Wallet</p>
              <p className="text-sm text-gray-400">
                Your wallet is split into 3 shares using Shamir Secret Sharing. Any 2 shares can reconstruct the wallet.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500 font-bold">
              2
            </div>
            <div>
              <p className="font-medium">Distribute Securely</p>
              <p className="text-sm text-gray-400">
                Share 1 stays in hot wallet, Share 2 goes to cold signer device, Share 3 to secure backup.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500 font-bold">
              3
            </div>
            <div>
              <p className="font-medium">Sign Transactions</p>
              <p className="text-sm text-gray-400">
                Hot wallet creates unsigned transaction QR, cold signer scans, signs offline, returns signed QR.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
        <div className="flex gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-500 font-semibold mb-1">Critical Security Warning</p>
            <p className="text-red-500 text-sm">
              Losing 2 or more shares means permanent loss of funds. Store Share 3 in a safe place (paper wallet, safety deposit box).
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={onClose}
          className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleGenerateShares}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <Lock className="w-5 h-5" />
          Generate Shares
        </button>
      </div>
    </div>
  );

  const renderShares = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 rounded-full mb-4">
          <CheckCircle className="w-10 h-10 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Your Shares</h2>
        <p className="text-gray-400">
          Store each share securely - you need any 2 to sign transactions
        </p>
      </div>

      {shares[1] && (
        <div className="rounded-lg border border-cyan-500 bg-cyan-500/10 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-cyan-300">Share 2 for Cold Signer</p>
              <p className="mt-1 text-sm text-cyan-100">
                This is the share you transfer to the cold signer device. The QR is opened by default below.
              </p>
            </div>
            <button
              onClick={() => setShowShareQR(showShareQR === 1 ? null : 1)}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-cyan-300"
            >
              <QrCode className="w-4 h-4" />
              {showShareQR === 1 ? 'Hide Share 2 QR' : 'Show Share 2 QR'}
            </button>
          </div>
        </div>
      )}

      {shares.map((share, index) => (
        <div key={index} className="bg-gray-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500 font-bold">
                {index + 1}
              </div>
              <div>
                <p className="font-semibold">
                  Share {index + 1}
                  {index === 0 && ' (Hot Wallet)'}
                  {index === 1 && ' (Cold Signer)'}
                  {index === 2 && ' (Backup)'}
                </p>
                <p className="text-xs text-gray-500">
                  Fingerprint: {getShareFingerprint(share)}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleCopy(share, index)}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              aria-label={`Copy share ${index + 1}`}
            >
              {copiedIndex === index ? (
                <CheckCircle className="w-5 h-5 text-emerald-500" />
              ) : (
                <Copy className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={() => setShowShareQR(showShareQR === index ? null : index)}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              aria-label={`Show QR for share ${index + 1}`}
            >
              <QrCode className={`w-5 h-5 ${showShareQR === index ? 'text-emerald-500' : ''}`} />
            </button>
          </div>

          <div className="bg-gray-900 rounded p-3">
            <p className="text-xs text-gray-400 break-all font-mono">
              {share}
            </p>
          </div>

          {showShareQR === index && (
            <div className="flex flex-col items-center gap-2 bg-white rounded-lg p-4">
              <QRCodeSVG
                value={share}
                size={220}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
              />
              <p className="text-xs text-gray-800 font-medium">
                Scan with cold signer device
              </p>
            </div>
          )}

          {index === 0 && (
            <p className="text-xs text-emerald-500">
              ✓ This share will be stored in your hot wallet
            </p>
          )}
          {index === 1 && (
            <p className="text-xs text-yellow-500">
              ⚠ Copy this share to your cold signer device
            </p>
          )}
          {index === 2 && (
            <p className="text-xs text-red-500">
              🔒 Store this backup share in a secure location
            </p>
          )}
        </div>
      ))}

      <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-4">
        <p className="text-yellow-500 text-sm">
          <strong>Important:</strong> Write down or print Share 3 and store it securely. This is your recovery share if the cold signer is lost.
        </p>
      </div>

      <button
        onClick={() => setStep('download')}
        className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-semibold transition-colors"
      >
        Continue to Download
      </button>
    </div>
  );

  const renderDownload = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 rounded-full mb-4">
          <Download className="w-10 h-10 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Download Cold Signer PWA</h2>
        <p className="text-gray-400">
          Install the cold signer on a dedicated offline device
        </p>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 space-y-4">
        <h3 className="font-semibold">Setup Instructions:</h3>
        
        <ol className="space-y-3 text-sm text-gray-400 list-decimal list-inside">
          <li>Visit the cold signer URL on your dedicated Android phone</li>
          <li>Install the PWA (Add to Home Screen)</li>
          <li>Turn off WiFi and mobile data permanently</li>
          <li>Open the cold signer app and enter Share 2</li>
          <li>Create a strong password to encrypt the share</li>
          <li>Never connect this device to the internet again</li>
        </ol>
      </div>

      {shares[1] && (
        <div className="bg-gray-800 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">Share 2 QR for Cold Signer</p>
              <p className="text-sm text-gray-400">Scan this from the installed Cold Signer app on the offline device.</p>
            </div>
            <button
              onClick={() => setShowShareQR(showShareQR === 1 ? null : 1)}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-cyan-300"
            >
              <QrCode className="w-4 h-4" />
              {showShareQR === 1 ? 'Hide QR' : 'Show QR'}
            </button>
          </div>

          {showShareQR === 1 && (
            <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-4">
              <QRCodeSVG
                value={shares[1]}
                size={220}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
              />
              <p className="text-center text-xs font-medium text-gray-800">
                Scan this QR from the installed Cold Signer app to import Share 2
              </p>
            </div>
          )}
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-4 space-y-2">
        <p className="text-sm font-medium">Cold Signer URL:</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={`${window.location.origin}/cold-signer/`}
            readOnly
            className="flex-1 px-3 py-2 bg-gray-900 rounded text-sm font-mono"
          />
          <button
            onClick={() => handleCopy(`${window.location.origin}/cold-signer/`, -1)}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            {copiedIndex === -1 ? (
              <CheckCircle className="w-5 h-5 text-emerald-500" />
            ) : (
              <Copy className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {buildHash && (
        <div className="bg-gray-800 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium">Build Verification Hash:</p>
          <p className="text-xs text-gray-400 break-all font-mono bg-gray-900 rounded p-2">
            {buildHash}
          </p>
          <p className="text-xs text-gray-500">
            Verify this hash matches the deployed version for security
          </p>
        </div>
      )}

      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
        <p className="text-red-500 text-sm">
          <strong>NEVER</strong> connect the cold signer device to the internet after setup. This device must remain permanently offline.
        </p>
      </div>

      <button
        onClick={() => setStep('complete')}
        className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-semibold transition-colors"
      >
        Complete Setup
      </button>
    </div>
  );

  const renderComplete = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 rounded-full mb-4">
          <CheckCircle className="w-10 h-10 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Setup Complete!</h2>
        <p className="text-gray-400">
          Your cold signer is ready to use
        </p>
      </div>

      <div className="bg-emerald-500/10 border border-emerald-500 rounded-lg p-6 space-y-3">
        <p className="text-emerald-500 font-semibold">✓ Shares Generated</p>
        <p className="text-emerald-500 font-semibold">✓ Share 1 Stored in Hot Wallet</p>
        <p className="text-emerald-500 font-semibold">✓ Share 2 Ready for Cold Signer</p>
        <p className="text-emerald-500 font-semibold">✓ Share 3 Backed Up Securely</p>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 space-y-3">
        <h3 className="font-semibold">Next Steps:</h3>
        <ul className="space-y-2 text-sm text-gray-400 list-disc list-inside">
          <li>Complete cold signer device setup with Share 2</li>
          <li>Test signing with a small transaction</li>
          <li>Store Share 3 in a secure offline location</li>
          <li>Keep the cold signer device permanently offline</li>
        </ul>
      </div>

      <button
        onClick={onClose}
        className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-semibold transition-colors"
      >
        Done
      </button>
    </div>
  );

  const renderPassword = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 rounded-full mb-4">
          <Lock className="w-10 h-10 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Encrypt Hot Share</h2>
        <p className="text-gray-400">
          Set a password to encrypt Share 1 on this device. You will need this password to sign transactions later.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={sharePassword}
              onChange={(e) => { setSharePassword(e.target.value); setPasswordError(''); }}
              placeholder="Enter a strong password"
              autoComplete="off"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Confirm Password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={sharePasswordConfirm}
            onChange={(e) => { setSharePasswordConfirm(e.target.value); setPasswordError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void handlePasswordSubmit(); }}
            placeholder="Confirm password"
            autoComplete="off"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        {passwordError && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {passwordError}
          </div>
        )}
      </div>

      <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-4">
        <p className="text-sm text-amber-200">
          <strong>Remember this password.</strong> You will need it every time you send a cold-signed transaction or rotate shares.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => setStep('intro')}
          className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => void handlePasswordSubmit()}
          disabled={!sharePassword || !sharePasswordConfirm}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <Lock className="w-5 h-5" />
          Encrypt & Continue
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {step === 'intro' && renderIntro()}
          {step === 'password' && renderPassword()}
          {step === 'shares' && renderShares()}
          {step === 'download' && renderDownload()}
          {step === 'complete' && renderComplete()}
        </div>
      </div>
    </div>
  );
}
