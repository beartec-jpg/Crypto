// client/src/lib/sendService.ts
// Multi-chain send transaction service with gas estimation and broadcasting

import { ethers } from 'ethers';
import axios from 'axios';

export type Chain = 'ethereum' | 'bsc';

export interface GasEstimate {
  gasLimit: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  estimatedFee: string;
  estimatedFeeUsd: number;
}

export interface BalanceCheck {
  sufficient: boolean;
  balance: string;
  required: string;
  shortfall?: string;
}

export interface TransactionBroadcastResult {
  hash: string;
  explorerUrl: string;
}

export interface TransactionStatus {
  status: 'pending' | 'confirming' | 'confirmed' | 'failed';
  confirmations: number;
  requiredConfirmations: number;
  blockNumber?: number;
}

// RPC endpoints
const RPC_ENDPOINTS = {
  ethereum: 'https://eth.llamarpc.com',
  bsc: 'https://bsc-dataseed.binance.org',
};

// Block explorer URLs
const EXPLORER_URLS = {
  ethereum: 'https://etherscan.io',
  bsc: 'https://bscscan.com',
};

// Required confirmations
const REQUIRED_CONFIRMATIONS = {
  ethereum: 6,
  bsc: 15,
};

/**
 * Get provider for chain
 */
function getProvider(chain: Chain): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
}

/**
 * Get current gas prices for chain
 */
async function getGasPrices(chain: Chain): Promise<{
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}> {
  const provider = getProvider(chain);
  
  try {
    // Try to get EIP-1559 fees first (Ethereum)
    if (chain === 'ethereum') {
      const feeData = await provider.getFeeData();
      
      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        return {
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        };
      }
    }
    
    // Fall back to legacy gas price (BSC and fallback for Ethereum)
    const feeData = await provider.getFeeData();
    if (feeData.gasPrice) {
      return { gasPrice: feeData.gasPrice };
    }
    
    throw new Error('Failed to fetch gas prices');
  } catch (error) {
    console.error('Error fetching gas prices:', error);
    throw new Error('Unable to estimate fees. Please check your connection and try again.');
  }
}

/**
 * Get token price in USD
 */
