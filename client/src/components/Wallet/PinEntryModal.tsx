// client/src/components/Wallet/PinEntryModal.tsx
// PIN entry modal with numpad interface for Maximum security tier

import { useState, useEffect } from 'react';
import { Lock, X, AlertTriangle, Delete } from 'lucide-react';
import { verifyPin, isPinLockedOut, getPinLockoutMinutes } from '@/lib/securityService';

interface PinEntryModalProps {
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
  onForgotPin?: () => void;
  title?: string;
  description?: string;
}

export default function PinEntryModal({
  userId,
  onClose,
  onSuccess,
  onForgotPin,
  title = 'Enter PIN',
  description = 'Enter your 6-digit PIN to continue',
}: PinEntryModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutMinutes, setLockoutMinutes] = useState(0);

  // Check lockout status on mount and update every second
  useEffect(() => {
    const checkLockout = () => {
      const lockedOut = isPinLockedOut(userId);
      setIsLockedOut(lockedOut);
      if (lockedOut) {
        setLockoutMinutes(getPinLockoutMinutes(userId));
      }
    };

    checkLockout();
    const interval = setInterval(checkLockout, 1000);

    return () => clearInterval(interval);
  }, [userId]);

  const handleNumberClick = (num: string) => {
    if (pin.length < 6) {
      const newPin = pin + num;
      setPin(newPin);
      setError(null);

      // Auto-submit when 6 digits entered
      if (newPin.length === 6) {
        handleVerifyPin(newPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    setPin('');
    setError(null);
  };

  const handleVerifyPin = async (pinToVerify: string = pin) => {
    if (pinToVerify.length !== 6) {
      setError('PIN must be 6 digits');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const valid = await verifyPin(userId, pinToVerify);
      if (valid) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Invalid PIN');
      setPin(''); // Clear PIN on error
      
      // Check if now locked out
      if (err.message.includes('Too many failed attempts')) {
        setIsLockedOut(true);
        setLockoutMinutes(getPinLockoutMinutes(userId));
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const renderPinDots = () => {
    return (
      <div className="flex items-center justify-center gap-3 mb-8">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all ${
              i < pin.length
                ? 'bg-emerald-400 border-emerald-400'
                : 'bg-transparent border-gray-600'
            }`}
          />
        ))}
      </div>
    );
  };

  const renderNumpad = () => {
    const numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

    return (
      <div className="space-y-3">
        {/* Number grid */}
        <div className="grid grid-cols-3 gap-3">
          {numbers.map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num)}
              disabled={isLockedOut || isVerifying}
              className="w-full aspect-square rounded-xl bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed transition-colors text-2xl font-semibold"
            >
              {num}
            </button>
          ))}
        </div>

        {/* Bottom row: backspace, 0, clear */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={handleBackspace}
            disabled={pin.length === 0 || isLockedOut || isVerifying}
            className="w-full aspect-square rounded-xl bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            <Delete className="w-6 h-6" />
          </button>
          <button
            onClick={() => handleNumberClick('0')}
            disabled={isLockedOut || isVerifying}
            className="w-full aspect-square rounded-xl bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed transition-colors text-2xl font-semibold"
          >
            0
          </button>
          <button
            onClick={handleClear}
            disabled={pin.length === 0 || isLockedOut || isVerifying}
            className="w-full aspect-square rounded-xl bg-red-900/30 hover:bg-red-800/40 disabled:bg-gray-800 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            Clear
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="text-sm text-gray-400">{description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Lockout Warning */}
          {isLockedOut && (
            <div className="mb-6 p-4 rounded-lg bg-red-900/30 border border-red-700/50">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-400">Account Locked</p>
                  <p className="text-sm text-red-300 mt-1">
                    Too many failed attempts. Please wait {lockoutMinutes} minute{lockoutMinutes > 1 ? 's' : ''} before trying again.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && !isLockedOut && (
            <div className="mb-6 p-3 rounded-lg bg-red-900/20 border border-red-700/50 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* PIN Dots */}
          {renderPinDots()}

          {/* Numpad */}
          {renderNumpad()}

          {/* Forgot PIN */}
          {onForgotPin && (
            <div className="mt-6 text-center">
              <button
                onClick={onForgotPin}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Forgot PIN? Reset with Password
              </button>
            </div>
          )}

          {/* Loading State */}
          {isVerifying && (
            <div className="mt-6 flex items-center justify-center gap-2 text-emerald-400">
              <div className="w-5 h-5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
              <span className="text-sm">Verifying...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
