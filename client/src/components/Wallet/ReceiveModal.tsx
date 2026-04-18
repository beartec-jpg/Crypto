// client/src/components/Wallet/ReceiveModal.tsx
// Full-page receive view with QR code and dropdown chain selector

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, X, ChevronDown, AlertTriangle, Download, Share2 } from 'lucide-react';
import type { Chain } from '@/lib/balanceService';
import { getChainNetworkAddress, type WalletAddresses } from '@/lib/networkAddress';

interface ReceiveModalProps {
  addresses: WalletAddresses;
  publicKeys?: {
    ethereum: string;
    bitcoin: string;
    bsc: string;
    xrp: string;
    solana: string;
    qbtc: string;
  };
  selectedChain: Chain;
  onSelectChain: (chain: Chain) => void;
  onClose: () => void;
  tokenNetwork?: 'mainnet' | 'testnet';
  inline?: boolean;
}

const CHAIN_CONFIG: Record<Chain, { name: string; symbol: string; color: string; warning: string }> = {
  ethereum: { 
    name: 'Ethereum', 
    symbol: 'ETH', 
    color: 'bg-blue-400',
    warning: 'Only send ETH or ERC-20 tokens to this address.'
  },
  bitcoin: { 
    name: 'Bitcoin', 
    symbol: 'BTC', 
    color: 'bg-orange-400',
    warning: 'Only send BTC to this address. Sending other coins may result in permanent loss.'
  },
  bsc: { 
    name: 'BNB Smart Chain', 
    symbol: 'BNB', 
    color: 'bg-yellow-400',
    warning: 'Only send BNB or BEP-20 tokens to this address.'
  },
  xrp: { 
    name: 'XRP Ledger', 
    symbol: 'XRP', 
    color: 'bg-gray-300',
    warning: 'Only send XRP or XRPL tokens to this address.'
  },
  solana: { 
    name: 'Solana', 
    symbol: 'SOL', 
    color: 'bg-purple-400',
    warning: 'Only send SOL or SPL tokens to this address.'
  },
  qbtc: {
    name: 'QuantumBTC',
    symbol: 'QBTC',
    color: 'bg-cyan-400',
    warning: 'Only send QBTC to this address. This chain uses hybrid PQC signatures.'
  },
};

const CHAINS: Chain[] = ['ethereum', 'bitcoin', 'bsc', 'xrp', 'solana', 'qbtc'];

export default function ReceiveModal({
  addresses,
  publicKeys,
  selectedChain,
  onSelectChain,
  onClose,
  tokenNetwork = 'testnet',
  inline = false,
}: ReceiveModalProps) {
  const [copied, setCopied] = useState(false);
  const [copiedQbtcPubKey, setCopiedQbtcPubKey] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const config = CHAIN_CONFIG[selectedChain];
  const address = getChainNetworkAddress(addresses, selectedChain, tokenNetwork);
  const qbtcPublicKey = selectedChain === 'qbtc' ? publicKeys?.qbtc || '' : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleShare = async () => {
    if (!navigator.share) return;
    
    try {
      await navigator.share({
        title: `My ${config.name} Address`,
        text: address,
      });
    } catch (error) {
      // User cancelled
    }
  };

  const handleCopyQbtcPublicKey = async () => {
    if (!qbtcPublicKey) return;

    try {
      await navigator.clipboard.writeText(qbtcPublicKey);
      setCopiedQbtcPubKey(true);
      setTimeout(() => setCopiedQbtcPubKey(false), 2000);
    } catch (error) {
      console.error('Failed to copy QBTC public key:', error);
    }
  };

  const handleDownloadQR = () => {
    const svg = document.getElementById('receive-qr');
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
      downloadLink.download = `${selectedChain}-wallet-qr.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  const handleSelectChain = (chain: Chain) => {
    onSelectChain(chain);
    setIsDropdownOpen(false);
  };

  const wrapperClassName = inline
    ? 'bg-gray-800 rounded-2xl p-6'
    : 'fixed inset-0 bg-gray-900 z-50 overflow-y-auto';

  const headerClassName = inline
    ? 'mb-6 flex items-center justify-between'
    : 'sticky top-0 bg-gray-900 border-b border-gray-800 px-4 py-4 flex items-center justify-between';

  const contentClassName = inline
    ? 'space-y-6'
    : 'max-w-md mx-auto px-4 py-6 space-y-6';

  return (
    <div className={wrapperClassName}>
      {/* Header */}
      <div className={headerClassName}>
        <h1 className="text-xl font-bold">Receive Crypto</h1>
        {!inline && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        )}
      </div>

      <div className={contentClassName}>
        {/* Chain Selector Dropdown */}
        <div className="relative">
          <label className="text-sm text-gray-400 mb-2 block">Select Network</label>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl hover:border-gray-600 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${config.color}`} />
              <span className="font-medium">{config.name}</span>
              <span className="text-gray-400">({config.symbol})</span>
            </div>
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl z-10">
              {CHAINS.map((chain) => {
                const chainConfig = CHAIN_CONFIG[chain];
                const isSelected = chain === selectedChain;
                
                return (
                  <button
                    key={chain}
                    onClick={() => handleSelectChain(chain)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 transition-colors ${
                      isSelected ? 'bg-gray-700' : ''
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full ${chainConfig.color}`} />
                    <span className={`font-medium ${isSelected ? 'text-emerald-400' : ''}`}>
                      {chainConfig.name}
                    </span>
                    <span className="text-gray-400">({chainConfig.symbol})</span>
                    {isSelected && (
                      <Check className="w-4 h-4 text-emerald-400 ml-auto" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* QR Code */}
        <div className="bg-white p-6 rounded-2xl flex items-center justify-center">
          <QRCodeSVG
            id="receive-qr"
            value={address}
            size={240}
            level="H"
            includeMargin
            bgColor="#ffffff"
            fgColor="#000000"
          />
        </div>

        {/* Address Display */}
        <div>
          <label className="text-sm text-gray-400 mb-2 block">
            Your {config.name} Address
          </label>
          <div className="flex items-stretch gap-2">
            <div className="flex-1 bg-gray-800 rounded-xl p-4 font-mono text-sm break-all border border-gray-700">
              {address}
            </div>
            <button
              onClick={handleCopy}
              className={`px-4 rounded-xl transition-colors flex items-center justify-center ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
              title="Copy address"
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {selectedChain === 'qbtc' && qbtcPublicKey && (
          <div>
            <label className="text-sm text-gray-400 mb-2 block">
              QBTC Public Key Hex
            </label>
            <div className="flex items-stretch gap-2">
              <div className="flex-1 bg-gray-800 rounded-xl p-4 font-mono text-sm break-all border border-gray-700">
                {qbtcPublicKey}
              </div>
              <button
                onClick={handleCopyQbtcPublicKey}
                className={`px-4 rounded-xl transition-colors flex items-center justify-center ${
                  copiedQbtcPubKey
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
                title="Copy QBTC public key"
              >
                {copiedQbtcPubKey ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Use this compressed public key hex when creating QBTC sale offers or swap transactions.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleDownloadQR}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors"
          >
            <Download className="w-5 h-5" />
            <span>Save QR</span>
          </button>
          {'share' in navigator && (
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors"
            >
              <Share2 className="w-5 h-5" />
              <span>Share</span>
            </button>
          )}
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200">
            {config.warning} Sending other coins may result in permanent loss.
          </p>
        </div>

        {!inline && (
          <button
            onClick={onClose}
            className="w-full py-4 bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors font-medium"
          >
            Back to Wallet
          </button>
        )}
      </div>
    </div>
  );
}
