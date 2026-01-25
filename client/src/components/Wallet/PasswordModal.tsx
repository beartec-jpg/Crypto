// client/src/components/Wallet/PasswordModal.tsx
// Modal for password input during transaction signing

import { useState } from 'react';
import { Eye, EyeOff, Lock, X } from 'lucide-react';

interface PasswordModalProps {
  onSubmit: (password: string) => void;
  onCancel: () => void;
  title?: string;
  description?: string;
  isLoading?: boolean;
  error?: string | null;
}

export default function PasswordModal({
  onSubmit,
  onCancel,
  title = 'Enter Password',
  description = 'Enter your wallet password to sign this transaction',
  isLoading = false,
  error = null,
}: PasswordModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password && !isLoading) {
      onSubmit(password);
    }
  };

  const handleCancel = () => {
    if (!isLoading) {
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-900/30 flex items-center justify-center">
              <Lock className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="text-sm text-gray-400">{description}</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            disabled={isLoading}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Password Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                placeholder="Enter your password"
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 focus:border-emerald-500 focus:outline-none pr-12 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4 text-gray-400" />
                ) : (
                  <Eye className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-900/20 border border-red-700/50 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isLoading}
              className="flex-1 px-4 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!password || isLoading}
              className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing...</span>
                </>
              ) : (
                'Confirm'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
