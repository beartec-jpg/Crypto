// client/src/components/Wallet/BalanceDisplay.tsx
// Balance display component with USD conversion and XRP reserve support

import type { Chain } from '@/lib/balanceService';

interface BalanceDisplayProps {
  chain: Chain;
  balance: string;
  balanceUsd: number;
  reserved?: string;  // For XRP
  available?: string; // For XRP
}

/**
 * Get chain symbol for display
 */
function getChainSymbol(chain: Chain): string {
  const symbols: Record<Chain, string> = {
    ethereum: 'ETH',
    bitcoin: 'BTC',
    bsc: 'BNB',
    xrp: 'XRP',
    solana: 'SOL',
  };
  return symbols[chain];
}

export default function BalanceDisplay({ 
  chain, 
  balance, 
  balanceUsd, 
  reserved, 
  available 
}: BalanceDisplayProps) {
  const symbol = getChainSymbol(chain);
  
  return (
    <div className="bg-gray-800/50 rounded-xl p-4 mb-4">
      <div className="text-sm text-gray-400 mb-1">Your Balance</div>
      
      {chain === 'xrp' && reserved && available ? (
        <>
          <div className="flex justify-between">
            <span className="text-gray-300">Total:</span>
            <span className="text-gray-300">{balance} {symbol}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Reserved:</span>
            <span className="text-gray-400">{reserved} {symbol}</span>
          </div>
          <div className="flex justify-between font-medium mt-1 pt-1 border-t border-gray-700">
            <span className="text-emerald-400">Available:</span>
            <span className="text-emerald-400">{available} {symbol}</span>
          </div>
        </>
      ) : (
        <div className="flex justify-between items-baseline">
          <span className="text-xl font-semibold">{balance} {symbol}</span>
          <span className="text-gray-400">
            ≈ ${balanceUsd.toLocaleString(undefined, { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })}
          </span>
        </div>
      )}
    </div>
  );
}
