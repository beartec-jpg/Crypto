// client/src/lib/xrpSendService.ts
// XRP native send service - STANDARD XRPL.js ONLY

import * as xrpl from 'xrpl';
import { xrplService } from './xrpService';
import type { TokenNetwork } from './tokenService';

const BASE_RESERVE = 10; // 10 XRP
const OWNER_RESERVE = 2; // 2 XRP per object

export interface XRPAccountInfo {
  address: string;
  balance: string;
  sequence: number;
  ownerCount: number;
  reserves: {
    base: number;
    owner: number;
    total: number;
  };
  available: string;
}

export interface XRPTransactionBroadcastResult {
  hash: string;
  explorerUrl: string;
}

/**
 * Get XRP account info with reserves calculation
 */
export async function getXrpAccountInfo(address: string, network: TokenNetwork = 'mainnet'): Promise<XRPAccountInfo> {
  try {
    const client = await xrplService.getClient(network === 'mainnet');
    
    const response = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    });
    
    const accountData = response.result.account_data;
    const balance = xrpl.dropsToXrp(accountData.Balance).toString();
    const ownerCount = accountData.OwnerCount || 0;
    const reserveTotal = BASE_RESERVE + (ownerCount * OWNER_RESERVE);
    const available = Math.max(0, parseFloat(balance) - reserveTotal);
    
    return {
      address,
      balance,
      sequence: accountData.Sequence,
      ownerCount,
      reserves: {
        base: BASE_RESERVE,
        owner: ownerCount * OWNER_RESERVE,
        total: reserveTotal,
      },
      available: available.toString(),
    };
  } catch (error: any) {
    console.error('Failed to get XRP account info:', error.message);
    throw error;
  }
}

/**
 * Check if destination XRP address exists
 */
export async function checkDestinationExists(address: string): Promise<boolean> {
  try {
    const client = await xrplService.getClient(true);
    
    const response = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    });
    
    return !!response.result.account_data;
  } catch (error: any) {
    // Account not found error
    if (error.data?.error === 'actNotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Calculate XRP reserves
 */
export function calculateReserves(ownerCount: number): {
  base: number;
  owner: number;
  total: number;
} {
  return {
    base: BASE_RESERVE,
    owner: ownerCount * OWNER_RESERVE,
    total: BASE_RESERVE + (ownerCount * OWNER_RESERVE),
  };
}

/**
 * Build XRP payment transaction
 */
export async function buildXrpTransaction(
  from: string,
  to: string,
  amount: string,
  destinationTag?: number
): Promise<xrpl.Payment> {
  try {
    const client = await xrplService.getClient(true);
    
    const payment: xrpl.Payment = {
      TransactionType: 'Payment',
      Account: from,
      Destination: to,
      Amount: xrpl.xrpToDrops(amount),
    };
    
    if (destinationTag !== undefined) {
      payment.DestinationTag = destinationTag;
    }
    
    // Auto-fill fee, sequence, etc.
    const prepared = await client.autofill(payment);
    
    return prepared;
  } catch (error: any) {
    console.error('Failed to build XRP transaction:', error.message);
    throw error;
  }
}

/**
 * Sign XRP transaction using STANDARD XRPL.js ONLY
 * Expects XRP seed format from walletService.getXRPSeed()
 */
export function signXrpTransaction(
  tx: xrpl.Payment,
  seed: string
): string {
  const normalizedInput = seed.trim();
  const isHex64 = /^[0-9a-fA-F]{64}$/.test(normalizedInput);
  const isHex64WithPrefix = /^0x[0-9a-fA-F]{64}$/.test(normalizedInput);
  const isAnyHexLike = /^0x[0-9a-fA-F]+$/.test(normalizedInput) || /^[0-9a-fA-F]+$/.test(normalizedInput);

  // Reject malformed hex-like inputs with a consistent app-level error message
  if (isAnyHexLike && !isHex64 && !isHex64WithPrefix) {
    throw new Error('Invalid private key format');
  }

  try {
    let wallet: xrpl.Wallet;

    if (isHex64 || isHex64WithPrefix) {
      const hexEntropy = normalizedInput.startsWith('0x') ? normalizedInput.slice(2) : normalizedInput;
      const entropyBytes = Uint8Array.from(
        hexEntropy.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) ?? []
      );
      // Standard XRPL.js path for raw entropy/hex keys
      wallet = xrpl.Wallet.fromEntropy(entropyBytes);
    } else {
      // Standard XRPL.js seed path
      wallet = xrpl.Wallet.fromSeed(normalizedInput);
    }

    const signed = wallet.sign(tx);
    return signed.tx_blob;
  } catch (error: any) {
    // Preserve downstream transaction/signing errors for valid key formats,
    // but normalize key-format failures for UX and tests.
    const message = String(error?.message || '').toLowerCase();
    if (
      message.includes('unknown letter') ||
      message.includes('checksum_invalid') ||
      message.includes('invalid seed')
    ) {
      throw new Error('Invalid private key format');
    }
    throw error;
  }
}

/**
 * Broadcast signed XRP transaction
 */
export async function broadcastXrpTransaction(
  signedTxBlob: string
): Promise<XRPTransactionBroadcastResult> {
  try {
    const client = await xrplService.getClient(true);
    
    // Use submit instead of submitAndWait to avoid timeout on slow connections
    const result = await client.submit(signedTxBlob);
    
    const engineResult = result.result.engine_result;
    
    if (engineResult !== 'tesSUCCESS' && engineResult !== 'terQUEUED') {
      throw new Error(`Transaction rejected: ${engineResult} - ${result.result.engine_result_message || ''}`);
    }
    
    // tx_json.hash is available on submit result
    const hash = (result.result as any).tx_json?.hash || signedTxBlob.slice(0, 64);
    
    return {
      hash,
      explorerUrl: `https://livenet.xrpl.org/transactions/${hash}`,
    };
  } catch (error: any) {
    console.error('Failed to broadcast XRP transaction:', error.message);
    throw error;
  }
}

/**
 * Estimate XRP transaction fee
 * Returns the current network fee in XRP
 */
export async function estimateXrpFee(): Promise<string> {
  try {
    const client = await xrplService.getClient(true);
    
    // Get current fee from the network
    const response = await client.request({
      command: 'fee',
    });
    
    // Convert drops to XRP
    const feeDrops = response.result.drops?.median_fee || response.result.drops?.minimum_fee || '12';
    const feeXRP = xrpl.dropsToXrp(feeDrops).toString();
    
    return feeXRP;
  } catch (error) {
    console.error('Failed to estimate XRP fee:', error);
    // Return default fee if estimation fails (0.00001 XRP = 10 drops)
    return '0.00001';
  }
}
