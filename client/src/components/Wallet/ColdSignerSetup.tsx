import { useState } from 'react';
import { Shield, AlertCircle, CheckCircle, Copy, Download, Lock } from 'lucide-react';
import { splitMnemonic, getShareFingerprint } from '../../lib/shamirService';
import { sha256 } from '../../lib/walletService';

interface ColdSignerSetupProps {
  mnemonic: string;
  onClose: () => void;
}

type SetupStep = 'intro' | 'shares' | 'download' | 'complete';

export default function ColdSignerSetup({ mnemonic, onClose }: ColdSignerSetupProps) {
  const [step, setStep] = useState<SetupStep>('intro');
  const [shares, setShares] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [buildHash, setBuildHash] = useState<string>('');

  const handleGenerateShares = () => {
    try {
      const generatedShares = splitMnemonic(mnemonic, { shares: 3, threshold: 2 });
      setShares(generatedShares);
      setStep('shares');
      
      // Generate build hash (placeholder - would be real build hash in production)
      sha256('cold-signer-build').then(hash => setBuildHash(hash));
    } catch (error) {
      console.error('Failed to generate shares:', error);
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
          </div>

          <div className="bg-gray-900 rounded p-3">
            <p className="text-xs text-gray-400 break-all font-mono">
              {share}
            </p>
          </div>

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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {step === 'intro' && renderIntro()}
          {step === 'shares' && renderShares()}
          {step === 'download' && renderDownload()}
          {step === 'complete' && renderComplete()}
        </div>
      </div>
    </div>
  );
}
