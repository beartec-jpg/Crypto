// client/src/lib/sendService.ts
// Multi-chain send transaction service with gas estimation and broadcasting

import { ethers } from 'ethers';
import axios from 'axios';

export type Chain = 'ethereum' | 'bsc' | 'xrp';

// Supported chains for sending
export const SUPPORTED_SEND_CHAINS: Chain[] = ['ethereum', 'bsc'];

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

// Primary and backup RPC endpoints
const RPC_ENDPOINTS = {
  ethereum: [
    'https://rpc.ankr.com/eth',        // More reliable, put first
    'https://ethereum.publicnode.com',
    'https://eth.llamarpc.com',        // Was first, now backup
  ],
  bsc: [
    'https://bsc-dataseed.binance.org',
    'https://bsc-dataseed1.defibit.io',
    'https://bsc.publicnode.com',
  ],
};

// Block explorer URLs
const EXPLORER_URLS = {
  ethereum: 'https://etherscan.io',
  bsc: 'https://bscscan.com',
  xrp: 'https://livenet.xrpl.org',
};

// Current RPC index for rotation
let currentRpcIndex: Record<Chain, number> = {
  ethereum: 0,
  bsc: 0,
  xrp: 0,
};

// Required confirmations
const REQUIRED_CONFIRMATIONS = {
  ethereum: 6,
  bsc: 15,
};

/**
 * Get provider for chain with automatic failover
 */
function getProvider(chain: Chain): ethers.JsonRpcProvider {
  if (chain === 'xrp') {
    throw new Error('XRP does not use JSON-RPC provider');
  }
  const endpoints = RPC_ENDPOINTS[chain];
  const index = currentRpcIndex[chain];
  return new ethers.JsonRpcProvider(endpoints[index]);
}

/**
 * Rotate to next RPC endpoint for chain
 */
function rotateRpc(chain: Chain): void {
  if (chain === 'xrp') return;
  const endpoints = RPC_ENDPOINTS[chain];
  currentRpcIndex[chain] = (currentRpcIndex[chain] + 1) % endpoints.length;
  console.log(`Rotated to RPC: ${endpoints[currentRpcIndex[chain]]}`);
}

/**
 * Get current gas prices using proper EIP-1559 calculation
 * Based on how MetaMask and other production wallets calculate fees
 */
