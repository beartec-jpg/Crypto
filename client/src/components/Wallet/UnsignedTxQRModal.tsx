/**
 * UnsignedTxQRModal - Displays an unsigned transaction as a QR code
 * for the cold signer device to scan.
 */

import { useEffect, useState } from 'react';
import { X, QrCode, Copy, CheckCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface UnsignedTxQRModalProps {
  payload: string; // JSON-stringified ColdUnsignedTx
  chain: string;
  to: string;
  amount: string;
  fee: string;
  onScanSigned: () => void; // Switch to scanner modal
  onCancel: () => void;
}

export default function UnsignedTxQRModal({
  payload,
  chain,
  to,
  amount,
  fee,
  onScanSigned,
  onCancel,
}: UnsignedTxQRModalProps) {
  const [copied, setCopied] = useState(false);
  const [isLargePayload, setIsLargePayload] = useState(false);

  useEffect(() => {
    if (payload.length > 2500) {
      setIsLargePayload(true);
    }
  }, [payload]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <QrCode className="w-6 h-6 text-emerald-500" />
              <h2 className="text-xl font-bold">Unsigned Transaction</h2>
            </div>
            <button
              onClick={onCancel}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Transaction Summary */}
          <div className="bg-gray-900 rounded-lg p-4 mb-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Chain</span>
              <span className="font-medium uppercase">{chain}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">To</span>
              <span className="font-mono text-xs truncate max-w-[200px]">{to}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Amount</span>
              <span className="font-medium">{amount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Fee</span>
              <span>{fee}</span>
            </div>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center gap-3 bg-white rounded-lg p-6 mb-4">
            <QRCodeSVG
              value={payload}
              size={260}
              bgColor="#ffffff"
              fgColor="#000000"
              level="L"
            />
            <p className="text-gray-600 text-xs text-center">
              Scan with your cold signer device
            </p>
          </div>

          {isLargePayload && (
            <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-3 mb-4">
              <p className="text-yellow-500 text-xs">
                Large payload ({payload.length} bytes). If QR scan fails, use the copy button below.
              </p>
            </div>
          )}

          {/* Copy raw payload */}
          <button
            onClick={handleCopy}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm mb-4"
          >
            {copied ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy Raw Payload
              </>
            )}
          </button>

          {/* Instructions */}
          <div className="bg-gray-900 rounded-lg p-4 mb-4">
            <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
              <li>Scan this QR with your cold signer</li>
              <li>Review and approve the transaction</li>
              <li>Enter your cold signer password</li>
              <li>Come back and tap "Scan Signed TX"</li>
            </ol>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onScanSigned}
              className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-semibold transition-colors"
            >
              Scan Signed TX
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
