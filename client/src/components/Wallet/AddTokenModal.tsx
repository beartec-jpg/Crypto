// client/src/components/Wallet/AddTokenModal.tsx
// Modal for adding custom tokens to wallet

import { useState } from 'react';
import { X, Search, AlertTriangle, CheckCircle, Loader2, ExternalLink } from 'lucide-react';
import type { Chain } from '@/lib/balanceService';
import type { Token, TokenNetwork } from '@/lib/tokenService';
import { fetchERC20TokenInfo, fetchXRPLIssuerInfo, fetchSPLTokenInfo } from '@/lib/tokenService';
import { calculateXRPReserve, type XRPReserveInfo } from '@/lib/xrpReserveService';
import TrustlineWarningModal from './TrustlineWarningModal';

interface AddTokenModalProps {
  chain: Chain;
  network?: TokenNetwork;
  walletAddress: string;
  onClose: () => void;
  onAdd: (token: Partial<Token>) => void;
  onSetTrustline?: (currency: string, issuer: string) => Promise<void>;
}

const CHAIN_LABELS = {
  ethereum: { name: 'Ethereum', standard: 'ERC-20', placeholder: '0x... (contract address)' },
  bsc: { name: 'BNB Smart Chain', standard: 'BEP-20', placeholder: '0x... (contract address)' },
  xrp: { name: 'XRP Ledger', standard: 'XRPL', placeholder: 'Currency code (e.g., USD)' },
  solana: { name: 'Solana', standard: 'SPL Token', placeholder: 'Mint address' },
  bitcoin: { name: 'Bitcoin', standard: 'N/A', placeholder: 'Bitcoin does not support tokens' },
  qbtc: { name: 'QuantumBTC', standard: 'N/A', placeholder: 'QuantumBTC does not support tokens' },
};

type AddStep = 'input' | 'verify' | 'trustline-warning' | 'adding' | 'success' | 'error';

