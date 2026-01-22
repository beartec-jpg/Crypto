// client/src/components/wallet/ReceiveSection.tsx
// Display wallet address with QR code for receiving funds

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Download, Share2 } from 'lucide-react';

interface ReceiveSectionProps {
  address: `0x${string}` | undefined;
}

export default function ReceiveSection({ address }: ReceiveSectionProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!address) return;
    
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleShare = async () => {
    if (!address || !navigator.share) return;
    
    try {
      await navigator.share({
        title: 'My Wallet Address',
        text: address,
      });
    } catch (error) {
      // User cancelled or share failed
    }
  };

  const handleDownloadQR = () => {
    const svg = document.getElementById('wallet-qr');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');
      
      const downloadLink = document.createElement('a');
      downloadLink.download = 'wallet-qr.png';
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  if (!address) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>Connect your wallet to view your address</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">Receive Funds</h2>
        <p className="text-gray-400">
          Share your address or scan the QR code to receive tokens
        </p>
      </div>

      {/* QR Code */}
      <div className="bg-white p-6 rounded-2xl flex items-center justify-center">
        <QRCodeSVG
          id="wallet-qr"
          value={address}
          size={200}
          level="H"
          includeMargin
          bgColor="#ffffff"
          fgColor="#000000"
        />
      </div>

      {/* Address Display */}
      <div className="space-y-3">
        <label className="text-sm text-gray-400">Your Wallet Address</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-900 rounded-xl p-4 font-mono text-sm break-all">
            {address}
          </div>
          <button
            onClick={handleCopy}
            className={`p-4 rounded-xl transition-colors ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
            title={copied ? 'Copied!' : 'Copy address'}
          >
            {copied ? (
              <Check className="w-5 h-5" />
            ) : (
              <Copy className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleDownloadQR}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 transition-colors"
        >
          <Download className="w-5 h-5" />
          <span>Save QR</span>
        </button>
        
        {'share' in navigator && (
          <button
            onClick={handleShare}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            <Share2 className="w-5 h-5" />
            <span>Share</span>
          </button>
        )}
      </div>

      {/* Network Warning */}
      <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-700/30 text-sm">
        <p className="text-amber-400 font-medium mb-1">⚠️ Testnet Only</p>
        <p className="text-gray-400">
          This address is for Sepolia testnet. Do not send real ETH or mainnet tokens.
        </p>
      </div>
    </div>
  );
}
