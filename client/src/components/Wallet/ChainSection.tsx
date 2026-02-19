// client/src/components/Wallet/ChainSection.tsx
// Expandable chain section showing native balance + tokens

import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Eye, EyeOff, ExternalLink } from 'lucide-react';
import TokenActionModal from './TokenActionModal';
import type { Token } from '@/lib/tokenService';
import type { Chain } from '@/lib/balanceService';

interface ChainSectionProps {
  chain: Chain;
  nativeBalance: string;
  nativeUsdValue?: number;
  nativePriceChange24h?: number;
  tokens: Token[];
  isExpanded: boolean;
  hideBalances: boolean;
  onToggleExpand: () => void;
  onAddToken: () => void;
  onSelectToken: (token: Token) => void;
  onRemoveToken: (tokenId: string) => void;
}

const CHAIN_CONFIG = {
  ethereum: {
    name: 'Ethereum',
    symbol: 'ETH',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    explorer: 'https://etherscan.io',
    supportsTokens: true,
  },
  bitcoin: {
    name: 'Bitcoin',
    symbol: 'BTC',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    explorer: 'https://blockstream.info',
    supportsTokens: false,
  },
  bsc: {
    name: 'BNB Smart Chain',
    symbol: 'BNB',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    explorer: 'https://bscscan.com',
    supportsTokens: true,
  },
  xrp: {
    name: 'XRP Ledger',
    symbol: 'XRP',
    color: 'text-gray-300',
    bgColor: 'bg-gray-500/10',
    borderColor: 'border-gray-500/30',
    explorer: 'https://xrpscan.com',
    supportsTokens: true,
  },
  solana: {
    name: 'Solana',
    symbol: 'SOL',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    explorer: 'https://solscan.io',
    supportsTokens: true,
  },
};

