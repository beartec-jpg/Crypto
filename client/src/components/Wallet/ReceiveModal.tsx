// client/src/components/Wallet/ReceiveModal.tsx
// QR code modal for receiving crypto

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, X } from 'lucide-react';
import type { Chain } from '@/lib/balanceService';

interface ReceiveModalProps {
  addresses: {
    ethereum: string;
    bitcoin: string;
    bsc: string;
    xrp: string;
    solana: string;
  };
  selectedChain: Chain;
  onSelectChain: (chain: Chain) => void;
  onClose: () => void;
}

const CHAIN_CONFIG = {
  ethereum: { name: 'Ethereum', symbol: 'ETH', color: 'text-blue-400' },
  bitcoin: { name: 'Bitcoin', symbol: 'BTC', color: 'text-orange-400' },
  bsc: { name: 'BNB Smart Chain', symbol: 'BNB', color: 'text-yellow-400' },
  xrp: { name: 'XRP Ledger', symbol: 'XRP', color: 'text-gray-300' },
  solana: { name: 'Solana', symbol: 'SOL', color: 'text-purple-400' },
};

export default function ReceiveModal({
  addresses,
  selectedChain,
  onSelectChain,
  onClose,
}: ReceiveModalProps) {
  const [copied, setCopied] = useState(false);
  
  const config = CHAIN_CONFIG[selectedChain];
  const address = addresses[selectedChain];

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const chains: Chain[] = ['ethereum', 'bitcoin', 'bsc', 'xrp', 'solana'];

  return (
    <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Receive Crypto</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Chain Selector */}
      <div className="mb-6">
        <label className="text-sm text-gray-400 mb-2 block">Select Network</label>
        <div className="grid grid-cols-2 gap-2">
          {chains.map((chain) => {
            const chainConfig = CHAIN_CONFIG[chain];
            return (
              <button
                key={chain}
                onClick={() => onSelectChain(chain)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedChain === chain
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
                }`}
              >
                {chainConfig.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* QR Code */}
      <div className="bg-white p-4 rounded-lg mb-4">
        <QRCodeSVG
          value={address}
          size={256}
          level="H"
          className="w-full h-auto"
        />
      </div>

      {/* Address */}
      <div>
        <label className="text-sm text-gray-400 mb-2 block">
          Your {config.name} Address
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-4 py-2 bg-gray-700 rounded-lg font-mono text-sm break-all">
            {address}
          </div>
          <button
            onClick={handleCopy}
            className="p-2 bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors"
            title="Copy address"
          >
            {copied ? (
              <Check className="w-5 h-5 text-green-400" />
            ) : (
              <Copy className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Warning */}
      <div className="mt-4 bg-yellow-500/10 border border-yellow-500 rounded-lg p-3">
        <p className="text-sm text-yellow-200">
          ⚠️ Only send <strong>{config.symbol}</strong> to this address. 
          Sending other coins may result in permanent loss.
        </p>
      </div>
    </div>
  );
}
