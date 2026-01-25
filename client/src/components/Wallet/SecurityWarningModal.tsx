import { useState } from 'react';
import { Shield, AlertTriangle, XCircle, CheckCircle, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { SecurityScanResult, SecurityWarning } from '@/lib/securityScanner';
import { getSecurityLevel } from '@/lib/securityScanner';

interface SecurityWarningModalProps {
  result: SecurityScanResult;
  onProceed: () => void;
  onCancel: () => void;
  action: string; // e.g., "export your recovery phrase" or "sign this transaction"
  allowProceedWithWarnings?: boolean;
}

export default function SecurityWarningModal({
  result,
  onProceed,
  onCancel,
  action,
  allowProceedWithWarnings = true,
}: SecurityWarningModalProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  
  const securityLevel = getSecurityLevel(result);
  const hasBlockers = result.blockers.length > 0;
  const hasWarnings = result.warnings.length > 0;

  const getSeverityColor = (severity: SecurityWarning['severity']) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-900/30 border-red-700/50';
      case 'high': return 'text-orange-400 bg-orange-900/30 border-orange-700/50';
      case 'medium': return 'text-yellow-400 bg-yellow-900/30 border-yellow-700/50';
      case 'low': return 'text-blue-400 bg-blue-900/30 border-blue-700/50';
    }
  };

  const getSeverityIcon = (severity: SecurityWarning['severity']) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return <XCircle className="w-5 h-5" />;
      case 'medium':
        return <AlertTriangle className="w-5 h-5" />;
      case 'low':
        return <Shield className="w-5 h-5" />;
    }
  };

  const formatWarningType = (type: string): string => {
    // Convert security check type to user-friendly display name
    const typeMap: Record<string, string> = {
      'devtools': 'DevTools Detection',
      'console_tampering': 'Console Tampering',
      'prototype_pollution': 'Prototype Pollution',
      'event_hijacking': 'Event Hijacking',
      'script_injection': 'Script Injection',
      'mutation_observer': 'Mutation Observer',
      'crypto_tampering': 'Crypto Tampering',
    };
    return typeMap[type] || type.replace(/_/g, ' ');
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {hasBlockers ? (
              <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center">
                <XCircle className="w-6 h-6" />
              </div>
            ) : hasWarnings ? (
              <div className="w-12 h-12 rounded-full bg-amber-600 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center">
                <CheckCircle className="w-6 h-6" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-semibold">
                {hasBlockers ? 'Security Issue Detected' : 
                 hasWarnings ? 'Security Warning' : 
                 'Environment Secure'}
              </h2>
              <p className="text-sm text-gray-400">
                Security scan completed
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Summary */}
        <div className={`p-4 rounded-xl mb-6 ${
          hasBlockers ? 'bg-red-900/20 border border-red-700/50' :
          hasWarnings ? 'bg-amber-900/20 border border-amber-700/50' :
          'bg-emerald-900/20 border border-emerald-700/50'
        }`}>
          <p className={`text-sm ${
            hasBlockers ? 'text-red-300' :
            hasWarnings ? 'text-amber-300' :
            'text-emerald-300'
          }`}>
            {hasBlockers ? (
              <>
                <strong>Cannot proceed.</strong> Critical security issues were detected that could 
                compromise your wallet. Please close any developer tools and suspicious browser 
                extensions before continuing.
              </>
            ) : hasWarnings ? (
              <>
                <strong>Proceed with caution.</strong> Some potential security concerns were detected. 
                Review the warnings below before you {action}.
              </>
            ) : (
              <>
                <strong>Environment appears secure.</strong> No security threats were detected. 
                You may safely {action}.
              </>
            )}
          </p>
        </div>

        {/* Issues List */}
        {(hasBlockers || hasWarnings) && (
          <div className="space-y-3 mb-6">
            {/* Blockers */}
            {result.blockers.map((warning, index) => (
              <div key={`blocker-${index}`} className={`p-3 rounded-lg border ${getSeverityColor(warning.severity)}`}>
                <div className="flex items-start gap-3">
                  {getSeverityIcon(warning.severity)}
                  <div className="flex-1">
                    <p className="font-medium">{warning.message}</p>
                    {warning.details && (
                      <p className="text-sm opacity-80 mt-1">{warning.details}</p>
                    )}
                    <span className="text-xs uppercase mt-2 inline-block opacity-60">
                      {warning.severity} severity • {formatWarningType(warning.type)}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {/* Warnings */}
            {result.warnings.map((warning, index) => (
              <div key={`warning-${index}`} className={`p-3 rounded-lg border ${getSeverityColor(warning.severity)}`}>
                <div className="flex items-start gap-3">
                  {getSeverityIcon(warning.severity)}
                  <div className="flex-1">
                    <p className="font-medium">{warning.message}</p>
                    {warning.details && (
                      <p className="text-sm opacity-80 mt-1">{warning.details}</p>
                    )}
                    <span className="text-xs uppercase mt-2 inline-block opacity-60">
                      {warning.severity} severity • {formatWarningType(warning.type)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recommendations */}
        {(hasBlockers || hasWarnings) && (
          <div className="mb-6">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300"
            >
              {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Security Recommendations
            </button>
            
            {showDetails && (
              <div className="mt-3 p-4 rounded-lg bg-gray-900/50 text-sm text-gray-400 space-y-2">
                <p>• Close all browser developer tools (F12)</p>
                <p>• Use an incognito/private window for sensitive operations</p>
                <p>• Disable or remove untrusted browser extensions</p>
                <p>• Ensure you're on the official website (check URL carefully)</p>
                <p>• Use a dedicated browser profile for cryptocurrency</p>
                <p>• Keep your browser and operating system updated</p>
              </div>
            )}
          </div>
        )}

        {/* Acknowledgment for warnings (not blockers) */}
        {hasWarnings && !hasBlockers && allowProceedWithWarnings && (
          <label className="flex items-start gap-3 mb-6 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-700 text-emerald-500 focus:ring-emerald-500"
            />
            <span className="text-sm text-gray-400">
              I understand the risks and want to proceed anyway. I confirm this device is secure 
              and I'm not being watched or recorded.
            </span>
          </label>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          
          {!hasBlockers && (
            <button
              onClick={onProceed}
              disabled={hasWarnings && !acknowledged}
              className={`flex-1 px-4 py-3 rounded-lg transition-colors ${
                hasWarnings 
                  ? 'bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              {hasWarnings ? 'Proceed Anyway' : 'Continue'}
            </button>
          )}
        </div>

        {/* Scan timestamp */}
        <p className="text-xs text-gray-500 text-center mt-4">
          Scan completed at {new Date(result.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