export default function AddTokenModal({
  chain,
  network = 'mainnet',
  walletAddress,
  onClose,
  onAdd,
  onSetTrustline,
}: AddTokenModalProps) {
  const config = CHAIN_LABELS[chain];
  
  // Step management
  const [step, setStep] = useState<AddStep>('input');
  
  // Form inputs
  const [tokenAddress, setTokenAddress] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [issuerAddress, setIssuerAddress] = useState('');
  
  // Token verification
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedToken, setVerifiedToken] = useState<Partial<Token> | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // XRPL specific
  const [reserveInfo, setReserveInfo] = useState<XRPReserveInfo | null>(null);
  const [issuerFlags, setIssuerFlags] = useState<any>(null);
  const [showTrustlineWarning, setShowTrustlineWarning] = useState(false);

  // UTXO chains don't support tokens
  if (chain === 'bitcoin' || chain === 'qbtc') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 rounded-lg max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Add Token</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-4">
            <p className="text-yellow-400">
              {chain === 'bitcoin'
                ? 'Bitcoin does not support tokens. Only native BTC can be held on the Bitcoin blockchain.'
                : 'QuantumBTC does not support tokens. Only native QBTC can be held on the QuantumBTC blockchain.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full mt-4 px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

// Verify token info
const handleVerify = async () => {
  setIsVerifying(true);
  setError(null);
  setVerifiedToken(null);

  try {
    if (chain === 'ethereum' || chain === 'bsc') {
      // Validate Ethereum/BSC address
      if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
        throw new Error('Invalid contract address format');
      }

      // Fetch ERC-20/BEP-20 token info - ✅ NOW PASSES CHAIN PARAMETER
      const tokenInfo = await fetchERC20TokenInfo(tokenAddress, chain);
      
      const token: Partial<Token> = {
        id: `${chain === 'ethereum' ? 'erc20' : 'bep20'}-${tokenAddress}-${network}`,
        chain,
        network,
        standard: chain === 'ethereum' ? 'ERC-20' : 'BEP-20',
        contractAddress: tokenAddress,
        symbol: tokenInfo.symbol || 'UNKNOWN',
        name: tokenInfo.name || 'Unknown Token',
        decimals: tokenInfo.decimals || 18,
        balance: '0',
        isVisible: true,
        isNative: false,
      };

      setVerifiedToken(token);
      setStep('verify');
    } else if (chain === 'xrp') {
      // Validate XRPL inputs
      const isValidCurrencyCode = (code: string): boolean => {
        if (!code) return false;
        // Standard 3-character code (ASCII, alphanumeric)
        if (code.length === 3 && /^[A-Za-z0-9]{3}$/.test(code)) return true;
        // 40-character hex code for non-standard currencies
        if (code.length === 40 && /^[0-9A-Fa-f]{40}$/.test(code)) return true;
        return false;
      };

      if (!isValidCurrencyCode(currencyCode)) {
        throw new Error('Currency code must be 3 characters (e.g., USD) or 40-character hex for non-standard tokens');
      }
      if (!/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(issuerAddress)) {
        throw new Error('Invalid XRP issuer address format');
      }

      // Fetch issuer info
      const issuerInfo = await fetchXRPLIssuerInfo(issuerAddress);
      if (!issuerInfo.exists) {
        throw new Error('Issuer address does not exist on XRPL');
      }

      if (!walletAddress || !/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(walletAddress)) {
        throw new Error('Your XRP wallet address is not available. Please recreate or import your wallet.');
      }

      // Calculate reserve requirements
      const reserve = await calculateXRPReserve(walletAddress);
      
      const token: Partial<Token> = {
        id: `xrpl-${currencyCode.toUpperCase()}-${issuerAddress}-${network}`,
        chain: 'xrp',
        network,
        standard: 'XRPL',
        currencyCode: currencyCode.toUpperCase(),
        issuer: issuerAddress,
        symbol: currencyCode.toUpperCase(),
        name: `${currencyCode.toUpperCase()} (${issuerAddress.slice(0, 8)}...)`,
        decimals: 6,
        balance: '0',
        isVisible: true,
        isNative: false,
        issuerFlags: issuerInfo.flags,
      };

      setVerifiedToken(token);
      setReserveInfo(reserve);
      setIssuerFlags(issuerInfo.flags);
      
      // Show trustline warning before adding
      setShowTrustlineWarning(true);
    } else if (chain === 'solana') {
      // Validate Solana mint address
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenAddress)) {
        throw new Error('Invalid Solana mint address format');
      }

      // ✅ NOW FETCHES REAL SPL TOKEN METADATA
      const tokenInfo = await fetchSPLTokenInfo(tokenAddress);
      
      const token: Partial<Token> = {
        id: `spl-${tokenAddress}-${network}`,
        chain: 'solana',
        network,
        standard: 'SPL',
        mintAddress: tokenAddress,
        symbol: tokenInfo.symbol || tokenAddress.slice(0, 8),
        name: tokenInfo.name || `Token ${tokenAddress.slice(0, 8)}...`,
        decimals: tokenInfo.decimals || 9,
        balance: '0',
        isVisible: true,
        isNative: false,
      };

      setVerifiedToken(token);
      setStep('verify');
    }
  } catch (err: any) {
    setError(err.message || 'Failed to verify token');
    setStep('error');
  } finally {
    setIsVerifying(false);
  }
};

  // Add token to wallet
  const handleAdd = async () => {
    if (!verifiedToken) return;

    setStep('adding');
    try {
      await onAdd(verifiedToken);
      setStep('success');
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to add token');
      setStep('error');
    }
  };

  // Handle XRPL trustline confirmation
  const handleTrustlineConfirm = async () => {
    if (!verifiedToken || !onSetTrustline) return;

    setShowTrustlineWarning(false);
    setStep('adding');

    try {
      // Import getXRPLTrustlines
      const { getXRPLTrustlines } = await import('@/lib/xrpReserveService');
      
      // Check if trustline already exists
      const existingTrustlines = await getXRPLTrustlines(walletAddress);
      const alreadyExists = existingTrustlines.some(
        tl => tl.currency.toUpperCase() === verifiedToken.currencyCode!.toUpperCase() && 
              tl.issuer === verifiedToken.issuer
      );
      
      if (alreadyExists) {
        // Just add to local wallet without submitting transaction
        await onAdd(verifiedToken);
        setStep('success');
        setTimeout(() => onClose(), 2000);
        return;
      }
      
      // Set trustline first
      await onSetTrustline(verifiedToken.currencyCode!, verifiedToken.issuer!);
      
      // Then add token to wallet
      await onAdd(verifiedToken);
      
      setStep('success');
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to set trustline');
      setStep('error');
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 rounded-lg max-w-lg w-full p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">Add {config.standard} Token</h2>
              <p className="text-sm text-gray-400">{config.name}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Input Step */}
          {step === 'input' && (
            <div className="space-y-4">
              {chain === 'xrp' ? (
                <>
                  {/* XRPL: Currency Code + Issuer */}
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">
                      Currency Code
                    </label>
                    <input
                      type="text"
                      value={currencyCode}
                      onChange={(e) => setCurrencyCode(e.target.value.toUpperCase().slice(0, 40))}
                      placeholder="USD"
                      maxLength={40}
                      className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white font-mono uppercase text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Standard: 3 characters (USD, EUR, BTC). Hex: 40-character code for longer token names (SOLO, RLUSD, etc.)
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">
                      Issuer Address
                    </label>
                    <input
                      type="text"
                      value={issuerAddress}
                      onChange={(e) => setIssuerAddress(e.target.value.trim())}
                      placeholder="rN7n7otQDd6FczFgLdlqtyMVrn3WnFHHL5"
                      className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      The XRPL account address that issues this token
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {/* ERC-20/BEP-20/SPL: Contract/Mint Address */}
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">
                      {chain === 'solana' ? 'Mint Address' : 'Contract Address'}
                    </label>
                    <input
                      type="text"
                      value={tokenAddress}
                      onChange={(e) => setTokenAddress(e.target.value.trim())}
                      placeholder={config.placeholder}
                      className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Paste the token's {chain === 'solana' ? 'mint' : 'contract'} address from a block explorer
                    </p>
                  </div>
                </>
              )}

              {/* Warning */}
              <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-200">
                    <p className="font-semibold mb-1">Verify Before Adding</p>
                    <p>
                      Only add tokens from trusted sources. Scam tokens can appear legitimate but be worthless.
                      Always verify the {chain === 'xrp' ? 'issuer address' : 'contract address'} on an official block explorer.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleVerify}
                disabled={
                  isVerifying ||
                  (chain === 'xrp' ? (!currencyCode || !issuerAddress) : !tokenAddress)
                }
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Verify Token
                  </>
                )}
              </button>
            </div>
          )}

          {/* Verify Step */}
          {step === 'verify' && verifiedToken && (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-green-400 mb-2">Token Verified</p>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Symbol:</span>
                        <span className="font-semibold">{verifiedToken.symbol}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Name:</span>
                        <span className="font-semibold">{verifiedToken.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Standard:</span>
                        <span className="font-semibold">{verifiedToken.standard}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Decimals:</span>
                        <span className="font-semibold">{verifiedToken.decimals}</span>
                      </div>
                      {verifiedToken.contractAddress && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">Contract:</span>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs">
                              {verifiedToken.contractAddress.slice(0, 6)}...
                              {verifiedToken.contractAddress.slice(-4)}
                            </span>
                            <ExternalLink className="w-3 h-3 text-blue-400" />
                          </div>
                        </div>
                      )}
                      {verifiedToken.issuer && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">Issuer:</span>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs">
                              {verifiedToken.issuer.slice(0, 6)}...
                              {verifiedToken.issuer.slice(-4)}
                            </span>
                            <ExternalLink className="w-3 h-3 text-blue-400" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('input')}
                  className="flex-1 px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
                >
                  Back
                </button>
                <button
                  onClick={handleAdd}
                  className="flex-1 px-4 py-2 bg-green-600 rounded-lg hover:bg-green-500 font-medium"
                >
                  Add Token
                </button>
              </div>
            </div>
          )}

          {/* Adding Step */}
          {step === 'adding' && (
            <div className="py-8 text-center">
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
              <p className="text-lg font-semibold">
                {chain === 'xrp' ? 'Setting Trustline...' : 'Adding Token...'}
              </p>
              <p className="text-sm text-gray-400 mt-2">
                {chain === 'xrp' ? 'This will lock 2 XRP as reserve' : 'Please wait...'}
              </p>
            </div>
          )}

          {/* Success Step */}
          {step === 'success' && (
            <div className="py-8 text-center">
              <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
              <p className="text-lg font-semibold text-green-400">Token Added!</p>
              <p className="text-sm text-gray-400 mt-2">Closing...</p>
            </div>
          )}

          {/* Error Step */}
          {step === 'error' && (
            <div className="space-y-4">
              <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-400">Error</p>
                    <p className="text-sm text-red-300 mt-1">{error}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setStep('input')}
                className="w-full px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>

      {/* XRPL Trustline Warning Modal */}
      {showTrustlineWarning && verifiedToken && reserveInfo && chain === 'xrp' && (
        <TrustlineWarningModal
          token={{
            issuer: verifiedToken.issuer!,
            currency: verifiedToken.currencyCode!,
            name: verifiedToken.name,
          }}
          reserveInfo={reserveInfo}
          issuerFlags={issuerFlags}
          onConfirm={handleTrustlineConfirm}
          onCancel={() => {
            setShowTrustlineWarning(false);
            setStep('verify');
          }}
        />
      )}
    </>
  );
}