async function getTokenPrice(chain: Chain): Promise<number> {
  try {
    const coinIds: Record<Chain, string> = {
      ethereum: 'ethereum',
      bsc: 'binancecoin',
    };
    
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds[chain]}&vs_currencies=usd`,
      { timeout: 5000 }
    );
    
    return response.data[coinIds[chain]]?.usd || 0;
  } catch (error) {
    console.warn('Failed to fetch token price:', error);
    return 0; // Return 0 if price fetch fails (non-critical)
  }
}

/**
 * Estimate gas for a transaction
 */
export async function estimateGas(
  chain: Chain,
  from: string,
  to: string,
  value: string
): Promise<GasEstimate> {
  try {
    const provider = getProvider(chain);
    const valueInWei = ethers.parseEther(value);
    
    // Estimate gas limit
    const gasLimit = await provider.estimateGas({
      from,
      to,
      value: valueInWei,
    });
    
    // Add 20% buffer to gas limit for safety
    const gasLimitWithBuffer = (gasLimit * BigInt(120)) / BigInt(100);
    
    // Get gas prices
    const gasPrices = await getGasPrices(chain);
    
    // Calculate estimated fee
    let estimatedFeeWei: bigint;
    if (gasPrices.maxFeePerGas) {
      estimatedFeeWei = gasLimitWithBuffer * gasPrices.maxFeePerGas;
    } else if (gasPrices.gasPrice) {
      estimatedFeeWei = gasLimitWithBuffer * gasPrices.gasPrice;
    } else {
      throw new Error('Unable to calculate gas fee');
    }
    
    const estimatedFee = ethers.formatEther(estimatedFeeWei);
    
    // Get token price for USD estimate
    const tokenPrice = await getTokenPrice(chain);
    const estimatedFeeUsd = parseFloat(estimatedFee) * tokenPrice;
    
    return {
      gasLimit: gasLimitWithBuffer,
      gasPrice: gasPrices.gasPrice,
      maxFeePerGas: gasPrices.maxFeePerGas,
      maxPriorityFeePerGas: gasPrices.maxPriorityFeePerGas,
      estimatedFee,
      estimatedFeeUsd,
    };
  } catch (error: any) {
    console.error('Gas estimation error:', error);
    
    if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient balance for transaction amount');
    }
    
    throw new Error('Unable to estimate fees. Please check your connection and try again.');
  }
}

/**
 * Check if user has sufficient balance for transaction + fees
 * CRITICAL: This must be called BEFORE signing
 */
export async function checkSufficientBalance(
  chain: Chain,
  address: string,
  amount: string,
  estimatedFee: string
): Promise<BalanceCheck> {
  try {
    const provider = getProvider(chain);
    const balance = await provider.getBalance(address);
    const balanceEth = ethers.formatEther(balance);
    
    const amountNum = parseFloat(amount);
    const feeNum = parseFloat(estimatedFee);
    const requiredNum = amountNum + feeNum;
    const balanceNum = parseFloat(balanceEth);
    
    const sufficient = balanceNum >= requiredNum;
    
    return {
      sufficient,
      balance: balanceEth,
      required: requiredNum.toFixed(6),
      shortfall: sufficient ? undefined : (requiredNum - balanceNum).toFixed(6),
    };
  } catch (error) {
    console.error('Balance check error:', error);
    throw new Error('Unable to check balance. Please try again.');
  }
}

/**
 * Build transaction object ready for signing
 */
export async function buildTransaction(
  chain: Chain,
  from: string,
  to: string,
  amount: string,
  gasEstimate: GasEstimate
): Promise<ethers.TransactionRequest> {
  const provider = getProvider(chain);
  const nonce = await provider.getTransactionCount(from, 'pending');
  const valueInWei = ethers.parseEther(amount);
  
  const tx: ethers.TransactionRequest = {
    from,
    to,
    value: valueInWei,
    nonce,
    gasLimit: gasEstimate.gasLimit,
    chainId: chain === 'ethereum' ? 1 : 56, // Mainnet chain IDs
  };
  
  // Use EIP-1559 if available, otherwise legacy
  if (gasEstimate.maxFeePerGas && gasEstimate.maxPriorityFeePerGas) {
    tx.maxFeePerGas = gasEstimate.maxFeePerGas;
    tx.maxPriorityFeePerGas = gasEstimate.maxPriorityFeePerGas;
    tx.type = 2; // EIP-1559
  } else if (gasEstimate.gasPrice) {
    tx.gasPrice = gasEstimate.gasPrice;
    tx.type = 0; // Legacy
  }
  
  return tx;
}

/**
 * Broadcast signed transaction to network
 */
export async function broadcastTransaction(
  chain: Chain,
  signedTx: string
): Promise<TransactionBroadcastResult> {
  try {
    const provider = getProvider(chain);
    const txResponse = await provider.broadcastTransaction(signedTx);
    
    const explorerUrl = `${EXPLORER_URLS[chain]}/tx/${txResponse.hash}`;
    
    console.log(`✅ Transaction broadcast: ${txResponse.hash}`);
    
    return {
      hash: txResponse.hash,
      explorerUrl,
    };
  } catch (error: any) {
    console.error('Broadcast error:', error);
    
    if (error.message?.includes('nonce')) {
      throw new Error('Transaction rejected: Nonce error. Please try again.');
    }
    
    if (error.message?.includes('gas')) {
      throw new Error('Transaction rejected: Insufficient gas. Please try again.');
    }
    
    throw new Error('Failed to broadcast transaction. Please try again.');
  }
}

/**
 * Get transaction status and confirmation count
 */
export async function getTransactionStatus(
  chain: Chain,
  hash: string
): Promise<TransactionStatus> {
  try {
    const provider = getProvider(chain);
    const tx = await provider.getTransaction(hash);
    
    if (!tx) {
      return {
        status: 'pending',
        confirmations: 0,
        requiredConfirmations: REQUIRED_CONFIRMATIONS[chain],
      };
    }
    
    const receipt = await provider.getTransactionReceipt(hash);
    
    if (!receipt) {
      return {
        status: 'pending',
        confirmations: 0,
        requiredConfirmations: REQUIRED_CONFIRMATIONS[chain],
      };
    }
    
    if (receipt.status === 0) {
      return {
        status: 'failed',
        confirmations: 0,
        requiredConfirmations: REQUIRED_CONFIRMATIONS[chain],
        blockNumber: receipt.blockNumber,
      };
    }
    
    const currentBlock = await provider.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber + 1;
    const requiredConfirmations = REQUIRED_CONFIRMATIONS[chain];
    
    let status: TransactionStatus['status'];
    if (confirmations === 0) {
      status = 'pending';
    } else if (confirmations < requiredConfirmations) {
      status = 'confirming';
    } else {
      status = 'confirmed';
    }
    
    return {
      status,
      confirmations,
      requiredConfirmations,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    console.error('Status check error:', error);
    return {
      status: 'pending',
      confirmations: 0,
      requiredConfirmations: REQUIRED_CONFIRMATIONS[chain],
    };
  }
}

/**
 * Get chain symbol for display
 */
export function getChainSymbol(chain: Chain): string {
  const symbols: Record<Chain, string> = {
    ethereum: 'ETH',
    bsc: 'BNB',
  };
  return symbols[chain];
}

/**
 * Validate address for chain
 */
export function validateAddress(address: string, chain: Chain): boolean {
  // Both Ethereum and BSC use the same address format
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
