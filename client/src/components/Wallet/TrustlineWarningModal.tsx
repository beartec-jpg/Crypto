// client/src/components/Wallet/TrustlineWarningModal.tsx
// Warning modal for XRPL trustline risks

import { useState } from 'react';
import { AlertTriangle, ExternalLink, X } from 'lucide-react';
import type { XRPReserveInfo } from '@/lib/xrpReserveService';

interface TrustlineWarningModalProps {
  token: {
    issuer: string;
    currency: string;
    name?: string;
  };
  reserveInfo: XRPReserveInfo;
  issuerFlags?: {
    requireAuth: boolean;
    globalFreeze: boolean;
    defaultRipple: boolean;
  };
  onConfirm: () => void;
  onCancel: () => void;
}

export default function TrustlineWarningModal({
  token,
  reserveInfo,
  issuerFlags,
  onConfirm,
  onCancel,
}: TrustlineWarningModalProps) {
  const [understood, setUnderstood] = useState({
    reserves: false,
    rugRisk: false,
    issuerControl: false,
    canRemove: false,
  });

  const allUnderstood = Object.values(understood).every(Boolean);
  const canAffordReserve = reserveInfo.availableBalance >= 2;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-yellow-500 flex-shrink-0" />
            <div>
              <h2 className="text-xl font-bold text-yellow-400">
                Set Trustline: {token.currency}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-gray-400">
                  Issuer: {token.issuer.slice(0, 10)}...{token.issuer.slice(-6)}
                </p>
                <a
                  href={`https://xrpscan.com/account/${token.issuer}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-white p-1"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Reserve Warning */}
          <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
            <h3 className="font-semibold text-red-400 mb-3 flex items-center gap-2">
              🔒 Reserve Requirements
            </h3>
            <div className="text-sm text-gray-300 space-y-2">
              <div className="bg-gray-900/50 rounded p-3 space-y-1">
                <div className="flex justify-between">
                  <span>Total Balance:</span>
                  <strong>{reserveInfo.totalBalance.toFixed(6)} XRP</strong>
                </div>
                <div className="flex justify-between text-yellow-400">
                  <span>Current Reserve:</span>
                  <strong>{reserveInfo.totalReserve.toFixed(6)} XRP</strong>
                </div>
                <div className="flex justify-between text-gray-400 text-xs">
                  <span>└ Base (account):</span>
                  <span>{reserveInfo.baseReserve} XRP</span>
                </div>
                <div className="flex justify-between text-gray-400 text-xs">
                  <span>└ Objects ({reserveInfo.currentObjects}):</span>
                  <span>{reserveInfo.currentObjects * reserveInfo.ownerReserve} XRP</span>
                </div>
                <div className="border-t border-gray-700 pt-2 flex justify-between text-green-400">
                  <span>Available:</span>
                  <strong>{reserveInfo.availableBalance.toFixed(6)} XRP</strong>
                </div>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3">
                <p className="text-yellow-400 font-medium mb-1">
                  Adding this trustline will lock +2 XRP
                </p>
                <div className="flex justify-between text-sm">
                  <span>New Total Reserve:</span>
                  <strong className="text-red-400">
                    {(reserveInfo.totalReserve + 2).toFixed(6)} XRP
                  </strong>
                </div>
                <div className="flex justify-between text-sm">
                  <span>New Available:</span>
                  <strong className={canAffordReserve ? 'text-green-400' : 'text-red-400'}>
                    {(reserveInfo.availableBalance - 2).toFixed(6)} XRP
                  </strong>
                </div>
              </div>

              {!canAffordReserve && (
                <div className="bg-red-500/20 border border-red-500 rounded p-3">
                  <p className="text-red-400 font-semibold">
                    ⚠️ Insufficient XRP for Reserve
                  </p>
                  <p className="text-sm mt-1">
                    You need at least 2 XRP available to add a trustline.
                  </p>
                </div>
              )}
            </div>

            <label className="flex items-start gap-3 mt-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={understood.reserves}
                onChange={(e) => setUnderstood({ ...understood, reserves: e.target.checked })}
                className="mt-1 w-4 h-4"
                disabled={!canAffordReserve}
              />
              <span className="text-sm text-gray-300 group-hover:text-white">
                I understand 2 XRP will be permanently locked as reserve until I remove this trustline
              </span>
            </label>
          </div>

          {/* Rug Pull Risk */}
          <div className="bg-orange-500/10 border border-orange-500 rounded-lg p-4">
            <h3 className="font-semibold text-orange-400 mb-2 flex items-center gap-2">
              💀 Rug Pull & Scam Risk
            </h3>
            <div className="text-sm text-gray-300 space-y-2">
              <p className="text-orange-200">
                The token issuer has FULL CONTROL over this asset:
              </p>
              <ul className="space-y-1 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-orange-400">•</span>
                  <span>Can issue <strong>unlimited tokens</strong> (instant dilution to $0)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-400">•</span>
                  <span>Can abandon the project (tokens become worthless)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-400">•</span>
                  <span>No guarantees of value, liquidity, or utility</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-400">•</span>
                  <span>Could be a <strong>scam token</strong> designed to steal your reserves</span>
                </li>
              </ul>
              <div className="bg-orange-500/20 rounded p-2 mt-2">
                <p className="text-xs text-orange-200">
                  <strong>⚠️ Warning:</strong> Only add trustlines for tokens from verified, trusted issuers.
                  Check the issuer on XRPScan before proceeding.
                </p>
              </div>
            </div>

            <label className="flex items-start gap-3 mt-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={understood.rugRisk}
                onChange={(e) => setUnderstood({ ...understood, rugRisk: e.target.checked })}
                className="mt-1 w-4 h-4"
              />
              <span className="text-sm text-gray-300 group-hover:text-white">
                I understand this token could become worthless at any time (rug pull risk)
              </span>
            </label>
          </div>

          {/* Issuer Control */}
          <div className="bg-purple-500/10 border border-purple-500 rounded-lg p-4">
            <h3 className="font-semibold text-purple-400 mb-2 flex items-center gap-2">
              👤 Issuer Account Flags
            </h3>
            <div className="text-sm text-gray-300 space-y-2">
              <p>The issuer can control your tokens with these account flags:</p>
              
              {issuerFlags && (
                <div className="bg-gray-900/50 rounded p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Global Freeze:</span>
                    <span className={issuerFlags.globalFreeze ? 'text-red-400 font-semibold' : 'text-green-400'}>
                      {issuerFlags.globalFreeze ? '⚠️ ENABLED' : '✓ Disabled'}
                    </span>
                  </div>
                  {issuerFlags.globalFreeze && (
                    <p className="text-xs text-red-300 ml-4">
                      Issuer can freeze ALL tokens globally - you won't be able to send/trade
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <span>Require Auth:</span>
                    <span className={issuerFlags.requireAuth ? 'text-yellow-400 font-semibold' : 'text-green-400'}>
                      {issuerFlags.requireAuth ? '⚠️ ENABLED' : '✓ Disabled'}
                    </span>
                  </div>
                  {issuerFlags.requireAuth && (
                    <p className="text-xs text-yellow-300 ml-4">
                      Issuer can revoke your trustline access at any time
                    </p>
                  )}
                </div>
              )}

              <ul className="space-y-1 ml-4 mt-2">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  <span><strong>GlobalFreeze:</strong> Freeze all token transfers globally</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  <span><strong>RequireAuth:</strong> Revoke your ability to hold/trade tokens</span>
                </li>
              </ul>
              <p className="text-yellow-400 text-xs mt-2">
                ⚠️ If frozen or revoked, you keep the tokens but cannot send or trade them.
              </p>
            </div>

            <label className="flex items-start gap-3 mt-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={understood.issuerControl}
                onChange={(e) => setUnderstood({ ...understood, issuerControl: e.target.checked })}
                className="mt-1 w-4 h-4"
              />
              <span className="text-sm text-gray-300 group-hover:text-white">
                I understand the issuer can freeze or revoke my ability to use these tokens
              </span>
            </label>
          </div>

          {/* Removal Info */}
          <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-4">
            <h3 className="font-semibold text-blue-400 mb-2 flex items-center gap-2">
              🔄 Removing Trustlines
            </h3>
            <div className="text-sm text-gray-300 space-y-2">
              <p>
                You can remove this trustline later to recover your 2 XRP reserve, but:
              </p>
              <ul className="space-y-1 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">•</span>
                  <span>Your token balance must be <strong>exactly 0</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">•</span>
                  <span>You must send/trade away all tokens first</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">•</span>
                  <span>If tokens are worthless, you may be stuck with the 2 XRP locked</span>
                </li>
              </ul>
            </div>

            <label className="flex items-start gap-3 mt-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={understood.canRemove}
                onChange={(e) => setUnderstood({ ...understood, canRemove: e.target.checked })}
                className="mt-1 w-4 h-4"
              />
              <span className="text-sm text-gray-300 group-hover:text-white">
                I understand I can only remove this trustline if my token balance is exactly 0
              </span>
            </label>
          </div>

          {/* Verification Checklist */}
          <div className="bg-gray-700/50 rounded-lg p-4">
            <h3 className="font-semibold mb-2 text-gray-200">✅ Before You Proceed:</h3>
            <ul className="text-sm text-gray-300 space-y-1 ml-4">
              <li className="flex items-start gap-2">
                <span>1.</span>
                <span>Verify the issuer address matches the official source</span>
              </li>
              <li className="flex items-start gap-2">
                <span>2.</span>
                <span>Check the issuer's reputation on XRPScan and XRPL.org</span>
              </li>
              <li className="flex items-start gap-2">
                <span>3.</span>
                <span>Only add trustlines for tokens you trust and understand</span>
              </li>
              <li className="flex items-start gap-2">
                <span>4.</span>
                <span>Be aware of fake/scam tokens with similar names</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 p-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!allUnderstood || !canAffordReserve}
            className="flex-1 px-6 py-3 bg-yellow-600 rounded-lg hover:bg-yellow-500 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {!canAffordReserve
              ? 'Insufficient XRP for Reserve'
              : 'I Understand - Set Trustline'}
          </button>
        </div>
      </div>
    </div>
  );
}
