/**
 * VaultTab — Quantum-safe cold storage for QBTC.
 *
 * Uses a separate QBTC address (pathIndex 1) with forced PQC hybrid
 * signatures (ECDSA + ML-DSA-44) on all sends.  Completely isolated
 * from the hot-wallet spending flow.
 */

import { useState, useEffect, useCallback } from 'react';
import { Lock, Copy, CheckCircle, Send, QrCode, AlertTriangle, Loader2, Shield, ArrowDownToLine, ShieldCheck } from 'lucide-react';
import { QBTCChain } from '@/lib/qbtcService';
import { getQBTCRpcSettings } from '@/lib/qbtcService';
import { getSecuritySettings, getSecurityRequirements, type SecurityTier } from '@/lib/securityService';
import QRCode from 'qrcode';

interface VaultTabProps {
  userId: string;
  sovereignWallet: any;
}

export default function VaultTab({ userId, sovereignWallet }: VaultTabProps) {
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'overview' | 'receive' | 'send'>('overview');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendAddress, setSendAddress] = useState('');
  const [sendError, setSendError] = useState('');
  const [isSending, setIsSending] = useState(false);

  const settings = getQBTCRpcSettings();
  const vaultAddress = settings.network === 'mainnet'
    ? sovereignWallet?.addresses?.qbtcVaultMainnet
    : sovereignWallet?.addresses?.qbtcVault;

  // Enforce wallet security settings
  const securitySettings = getSecuritySettings(userId);
  const securityTier: SecurityTier = securitySettings.tier;
  const sendRequirements = getSecurityRequirements(userId, 'send');
  const isColdMode = securityTier === 'cold';

  const tierColors: Record<SecurityTier, string> = {
    standard: 'text-gray-400 bg-gray-500/15 border-gray-500/40',
    enhanced: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/40',
    maximum: 'text-orange-400 bg-orange-500/15 border-orange-500/40',
    cold: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/40',
  };

  const fetchBalance = useCallback(async () => {
    if (!vaultAddress) return;
    setIsLoadingBalance(true);
    try {
      const qbtc = new QBTCChain();
      const bal = await qbtc.getBalance(vaultAddress);
      setBalance(bal);
    } catch {
      setBalance('0.00000000');
    } finally {
      setIsLoadingBalance(false);
    }
  }, [vaultAddress]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    if (mode === 'receive' && vaultAddress) {
      QRCode.toDataURL(vaultAddress, {
        width: 256,
        margin: 2,
        color: { dark: '#06b6d4', light: '#111827' },
      }).then(setQrDataUrl).catch(() => {});
    }
  }, [mode, vaultAddress]);

  const handleCopy = async () => {
    if (!vaultAddress) return;
    try {
      await navigator.clipboard.writeText(vaultAddress);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = vaultAddress;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async () => {
    setSendError('');
    if (!sendAddress || !sendAmount) {
      setSendError('Enter both address and amount');
      return;
    }
    const amt = Number(sendAmount);
    if (isNaN(amt) || amt <= 0) {
      setSendError('Invalid amount');
      return;
    }
    if (balance && amt > Number(balance)) {
      setSendError('Insufficient vault balance');
      return;
    }

    // Enforce security tier requirements
    const requirements = getSecurityRequirements(userId, 'send');
    const reqLabels: string[] = requirements.map(r => r === 'pin' ? 'PIN' : r === 'password' ? 'Password' : 'Passkey');
    const isCold = getSecuritySettings(userId).tier === 'cold';

    if (isCold) {
      setSendError(`Vault sends require cold signer QR workflow (Security: Cold). Authentication needed: ${reqLabels.join(' + ')}. Use the Send tab with Cold Device Mode to sign this transaction.`);
    } else if (requirements.length > 0) {
      setSendError(`Vault sends require ${reqLabels.join(' + ')} authentication (Security: ${getSecuritySettings(userId).tier}). Use the Send tab with your vault address as the source.`);
    } else {
      setSendError('Vault sends require the cold signer workflow with PQC hybrid signatures. Use the Send tab to sign this transaction.');
    }
  };

  if (!vaultAddress) {
    return (
      <div className="text-center py-12">
        <Lock className="w-12 h-12 mx-auto text-gray-500 mb-4" />
        <p className="text-gray-400">Quantum Vault address not found. Try locking and unlocking your wallet to generate it.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-cyan-900/40 to-gray-800 rounded-2xl p-6 border border-cyan-700/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-cyan-500/20 rounded-full flex items-center justify-center">
            <Lock className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Quantum Vault</h2>
            <p className="text-cyan-400/70 text-sm">PQC-Protected Cold Storage</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1 ${tierColors[securityTier]}`}>
              <ShieldCheck className="w-3 h-3" /> {securityTier.charAt(0).toUpperCase() + securityTier.slice(1)}
            </span>
            <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 text-xs font-semibold rounded-full border border-cyan-500/30 flex items-center gap-1">
              <Shield className="w-3 h-3" /> ML-DSA-44
            </span>
          </div>
        </div>

        {/* Balance */}
        <div className="mb-4">
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Vault Balance</p>
          {isLoadingBalance ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
              <span className="text-gray-400">Loading...</span>
            </div>
          ) : (
            <p className="text-3xl font-bold text-white">
              {Number(balance || 0).toFixed(8)} <span className="text-cyan-400 text-lg">QBTC</span>
            </p>
          )}
        </div>

        {/* Vault Address */}
        <div className="bg-gray-900/60 rounded-lg p-3 flex items-center gap-2">
          <p className="text-xs text-gray-400 font-mono truncate flex-1">{vaultAddress}</p>
          <button
            onClick={handleCopy}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors flex-shrink-0"
            title="Copy address"
          >
            {copied ? (
              <CheckCircle className="w-4 h-4 text-cyan-400" />
            ) : (
              <Copy className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setMode(mode === 'receive' ? 'overview' : 'receive')}
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-colors ${
            mode === 'receive'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
          }`}
        >
          <ArrowDownToLine className="w-5 h-5" />
          Receive
        </button>
        <button
          onClick={() => setMode(mode === 'send' ? 'overview' : 'send')}
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-colors ${
            mode === 'send'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
          }`}
        >
          <Send className="w-5 h-5" />
          Send
        </button>
      </div>

      {/* Receive Panel */}
      {mode === 'receive' && (
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-cyan-400" />
            Receive to Quantum Vault
          </h3>
          <p className="text-gray-400 text-sm mb-4">
            Send QBTC to this address to store in your quantum-safe vault. All withdrawals require PQC hybrid signatures.
          </p>
          {qrDataUrl && (
            <div className="flex justify-center mb-4">
              <img src={qrDataUrl} alt="Vault QR" className="rounded-lg" width={256} height={256} />
            </div>
          )}
          <div className="bg-gray-900 rounded-lg p-3 mb-4">
            <p className="text-sm text-cyan-400 font-mono break-all select-all text-center">{vaultAddress}</p>
          </div>
          <button
            onClick={handleCopy}
            className="w-full px-4 py-3 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {copied ? <><CheckCircle className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Vault Address</>}
          </button>
        </div>
      )}

      {/* Send Panel */}
      {mode === 'send' && (
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Send className="w-5 h-5 text-cyan-400" />
            Send from Quantum Vault
          </h3>

          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 mb-4 flex items-start gap-2">
            <Shield className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="text-cyan-400 text-sm">
              <p>
                All vault sends require <strong>PQC hybrid signatures</strong> (ECDSA + ML-DSA-44). 
                This protects your funds against quantum computing attacks.
              </p>
              <p className="mt-1 text-cyan-400/80">
                Security level: <strong className="capitalize">{securityTier}</strong>
                {sendRequirements.length > 0 && (
                  <> — requires {sendRequirements.map(r => r === 'pin' ? 'PIN' : r === 'password' ? 'Password' : 'Passkey').join(' + ')}</>
                )}
                {isColdMode && <> + Cold Signer QR</>}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Recipient Address</label>
              <input
                type="text"
                value={sendAddress}
                onChange={(e) => setSendAddress(e.target.value.trim())}
                placeholder="qbtct1..."
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Amount (QBTC)</label>
              <div className="relative">
                <input
                  type="number"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  placeholder="0.00000000"
                  step="0.00000001"
                  min="0"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm font-mono focus:border-cyan-500 focus:outline-none"
                />
                {balance && Number(balance) > 0 && (
                  <button
                    onClick={() => setSendAmount(balance || '0')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
                  >
                    MAX
                  </button>
                )}
              </div>
            </div>

            {sendError && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-amber-400 text-sm">{sendError}</p>
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={isSending || !sendAddress || !sendAmount}
              className="w-full px-4 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {isSending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Signing...</>
              ) : (
                <><Lock className="w-4 h-4" /> Send with PQC Signature</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Security Info */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
        <h4 className="text-sm font-semibold text-gray-300 mb-2">How Quantum Vault works</h4>
        <ul className="text-xs text-gray-500 space-y-1.5">
          <li className="flex items-start gap-2">
            <Shield className="w-3 h-3 text-cyan-500 mt-0.5 flex-shrink-0" />
            <span>Vault uses a <strong className="text-gray-400">separate QBTC address</strong> with PQC hybrid key derivation (pathIndex 1)</span>
          </li>
          <li className="flex items-start gap-2">
            <Lock className="w-3 h-3 text-cyan-500 mt-0.5 flex-shrink-0" />
            <span>All sends require <strong className="text-gray-400">ECDSA + ML-DSA-44 (Dilithium)</strong> dual signatures — quantum resistant</span>
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="w-3 h-3 text-cyan-500 mt-0.5 flex-shrink-0" />
            <span>Vault is <strong className="text-gray-400">completely isolated</strong> from normal hot wallet operations — different key, different address</span>
          </li>
          <li className="flex items-start gap-2">
            <Send className="w-3 h-3 text-cyan-500 mt-0.5 flex-shrink-0" />
            <span>Hot wallet keeps using fast <strong className="text-gray-400">ECDSA-only</strong> transactions for daily spending</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
