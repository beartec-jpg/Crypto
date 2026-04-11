import { useState, useEffect } from 'react';
import { Shield, Upload, AlertCircle, CheckCircle, Eye, EyeOff, QrCode, Download, Share2 } from 'lucide-react';
import { encrypt, generateSalt, validatePassword } from '../lib/coldCrypto';
import { storeEncryptedShare, getStoredShare, clearAllShares } from '../lib/offlineStorage';
import { EncryptedShare } from '../types/coldTypes';
import { getShareFingerprint } from '../lib/shamirService';
import QRScanner from './QRScanner';

interface ColdSignerShareImportPayload {
  type: 'cold-share-import';
  mode: 'recover' | 'rotate';
  share: string;
  fingerprint: string;
  createdAt: string;
}

interface ShareManagerProps {
  onShareLoaded: () => void;
  installPrompt?: {
    canPrompt: boolean;
    isIOS: boolean;
    onInstall: () => Promise<void>;
  };
  initialImport?: {
    share: string;
    mode: 'recover' | 'rotate';
  } | null;
  onImportHandled?: () => void;
}

export default function ShareManager({ onShareLoaded, installPrompt, initialImport, onImportHandled }: ShareManagerProps) {
  const [hasShare, setHasShare] = useState(false);
  const [isReplacingShare, setIsReplacingShare] = useState(false);
  const [share, setShare] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [importMode, setImportMode] = useState<'recover' | 'rotate' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showQRScanner, setShowQRScanner] = useState(false);

  useEffect(() => {
    checkExistingShare();
  }, []);

  // Pre-fill from main scanner share import
  useEffect(() => {
    if (initialImport) {
      setShare(initialImport.share);
      setImportMode(initialImport.mode);
      setIsReplacingShare(hasShare || initialImport.mode === 'rotate');
      setSuccess(
        initialImport.mode === 'rotate'
          ? 'Rotation payload loaded. Saving will replace the existing cold share on this device.'
          : 'Recovery payload loaded. Set a password and save to store on this device.'
      );
      onImportHandled?.();
    }
  }, [initialImport]);

  const checkExistingShare = async () => {
    try {
      const existingShare = await getStoredShare();
      setHasShare(!!existingShare);
      if (existingShare) {
        onShareLoaded();
      }
    } catch (err) {
      console.error('Error checking share:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQRScan = (data: string) => {
    setShowQRScanner(false);
    const trimmed = data.trim();

    if (!trimmed) {
      setError('QR code was empty');
      return;
    }

    try {
      const parsed = JSON.parse(trimmed) as ColdSignerShareImportPayload;

      if (parsed.type === 'cold-share-import' && parsed.share) {
        setShare(parsed.share.trim());
        setImportMode(parsed.mode);
        setIsReplacingShare(hasShare || parsed.mode === 'rotate');
        setSuccess(
          parsed.mode === 'rotate'
            ? 'Rotation payload loaded. Saving will replace the existing cold share on this device.'
            : 'Recovery payload loaded. Saving will provision this device with the replacement cold share.'
        );
        return;
      }
    } catch {
      // Not a structured payload, fall through to raw share handling.
    }

    setShare(trimmed);
    setImportMode(null);
    if (trimmed) {
      setSuccess('Share loaded from QR code');
    } else {
      setError('QR code was empty');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!share.trim()) {
      setError('Please enter your share');
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setError(passwordValidation.error || 'Invalid password');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const salt = generateSalt();
      const { encrypted } = await encrypt(share.trim(), password, salt);

      const encryptedShare: EncryptedShare = {
        id: 'cold-share',
        encryptedData: encrypted,
        salt: salt,
        createdAt: new Date().toISOString(),
      };

      await storeEncryptedShare(encryptedShare);

      setSuccess(
        isReplacingShare
          ? 'Stored share replaced successfully!'
          : 'Share encrypted and stored successfully!'
      );
      setHasShare(true);
      setIsReplacingShare(false);
      setImportMode(null);
      
      // Clear form
      setShare('');
      setPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        onShareLoaded();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store share');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    if (window.confirm('Are you sure you want to delete the stored share? This cannot be undone.')) {
      try {
        await clearAllShares();
        setHasShare(false);
        setSuccess('Share deleted successfully');
      } catch (err) {
        setError('Failed to delete share');
      }
    }
  };

  if (isLoading && hasShare) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-white text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (showQRScanner) {
    return (
      <QRScanner
        onScan={handleQRScan}
        onCancel={() => setShowQRScanner(false)}
      />
    );
  }

  if (hasShare && !isReplacingShare) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 rounded-full mb-4">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Share Loaded</h2>
          <p className="text-gray-400 mb-8">
            Your encrypted share is ready for signing
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={() => {
                setIsReplacingShare(true);
                setError('');
                setSuccess('Scan or paste a replacement payload to reprovision this cold signer.');
              }}
              className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-sm font-semibold text-gray-950 transition-colors"
            >
              Replace Stored Share
            </button>
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-semibold transition-colors"
            >
              Reset Share
            </button>
          </div>
        </div>
      </div>
    );
  }

  const formHeading = isReplacingShare ? 'Replace Stored Share' : 'Load Your Share';
  const formSubtitle = isReplacingShare
    ? 'Scan a recovery or rotation payload, then encrypt the new cold share on this device.'
    : 'Enter your Shamir share and create a password to encrypt it';
  const submitLabel = isReplacingShare ? 'Replace Stored Share' : 'Encrypt and Store';

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <div className="w-full max-w-md">
        {installPrompt && (
          <div className="mb-6 rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-cyan-500/20 p-2">
                {installPrompt.isIOS ? (
                  <Share2 className="h-5 w-5 text-cyan-300" />
                ) : (
                  <Download className="h-5 w-5 text-cyan-300" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-cyan-200">Install on this device before importing your share</p>
                <p className="mt-1 text-sm text-cyan-100/80">
                  First-time setup can happen online. Once your Shamir share is stored, this device should stay offline.
                </p>
                {installPrompt.isIOS ? (
                  <p className="mt-3 text-sm text-cyan-100">
                    Open the browser share menu and choose Add to Home Screen.
                  </p>
                ) : installPrompt.canPrompt ? (
                  <button
                    type="button"
                    onClick={() => void installPrompt.onInstall()}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-cyan-300"
                  >
                    <Download className="h-4 w-4" />
                    Install app
                  </button>
                ) : (
                  <p className="mt-3 text-sm text-cyan-100">
                    If the install button does not appear, use the browser menu and choose Install app or Add to Home Screen.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 rounded-full mb-4">
            <Shield className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">{formHeading}</h2>
          <p className="text-gray-400">
            {formSubtitle}
          </p>
        </div>

        {importMode && (
          <div className="mb-6 rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-4 text-sm text-cyan-100">
            {importMode === 'rotate'
              ? 'Rotation payload detected. Saving will overwrite the old cold share on this device.'
              : 'Recovery payload detected. Saving will initialize this device with the replacement cold share.'}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Share Input */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Your Cold Signer Share
            </label>
            <textarea
              value={share}
              onChange={(e) => setShare(e.target.value)}
              placeholder="Paste your hex-encoded share here"
              rows={4}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowQRScanner(true)}
              className="mt-2 w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-semibold"
            >
              <QrCode className="w-4 h-4" />
              Scan Share QR Code
            </button>
            {share && (
              <p className="mt-2 text-xs text-gray-400">
                Fingerprint: {getShareFingerprint(share)}
              </p>
            )}
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Create Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Confirm Password Input */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500 rounded-lg p-3 flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className="text-emerald-500 text-sm">{success}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Encrypting...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                {submitLabel}
              </>
            )}
          </button>
        </form>

        <div className="mt-6 bg-red-500/10 border border-red-500 rounded-lg p-4">
          <p className="text-red-500 text-sm">
            ⚠️ IMPORTANT: This share will be encrypted and stored on this device. Never share your password or connect this device to the internet.
          </p>
        </div>
      </div>
    </div>
  );
}