async function getGasPrices(chain: Chain): Promise<{
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}> {
  const maxRetries = RPC_ENDPOINTS[chain]?.length || 1;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const provider = getProvider(chain);
      
      if (chain === 'ethereum') {
        // === PROPER EIP-1559 CALCULATION (MetaMask-style) ===
        
        // Step 1: Get the REAL base fee from the latest block
        // This is the actual current fee, not a stale suggestion
        const block = await provider.getBlock('latest');
        
        if (!block) {
          throw new Error('Unable to fetch latest block from network');
        }
        
        if (!block.baseFeePerGas) {
          throw new Error('Block does not contain base fee (EIP-1559 not supported)');
        }
        
        const baseFee = block.baseFeePerGas;
        
        // Step 2: Set priority fee (tip to validators)
        // Minimum 1 Gwei - validators ignore trivial tips like 0.001 Gwei
        // Even when network is quiet, validators prefer meaningful tips
        const maxPriorityFeePerGas = MIN_PRIORITY_FEE_ETH;
        
        // Step 3: Calculate maxFeePerGas
        // Formula: (baseFee × 2) + priorityFee
        // Why 2x? Base fee can increase up to 12.5% per block
        // 2x gives ~6 blocks of headroom for fee increases
        const maxFeePerGas = (baseFee * BASE_FEE_MULTIPLIER) + maxPriorityFeePerGas;
        
        console.log(`✅ ETH Gas (EIP-1559): baseFee=${ethers.formatUnits(baseFee, 'gwei')} Gwei, maxFee=${ethers.formatUnits(maxFeePerGas, 'gwei')} Gwei, priority=${ethers.formatUnits(maxPriorityFeePerGas, 'gwei')} Gwei`);
        
        return { maxFeePerGas, maxPriorityFeePerGas };
      }
      
      // BSC - uses legacy gas pricing (not EIP-1559)
      const feeData = await provider.getFeeData();
      let gasPrice = feeData.gasPrice;
      
      if (!gasPrice) {
        // BSC fallback: 3 Gwei is reasonable for BSC
        gasPrice = FALLBACK_GAS_PRICE_BSC;
      } else {
        // Apply 50% buffer for BSC
        gasPrice = (gasPrice * GAS_PRICE_BUFFER) / 100n;
      }
      
      // BSC minimum: 1 Gwei
      if (gasPrice < MIN_GAS_PRICE_BSC) {
        gasPrice = MIN_GAS_PRICE_BSC;
      }
      
      console.log(`✅ BSC Gas: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`);
      return { gasPrice };
      
    } catch (error) {
      console.warn(`⚠️ Gas price fetch attempt ${attempt + 1} failed:`, error);
      rotateRpc(chain);
      
      if (attempt === maxRetries - 1) {
        console.error('❌ All RPC endpoints failed for gas prices');
        throw new Error('Unable to fetch gas prices. Please check your connection and try again.');
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  throw new Error('Unable to fetch gas prices. Please check your connection and try again.');
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

// Gas estimation buffer
const GAS_LIMIT_BUFFER = 120n; // 20% buffer on gas limit
// Gas price buffer for BSC (legacy gas pricing)
const GAS_PRICE_BUFFER = 150n; // 50% buffer on gas price

// EIP-1559 gas calculation constants (MetaMask-style)
const BASE_FEE_MULTIPLIER = 2n; // 2x base fee for volatility buffer (~6 blocks headroom)
const MIN_PRIORITY_FEE_ETH = ethers.parseUnits('1', 'gwei'); // Minimum tip validators will accept

// BSC minimum and fallback
const MIN_GAS_PRICE_BSC = ethers.parseUnits('1', 'gwei');
const FALLBACK_GAS_PRICE_BSC = ethers.parseUnits('3', 'gwei');

// Transaction verification delay (wait for network propagation)
const TRANSACTION_VERIFICATION_DELAY = 3000; // 3 seconds

/**
 * Estimate gas for a transaction
 */
export async function estimateGas(
  chain: Chain,
  from: string,
  to: string,
  value: string
): Promise<GasEstimate> {
  console.log(`🔍 Estimating gas for ${chain}:`);
  console.log(`  - From: ${from}`);
  console.log(`  - To: ${to}`);
  console.log(`  - Value: ${value} ${chain === 'ethereum' ? 'ETH' : 'BNB'}`);
  
  const maxRetries = RPC_ENDPOINTS[chain]?.length || 1;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
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
      const gasLimitWithBuffer = (gasLimit * GAS_LIMIT_BUFFER) / 100n;
      
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
      
      console.log(`✅ Gas estimation successful from RPC ${attempt + 1}`);
      console.log(`✅ Gas estimation result:`);
      console.log(`  - Gas Limit: ${gasLimitWithBuffer.toString()}`);
      console.log(`  - Max Fee Per Gas: ${gasPrices.maxFeePerGas ? ethers.formatUnits(gasPrices.maxFeePerGas, 'gwei') + ' Gwei' : 'N/A'}`);
      console.log(`  - Priority Fee: ${gasPrices.maxPriorityFeePerGas ? ethers.formatUnits(gasPrices.maxPriorityFeePerGas, 'gwei') + ' Gwei' : 'N/A'}`);
      console.log(`  - Gas Price: ${gasPrices.gasPrice ? ethers.formatUnits(gasPrices.gasPrice, 'gwei') + ' Gwei' : 'N/A'}`);
      console.log(`  - Estimated Fee: ${estimatedFee} ${chain === 'ethereum' ? 'ETH' : 'BNB'} (~$${estimatedFeeUsd.toFixed(2)})`);
      
      return {
        gasLimit: gasLimitWithBuffer,
        gasPrice: gasPrices.gasPrice,
        maxFeePerGas: gasPrices.maxFeePerGas,
        maxPriorityFeePerGas: gasPrices.maxPriorityFeePerGas,
        estimatedFee,
        estimatedFeeUsd,
      };
    } catch (error: any) {
      console.warn(`⚠️ Gas estimation attempt ${attempt + 1} failed:`, error);
      console.warn('Error details:', {
        message: error.message,
        code: error.code,
        reason: error.reason,
      });
      
      // Check for specific errors that shouldn't trigger retry
      if (error.message?.includes('insufficient funds')) {
        throw new Error('Insufficient balance for transaction amount');
      }
      
      rotateRpc(chain); // Try next RPC
      
      if (attempt === maxRetries - 1) {
        console.error('❌ All RPC endpoints failed for gas estimation');
        throw new Error('Unable to estimate fees. Please check your connection and try again.');
      }
      
      // Brief delay before retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  throw new Error('Unable to estimate fees. Please check your connection and try again.');
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
  console.log(`🔨 Building transaction for ${chain}:`);
  
  const provider = getProvider(chain);
  const nonce = await provider.getTransactionCount(from, 'pending');
  const valueInWei = ethers.parseEther(amount);
  
  console.log(`  - Nonce: ${nonce}`);
  console.log(`  - Value: ${amount} (${valueInWei.toString()} wei)`);
  
  const tx: ethers.TransactionRequest = {
    // Remove 'from' - ethers will use the signing wallet's address
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
    console.log(`  - Type: 2 (EIP-1559)`);
    console.log(`  - Max Fee: ${ethers.formatUnits(gasEstimate.maxFeePerGas, 'gwei')} Gwei`);
    console.log(`  - Priority Fee: ${ethers.formatUnits(gasEstimate.maxPriorityFeePerGas, 'gwei')} Gwei`);
  } else if (gasEstimate.gasPrice) {
    tx.gasPrice = gasEstimate.gasPrice;
    tx.type = 0; // Legacy
    console.log(`  - Type: 0 (Legacy)`);
    console.log(`  - Gas Price: ${ethers.formatUnits(gasEstimate.gasPrice, 'gwei')} Gwei`);
  }
  
  console.log(`  - Gas Limit: ${gasEstimate.gasLimit.toString()}`);
  console.log(`  - Chain ID: ${tx.chainId}`);
  
  return tx;
}

/**
 * Broadcast signed transaction to network with verification
 */
export async function broadcastTransaction(
  chain: Chain,
  signedTx: string
): Promise<TransactionBroadcastResult> {
  const maxRetries = RPC_ENDPOINTS[chain]?.length || 1;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const provider = getProvider(chain);
      const txResponse = await provider.broadcastTransaction(signedTx);
      
      console.log(`📡 Transaction broadcast: ${txResponse.hash}`);
      
      // NEW: Verify transaction was accepted by the network
      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, TRANSACTION_VERIFICATION_DELAY));
      
      // Check if transaction exists in mempool or chain
      const tx = await provider.getTransaction(txResponse.hash);
      
      if (!tx) {
        // Transaction not found - it was rejected
        throw new Error(
          'Transaction was not accepted by the network. ' +
          'This may be due to network congestion. Please try again.'
        );
      }
      
      console.log(`✅ Transaction verified on network: ${txResponse.hash}`);
      
      const explorerUrl = `${EXPLORER_URLS[chain]}/tx/${txResponse.hash}`;
      
      return {
        hash: txResponse.hash,
        explorerUrl,
      };
    } catch (error: any) {
      // === DETAILED ERROR LOGGING ===
      console.error(`❌ Broadcast attempt ${attempt + 1} failed:`);
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Error reason:', error.reason);
      console.error('Error data:', error.data);
      console.error('Full error:', error);
      
      // Log the transaction details for debugging
      try {
        const parsedTx = ethers.Transaction.from(signedTx);
        console.log('Transaction details:');
        console.log('  - Chain ID:', parsedTx.chainId);
        console.log('  - Nonce:', parsedTx.nonce);
        console.log('  - Gas Limit:', parsedTx.gasLimit?.toString());
        console.log('  - Max Fee Per Gas:', parsedTx.maxFeePerGas ? ethers.formatUnits(parsedTx.maxFeePerGas, 'gwei') + ' Gwei' : 'N/A');
        console.log('  - Max Priority Fee:', parsedTx.maxPriorityFeePerGas ? ethers.formatUnits(parsedTx.maxPriorityFeePerGas, 'gwei') + ' Gwei' : 'N/A');
        console.log('  - Gas Price:', parsedTx.gasPrice ? ethers.formatUnits(parsedTx.gasPrice, 'gwei') + ' Gwei' : 'N/A');
        console.log('  - Value:', ethers.formatEther(parsedTx.value), getChainSymbol(chain));
        console.log('  - To:', parsedTx.to);
        console.log('  - Type:', parsedTx.type);
      } catch (parseError) {
        console.error('Failed to parse transaction for logging:', parseError);
      }
      // === END DETAILED LOGGING ===
      
      // More specific error detection
      const errorMsg = error.message?.toLowerCase() || '';
      const errorCode = error.code;
      
      // Nonce errors - user should retry
      if (errorMsg.includes('nonce') || errorCode === 'NONCE_EXPIRED') {
        throw new Error('Transaction rejected: Nonce issue. Please try again.');
      }
      
      // ONLY match actual underpriced errors, not general "gas" mentions
      if (errorMsg.includes('underpriced') || 
          errorMsg.includes('replacement transaction underpriced') ||
          errorMsg.includes('transaction underpriced') ||
          errorCode === 'REPLACEMENT_UNDERPRICED' ||
          errorCode === 'TRANSACTION_REPLACED') {
        throw new Error('Transaction rejected: Gas price too low. Please try again.');
      }
      
      // Insufficient funds - different from gas price issue
      if (errorMsg.includes('insufficient funds') || 
          errorCode === 'INSUFFICIENT_FUNDS') {
        throw new Error('Insufficient funds for transaction and gas fees.');
      }
      
      // Gas limit exceeded
      if (errorMsg.includes('gas limit') || 
          errorMsg.includes('exceeds block gas limit') ||
          errorCode === 'UNPREDICTABLE_GAS_LIMIT') {
        throw new Error('Transaction failed: Gas limit issue. Please try a smaller amount.');
      }
      
      // Network rejected - show actual error for debugging
      if (error.message?.includes('not accepted')) {
        rotateRpc(chain);
        
        if (attempt === maxRetries - 1) {
          console.error('❌ All RPC endpoints failed to accept transaction');
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      
      // For unknown errors, show the actual error message (truncated)
      rotateRpc(chain);
      
      if (attempt === maxRetries - 1) {
        console.error('❌ All RPC endpoints failed for broadcast');
        // Show actual error message for debugging, truncated if too long
        const displayError = error.message?.substring(0, 200) || 'Unknown error';
        throw new Error(`Transaction failed: ${displayError}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  throw new Error('Failed to broadcast transaction. Please try again.');
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
    xrp: 'XRP',
  };
  return symbols[chain];
}

/**
 * Validate address for chain
 */
export function validateAddress(address: string, chain: Chain): boolean {
  switch (chain) {
    case 'ethereum':
    case 'bsc':
      // Both Ethereum and BSC use the same address format
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    case 'xrp':
      return /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address);
    default:
      return false;
  }
}
