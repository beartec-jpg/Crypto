/**
 * SignedTxScannerModal - Scans a QR code from the cold signer device
 * containing the signed transaction hex, then broadcasts it.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, X, AlertCircle, Loader2, ClipboardPaste } from 'lucide-react';
import jsQR from 'jsqr';
import { broadcastTransaction } from '@/lib/sendService';
import { broadcastXrpTransaction } from '@/lib/xrpSendService';
import { QBTCChain } from '@/lib/qbtcService';
import type { Chain } from '@/lib/balanceService';

interface SignedTxScannerModalProps {
  chain: Chain;
  to: string;
  amount: string;
  token: string;
  onSuccess: (result: { hash: string; explorerUrl: string }) => void;
  onCancel: () => void;
}

export default function SignedTxScannerModal({
  chain,
  to,
  amount,
  token,
  onSuccess,
  onCancel,
}: SignedTxScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [scannedHex, setScannedHex] = useState('');
  const [mode, setMode] = useState<'scan' | 'paste'>(chain === 'qbtc' ? 'paste' : 'scan');
  const [pastedHex, setPastedHex] = useState('');

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const handleBroadcast = useCallback(async (signedTxHex: string) => {
    setIsBroadcasting(true);
    setError('');

    try {
      let result: { hash: string; explorerUrl: string };

      if (chain === 'xrp') {
        result = await broadcastXrpTransaction(signedTxHex);
      } else if (chain === 'ethereum' || chain === 'bsc') {
        result = await broadcastTransaction(chain, signedTxHex);
      } else if (chain === 'qbtc') {
        const qbtc = new QBTCChain();
        const txid = await qbtc.broadcastRawTransaction(signedTxHex);
        result = { hash: txid, explorerUrl: '' };
      } else {
        throw new Error(`Broadcasting not yet supported for chain: ${chain}`);
      }

      onSuccess(result);
    } catch (err: any) {
      setError(err.message || 'Failed to broadcast transaction');
      setIsBroadcasting(false);
    }
  }, [chain, onSuccess]);

  useEffect(() => {
    if (mode !== 'scan') return;

    let animationId: number;
    let isActive = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });

        if (!isActive) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setIsScanning(true);
          scanQRCode();
        }
      } catch (err) {
        setError('Camera access denied. Please enable camera permissions.');
      }
    }

    function scanQRCode() {
      if (!isActive) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          isActive = false;
          stopCamera();
          setScannedHex(code.data);
          handleBroadcast(code.data);
          return;
        }
      }

      animationId = requestAnimationFrame(scanQRCode);
    }

    startCamera();

    return () => {
      isActive = false;
      stopCamera();
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [mode, stopCamera, handleBroadcast]);

  const handleCancel = () => {
    stopCamera();
    onCancel();
  };

  if (isBroadcasting) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-2xl p-8 text-center max-w-sm w-full mx-4">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Broadcasting Transaction</h3>
          <p className="text-gray-400 text-sm mb-4">
            Sending {amount} {token} to {to.slice(0, 8)}...{to.slice(-6)}
          </p>
          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-3 mt-4">
              <p className="text-red-400 text-sm">{error}</p>
              <button
                onClick={() => {
                  if (scannedHex) handleBroadcast(scannedHex);
                }}
                className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-semibold transition-colors"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {mode === 'scan' ? (
                <Camera className="w-6 h-6 text-emerald-500" />
              ) : (
                <ClipboardPaste className="w-6 h-6 text-emerald-500" />
              )}
              <h2 className="text-xl font-bold">
                {mode === 'scan' ? 'Scan Signed TX' : 'Paste Signed TX'}
              </h2>
            </div>
            <button
              onClick={handleCancel}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setMode('scan'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'scan'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              <Camera className="w-4 h-4" /> Scan QR
            </button>
            <button
              onClick={() => { setMode('paste'); stopCamera(); setIsScanning(false); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'paste'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              <ClipboardPaste className="w-4 h-4" /> Paste Hex
            </button>
          </div>

          {error && !isBroadcasting ? (
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-3 mb-4 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          ) : null}

          {mode === 'scan' ? (
            <>
              <p className="text-gray-400 text-sm mb-4">
                Point camera at the signed transaction QR on your cold signer
              </p>

              <div className="relative rounded-lg overflow-hidden mb-4">
                <video
                  ref={videoRef}
                  className="w-full bg-black rounded-lg"
                  playsInline
                  muted
                  aria-label="QR code scanner"
                />
                <canvas ref={canvasRef} className="hidden" />
                {isScanning && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="border-4 border-emerald-500 rounded-lg w-56 h-56 animate-pulse" />
                  </div>
                )}
              </div>

              {isScanning && (
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-emerald-500 text-sm">Scanning...</span>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-gray-400 text-sm mb-4">
                Paste the signed transaction hex from your cold signer
              </p>

              <textarea
                value={pastedHex}
                onChange={(e) => setPastedHex(e.target.value.trim())}
                placeholder="Paste raw signed transaction hex here..."
                className="w-full h-32 bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm font-mono text-gray-300 placeholder-gray-500 focus:border-emerald-500 focus:outline-none resize-none mb-4"
              />

              <button
                onClick={() => {
                  if (!pastedHex) {
                    setError('Please paste a signed transaction hex');
                    return;
                  }
                  setScannedHex(pastedHex);
                  handleBroadcast(pastedHex);
                }}
                disabled={!pastedHex}
                className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors mb-3"
              >
                Broadcast Transaction
              </button>
            </>
          )}

          <button
            onClick={handleCancel}
            className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
