import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle, Copy } from 'lucide-react';

interface QRDisplayProps {
  data: string;
  onComplete: () => void;
}

export default function QRDisplay({ data, onComplete }: QRDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current && data) {
      QRCode.toCanvas(
        canvasRef.current,
        data,
        {
          width: 300,
          margin: 2,
          color: {
            dark: '#10b981', // emerald-500
            light: '#111827', // gray-900
          },
        },
        (error) => {
          if (error) {
            console.error('QR Code generation error:', error);
          }
        }
      );
    }
  }, [data]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 rounded-full mb-4">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Transaction Signed!</h2>
          <p className="text-gray-400">
            Scan this QR code with your hot wallet to broadcast
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex justify-center mb-4">
            <canvas ref={canvasRef} className="rounded-lg" />
          </div>

          <div className="bg-gray-900 rounded p-3 mb-4">
            <p className="text-xs text-gray-400 break-all font-mono">
              {data.substring(0, 100)}...
            </p>
          </div>

          <button
            onClick={handleCopy}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy Raw Transaction
              </>
            )}
          </button>
        </div>

        <div className="bg-emerald-500/10 border border-emerald-500 rounded-lg p-4 mb-6">
          <p className="text-emerald-500 text-sm">
            ✓ Transaction has been signed securely offline
          </p>
        </div>

        <button
          onClick={onComplete}
          className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-semibold transition-colors"
        >
          Done
        </button>

        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            Keep this device offline at all times
          </p>
        </div>
      </div>
    </div>
  );
}
