import React, { useState, useEffect } from 'react';
import { Shield, Upload, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { encrypt, generateSalt, validatePassword } from '../lib/coldCrypto';
import { storeEncryptedShare, getStoredShare, clearAllShares } from '../lib/offlineStorage';
import { EncryptedShare } from '../types/coldTypes';
import { getShareFingerprint } from '../lib/shamirService';

interface ShareManagerProps {
  onShareLoaded: () => void;
}

export default function ShareManager({ onShareLoaded }: ShareManagerProps) {
  const [hasShare, setHasShare] = useState(false);
  const [share, setShare] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkExistingShare();
  }, []);

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

      setSuccess('Share encrypted and stored successfully!');
      setHasShare(true);
      
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

  if (hasShare) {
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
          <button
            onClick={handleReset}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-semibold transition-colors"
          >
            Reset Share
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 rounded-full mb-4">
            <Shield className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Load Your Share</h2>
          <p className="text-gray-400">
            Enter your Shamir share and create a password to encrypt it
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Share Input */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Your Cold Signer Share
            </label>
            <textarea
              value={share}
              onChange={(e) => setShare(e.target.value)}
              placeholder="Paste your base64-encoded share here"
              rows={4}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
            />
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
                Encrypt and Store
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
