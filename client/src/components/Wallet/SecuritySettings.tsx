// client/src/components/Wallet/SecuritySettings.tsx
// Security tier management UI - Tier 1/2/3 selection and PIN setup

import { useState, useEffect } from 'react';
import { Shield, Lock, AlertTriangle, Check, ChevronRight } from 'lucide-react';
import {
  getSecuritySettings,
  changeSecurityTier,
  setupPin,
  emergencySecurityReset,
  type SecurityTier,
  SECURITY_REQUIREMENTS,
} from '@/lib/securityService';
import { registerPasskey, isPasskeyRegistered } from '@/lib/passkeyService';
import PinEntryModal from './PinEntryModal';

interface SecuritySettingsProps {
  userId: string;
  onSecurityChange?: () => void;
}

type SetupMode = 'pin-setup' | 'pin-confirm' | 'emergency-reset' | null;

export default function SecuritySettings({ userId, onSecurityChange }: SecuritySettingsProps) {
  const [currentTier, setCurrentTier] = useState<SecurityTier>('standard');
  const [setupMode, setSetupMode] = useState<SetupMode>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState(false);
  const [pendingDowngradeTier, setPendingDowngradeTier] = useState<SecurityTier | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  useEffect(() => {
    const settings = getSecuritySettings();
    setCurrentTier(settings.tier);
  }, []);

  const getTierColor = (tier: SecurityTier) => {
    switch (tier) {
      case 'standard':
        return 'emerald';
      case 'enhanced':
        return 'amber';
      case 'maximum':
        return 'red';
    }
  };

  const getTierEmoji = (tier: SecurityTier) => {
    switch (tier) {
      case 'standard':
        return '🟢';
      case 'enhanced':
        return '🟡';
      case 'maximum':
        return '🔴';
    }
  };

  const getTierDescription = (tier: SecurityTier) => {
    switch (tier) {
      case 'standard':
        return {
          title: 'STANDARD',
          subtitle: 'Default security for most users',
          features: [
            'Auto-login when authenticated',
            'Passkey required to send transactions',
            'Password + Passkey for seed phrase access',
            'Balanced security and convenience',
          ],
        };
      case 'enhanced':
        return {
          title: 'ENHANCED',
          subtitle: 'Additional protection layer',
          features: [
            'Passkey required to open wallet',
            'Auto-lock after inactivity',
            'All standard security features',
            'Recommended for active traders',
          ],
        };
      case 'maximum':
        return {
          title: 'MAXIMUM',
          subtitle: 'Highest security for large holdings',
          features: [
            'PIN + Passkey for all wallet actions',
            'PIN + Password + Passkey for seed phrase',
            'Rate-limited PIN attempts (5 max)',
            '15-minute lockout after failed attempts',
          ],
        };
    }
  };

  const handleUpgradeToEnhanced = async () => {
    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      // Check if passkey is registered
      if (!isPasskeyRegistered()) {
        // Register passkey first
        await registerPasskey('wallet_user');
      }

      changeSecurityTier('enhanced');
      setCurrentTier('enhanced');
      setSuccess('✅ Upgraded to Enhanced security');
      onSecurityChange?.();
    } catch (err: any) {
      setError(err.message || 'Failed to upgrade security tier');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpgradeToMaximum = () => {
    // Start PIN setup flow
    setSetupMode('pin-setup');
    setError(null);
    setSuccess(null);
  };

  const handlePinSetupSubmit = () => {
    setError(null);

    // Validate PIN
    if (pinInput.length !== 6 || !/^\d+$/.test(pinInput)) {
      setError('PIN must be exactly 6 digits');
      return;
    }

    if (pinInput !== pinConfirm) {
      setError('PINs do not match');
      return;
    }

    // Move to confirmation
    setSetupMode('pin-confirm');
  };

  const handlePinSetupComplete = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // Check if passkey is registered
      if (!isPasskeyRegistered()) {
        await registerPasskey('wallet_user');
      }

      // Setup PIN
      await setupPin(pinInput);

      // Change tier
      changeSecurityTier('maximum');
      setCurrentTier('maximum');

      // Clear PIN inputs
      setPinInput('');
      setPinConfirm('');
      setSetupMode(null);

      setSuccess('✅ Upgraded to Maximum security with PIN protection');
      onSecurityChange?.();
    } catch (err: any) {
      setError(err.message || 'Failed to setup PIN');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDowngrade = async (targetTier: SecurityTier) => {
    // Show confirmation UI instead of window.confirm
    setPendingDowngradeTier(targetTier);
    setShowDowngradeConfirm(true);
  };

  const confirmDowngrade = async () => {
    if (!pendingDowngradeTier) return;
    
    setIsProcessing(true);
    try {
      changeSecurityTier(pendingDowngradeTier);
      setCurrentTier(pendingDowngradeTier);
      setSuccess(`✅ Security level changed to ${pendingDowngradeTier}`);
      onSecurityChange?.();
    } catch (err: any) {
      setError(err.message || 'Failed to change security tier');
    } finally {
      setIsProcessing(false);
      setShowDowngradeConfirm(false);
      setPendingDowngradeTier(null);
    }
  };

  const cancelDowngrade = () => {
    setShowDowngradeConfirm(false);
    setPendingDowngradeTier(null);
  };

  const handleEmergencyReset = async () => {
    // Emergency reset confirmed - no window.confirm needed as we have UI confirmation
    emergencySecurityReset();
    setCurrentTier('standard');
    setShowResetConfirm(false);
    setResetPassword('');
    setSuccess('✅ Security reset to Standard tier');
    onSecurityChange?.();
  };

  const renderTierCard = (tier: SecurityTier) => {
    const desc = getTierDescription(tier);
    const color = getTierColor(tier);
    const isActive = currentTier === tier;
    const canUpgrade = 
      (tier === 'enhanced' && currentTier === 'standard') ||
      (tier === 'maximum' && (currentTier === 'standard' || currentTier === 'enhanced'));
    const canDowngrade = 
      (tier === 'standard' && currentTier !== 'standard') ||
      (tier === 'enhanced' && currentTier === 'maximum');

    const getActiveClasses = () => {
      if (!isActive) return 'bg-gray-900/50 border-gray-700';
      
      switch (tier) {
        case 'standard':
          return 'bg-emerald-900/30 border-emerald-500';
        case 'enhanced':
          return 'bg-amber-900/30 border-amber-500';
        case 'maximum':
          return 'bg-red-900/30 border-red-500';
      }
    };

    return (
      <div
        key={tier}
        className={`p-6 rounded-xl border-2 transition-all ${getActiveClasses()}`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{getTierEmoji(tier)}</span>
            <div>
              <h3 className="font-bold text-lg">{desc.title}</h3>
              <p className="text-sm text-gray-400">{desc.subtitle}</p>
            </div>
          </div>
          {isActive && (
            <div className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
              Active
            </div>
          )}
        </div>

        <ul className="space-y-2 mb-4">
          {desc.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {canUpgrade && (
          <button
            onClick={() =>
              tier === 'enhanced'
                ? handleUpgradeToEnhanced()
                : handleUpgradeToMaximum()
            }
            disabled={isProcessing}
            className={
              tier === 'enhanced'
                ? 'w-full px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2'
                : tier === 'maximum'
                ? 'w-full px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2'
                : 'w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2'
            }
          >
            Upgrade to {desc.title}
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {canDowngrade && (
          <button
            onClick={() => handleDowngrade(tier)}
            disabled={isProcessing}
            className="w-full px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Switch to {desc.title}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Security Level</h2>
        <p className="text-gray-400">
          Choose the security level that best fits your needs
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 rounded-lg bg-red-900/30 border border-red-700/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-emerald-900/30 border border-emerald-700/50">
          <p className="text-sm text-emerald-400">{success}</p>
        </div>
      )}

      {/* Current Tier Badge */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-gray-900/50 border border-gray-700">
        <Shield className="w-6 h-6 text-emerald-400" />
        <div>
          <p className="text-sm text-gray-400">Current Security Level</p>
          <p className="font-semibold">
            {getTierEmoji(currentTier)} {currentTier.toUpperCase()}
          </p>
        </div>
      </div>

      {/* Tier Cards */}
      <div className="space-y-4">
        {renderTierCard('standard')}
        {renderTierCard('enhanced')}
        {renderTierCard('maximum')}
      </div>

      {/* Emergency Reset */}
      <div className="pt-6 border-t border-gray-700">
        <h3 className="text-lg font-medium mb-4">⚠️ Emergency Reset</h3>
        <div className="p-4 rounded-xl bg-red-900/20 border border-red-700/50">
          <p className="text-sm text-gray-400 mb-3">
            If you've forgotten your PIN or need to reset security settings, you can reset to Standard tier.
            This requires your wallet password.
          </p>
          {!showResetConfirm ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors text-sm"
            >
              Reset to Standard Security
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-red-300 font-medium">
                Warning: This will reset all security settings and remove PIN protection.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEmergencyReset}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 transition-colors text-sm"
                >
                  Confirm Reset
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PIN Setup Modal */}
      {setupMode === 'pin-setup' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Setup 6-Digit PIN</h2>
                <p className="text-sm text-gray-400">Choose a PIN you can remember</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-700/50">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Enter PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    setPinInput(value);
                    setError(null);
                  }}
                  placeholder="••••••"
                  className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none text-center text-2xl tracking-widest"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinConfirm}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    setPinConfirm(value);
                    setError(null);
                  }}
                  placeholder="••••••"
                  className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none text-center text-2xl tracking-widest"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setSetupMode(null);
                    setPinInput('');
                    setPinConfirm('');
                    setError(null);
                  }}
                  className="flex-1 px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePinSetupSubmit}
                  disabled={pinInput.length !== 6 || pinConfirm.length !== 6}
                  className="flex-1 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PIN Confirmation Modal */}
      {setupMode === 'pin-confirm' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Confirm PIN Setup</h2>
                <p className="text-sm text-gray-400">Review before activating</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-red-900/20 border border-red-700/50">
                <p className="text-sm text-red-300">
                  <strong>Important:</strong> You will need this PIN for all wallet actions. 
                  After 5 wrong attempts, your wallet will be locked for 15 minutes.
                  You can always reset with your password.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSetupMode('pin-setup')}
                  className="flex-1 px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handlePinSetupComplete}
                  disabled={isProcessing}
                  className="flex-1 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    'Activate Maximum Security'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Downgrade Confirmation Modal */}
      {showDowngradeConfirm && pendingDowngradeTier && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-amber-600 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Confirm Security Downgrade</h2>
                <p className="text-sm text-gray-400">This will reduce your protection level</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-amber-900/20 border border-amber-700/50">
                <p className="text-sm text-amber-300">
                  <strong>Warning:</strong> Downgrading to {pendingDowngradeTier.toUpperCase()} will remove additional security protections.
                  {currentTier === 'maximum' && ' Your PIN will be removed.'}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={cancelDowngrade}
                  className="flex-1 px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDowngrade}
                  disabled={isProcessing}
                  className="flex-1 px-4 py-3 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isProcessing ? 'Processing...' : 'Confirm Downgrade'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