export default function ChainSection({
  chain,
  nativeBalance,
  nativeUsdValue,
  nativePriceChange24h,
  tokens,
  isExpanded,
  hideBalances,
  onToggleExpand,
  onAddToken,
  onSelectToken,
  onRemoveToken,
}: ChainSectionProps) {
  const config = CHAIN_CONFIG[chain];
  const [hoveredToken, setHoveredToken] = useState<string | null>(null);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [selectedModalToken, setSelectedModalToken] = useState<Token | null>(null);

  // Calculate total value (native + all tokens)
  const totalUsdValue = (nativeUsdValue || 0) + tokens.reduce((sum, t) => sum + (t.usdValue || 0), 0);

  // Format balance display
  const formatBalance = (balance: string, decimals: number = 6) => {
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.000001) return '< 0.000001';
    return num.toFixed(decimals);
  };

  // Format USD value
  const formatUsd = (value: number) => {
    if (value === 0) return '$0.00';
    if (value < 0.01) return '< $0.01';
    return `$${value.toFixed(2)}`;
  };

  const handleTokenClick = (token: Token) => {
    setSelectedModalToken(token);
    setShowTokenModal(true);
  };

  const handleSendToken = (token: Token) => {
    onSelectToken(token);
  };

  const handleSwapToken = (token: Token) => {
    // TODO: Implement swap functionality
    console.log('Swap token:', token);
  };

  return (
    <div className={`rounded-lg border ${config.borderColor} ${config.bgColor} overflow-hidden`}>
      {/* Chain Header - Native Balance */}
      <div
        className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Expand/Collapse Icon */}
            {config.supportsTokens && tokens.length > 0 && (
              <div className="text-gray-400">
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </div>
            )}

            {/* Chain Name & Symbol */}
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-semibold ${config.color}`}>
                  {config.name}
                </h3>
                {tokens.length > 0 && (
                  <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">
                    +{tokens.length} token{tokens.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">{config.symbol}</p>
            </div>
          </div>

          {/* Native Balance */}
          <div className="text-right">
            <div className="flex items-center gap-2 justify-end">
              <p className="font-mono font-semibold">
                {hideBalances ? '••••••' : formatBalance(nativeBalance)}
              </p>
              <span className="text-gray-400 text-sm">{config.symbol}</span>
            </div>
            {nativeUsdValue !== undefined && (
              <div className="flex items-center gap-2 justify-end">
                <p className="text-sm text-gray-400">
                  {hideBalances ? '••••' : formatUsd(nativeUsdValue)}
                </p>
                {typeof nativePriceChange24h === 'number' && (
                  <span
                    className={`text-xs ${
                      nativePriceChange24h >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {nativePriceChange24h >= 0 ? '+' : ''}
                    {nativePriceChange24h.toFixed(2)}%
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Total Portfolio Value for this chain */}
        {totalUsdValue > 0 && tokens.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-700">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Total Value:</span>
              <span className="font-semibold text-gray-200">
                {hideBalances ? '••••••' : formatUsd(totalUsdValue)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Token List - Expanded */}
      {isExpanded && config.supportsTokens && (
        <div className="border-t border-gray-700 bg-gray-900/30">
          {/* Token Items */}
          {tokens.length > 0 && (
            <div className="divide-y divide-gray-700/50">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="p-3 hover:bg-white/5 transition-colors cursor-pointer relative"
                  onClick={() => handleTokenClick(token)}
                  onMouseEnter={() => setHoveredToken(token.id)}
                  onMouseLeave={() => setHoveredToken(null)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Token Icon/Logo */}
                      {token.logoUrl ? (
                        <img
                          src={token.logoUrl}
                          alt={token.symbol}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                          <span className="text-xs font-semibold text-gray-400">
                            {token.symbol.slice(0, 3).toUpperCase()}
                          </span>
                        </div>
                      )}

                      {/* Token Name & Standard */}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-200">{token.symbol}</p>
                          <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">
                            {token.standard}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate max-w-[200px]">
                          {token.name}
                        </p>
                        {/* Contract/Issuer Info */}
                        {token.contractAddress && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <p className="text-xs text-gray-600 font-mono">
                              {token.contractAddress.slice(0, 6)}...
                              {token.contractAddress.slice(-4)}
                            </p>
                            <a
                              href={`${config.explorer}/token/${token.contractAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-gray-600 hover:text-blue-400"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                        {token.issuer && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <p className="text-xs text-gray-600 font-mono">
                              Issuer: {token.issuer.slice(0, 6)}...{token.issuer.slice(-4)}
                            </p>
                            <a
                              href={`${config.explorer}/account/${token.issuer}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-gray-600 hover:text-blue-400"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Token Balance */}
                    <div className="text-right">
                      <p className="font-mono text-sm">
                        {hideBalances ? '••••••' : formatBalance(token.balance)}
                      </p>
                      {token.usdValue !== undefined && (
                        <div className="flex items-center gap-2 justify-end">
                          <p className="text-xs text-gray-400">
                            {hideBalances ? '••••' : formatUsd(token.usdValue)}
                          </p>
                          {typeof token.priceChange24h === 'number' && (
                            <span
                              className={`text-xs ${
                                token.priceChange24h >= 0 ? 'text-green-400' : 'text-red-400'
                              }`}
                            >
                              {token.priceChange24h >= 0 ? '+' : ''}
                              {token.priceChange24h.toFixed(2)}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Remove Button (on hover) */}
                    {hoveredToken === token.id && !token.isNative && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Remove ${token.symbol} from your token list?`)) {
                            onRemoveToken(token.id);
                          }
                        }}
                        className="absolute right-2 top-2 p-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-400 text-xs"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* XRPL Trustline Info */}
                  {token.standard === 'XRPL' && token.trustlineLimit && (
                    <div className="mt-2 pt-2 border-t border-gray-700/50">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Trustline Limit:</span>
                        <span className="font-mono">{token.trustlineLimit}</span>
                      </div>
                      {token.issuerFlags && (
                        <div className="flex gap-2 mt-1">
                          {token.issuerFlags.globalFreeze && (
                            <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
                              ⚠️ Global Freeze
                            </span>
                          )}
                          {token.issuerFlags.requireAuth && (
                            <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded">
                              ⚠️ Require Auth
                            </span>
                          )}
                          {token.issuerFlags.defaultRipple && (
                            <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                              ℹ️ Rippling Enabled
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add Token Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToken();
            }}
            className="w-full p-3 flex items-center justify-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">Add Token</span>
          </button>
        </div>
      )}

      {/* Token Action Modal */}
      {showTokenModal && selectedModalToken && (
        <TokenActionModal
          isOpen={showTokenModal}
          onClose={() => {
            setShowTokenModal(false);
            setSelectedModalToken(null);
          }}
          token={selectedModalToken}
          onSend={handleSendToken}
          onSwap={handleSwapToken}
        />
      )}
    </div>
  );
}
