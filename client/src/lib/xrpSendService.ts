// client/src/lib/xrpSendService.ts
// XRP native send service with transaction building and signing

import * as xrpl from 'xrpl';

const BASE_RESERVE = 10; // 10 XRP
const OWNER_RESERVE = 2; // 2 XRP per object
const XRP_MAINNET_URL = 'wss://xrplcluster.com';
const DEFAULT_FEE_DROPS = '12'; // Default fee in drops (0.000012 XRP)

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
export async function getXrpAccountInfo(address: string): Promise<XRPAccountInfo> {
  const client = new xrpl.Client(XRP_MAINNET_URL);
  
  try {
    await client.connect();
    
    const response = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    });
    
    const accountData = response.result.account_data;
    const balance = xrpl.dropsToXrp(accountData.Balance);
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
  } finally {
    await client.disconnect();
  }
}

/**
 * Check if destination XRP address exists
 */
export async function checkDestinationExists(address: string): Promise<boolean> {
  const client = new xrpl.Client(XRP_MAINNET_URL);
  
  try {
    await client.connect();
    
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
  } finally {
    await client.disconnect();
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
  const client = new xrpl.Client(XRP_MAINNET_URL);
  
  try {
    await client.connect();
    
    // Get account info for sequence number
    const accountInfo = await getXrpAccountInfo(from);
    
    // Get current ledger for LastLedgerSequence
    const ledger = await client.request({
      command: 'ledger',
      ledger_index: 'validated',
    });
    
    const payment: xrpl.Payment = {
      TransactionType: 'Payment',
      Account: from,
      Destination: to,
      Amount: xrpl.xrpToDrops(amount),
      Sequence: accountInfo.sequence,
      LastLedgerSequence: ledger.result.ledger_index + 75, // ~5 minutes
    };
    
    if (destinationTag !== undefined) {
      payment.DestinationTag = destinationTag;
    }
    
    // Auto-fill transaction (adds Fee)
    const prepared = await client.autofill(payment);
    
    return prepared;
  } finally {
    await client.disconnect();
  }
}

/**
 * Sign XRP transaction
 * Handles both XRP seed format (s...) and hex private key format
 */
export function signXrpTransaction(
  tx: xrpl.Payment,
  privateKey: string
): string {
  let wallet: xrpl.Wallet;
  
  // Detect key format and create wallet accordingly
  if (privateKey.startsWith('s')) {
    // XRP seed format (sXXXXXX...)
    wallet = xrpl.Wallet.fromSeed(privateKey);
  } else if (/^[0-9a-fA-F]{64}$/.test(privateKey)) {
    // Hex private key format (64 hex characters)
    wallet = xrpl.Wallet.fromSecret(privateKey);
  } else {
    throw new Error('Invalid private key format. Expected XRP seed (s...) or 64-character hex string.');
  }
  
  // Sign the transaction
  const signed = wallet.sign(tx);
  
  return signed.tx_blob;
}

/**
 * Broadcast XRP transaction
 */
export async function broadcastXrpTransaction(
  signedTx: string
): Promise<XRPTransactionBroadcastResult> {
  const client = new xrpl.Client(XRP_MAINNET_URL);
  
  try {
    await client.connect();
    
    const result = await client.submitAndWait(signedTx);
    
    if (result.result.meta && typeof result.result.meta === 'object' && 
        'TransactionResult' in result.result.meta) {
      const txResult = result.result.meta.TransactionResult;
      
      if (txResult !== 'tesSUCCESS') {
        throw new Error(`Transaction failed: ${txResult}`);
      }
    }
    
    const hash = result.result.hash;
    const explorerUrl = `https://livenet.xrpl.org/transactions/${hash}`;
    
    console.log(`✅ XRP transaction confirmed: ${hash}`);
    
    return {
      hash,
      explorerUrl,
    };
  } finally {
    await client.disconnect();
  }
}

/**
 * Estimate XRP transaction fee
 */
export async function estimateXrpFee(): Promise<string> {
  const client = new xrpl.Client(XRP_MAINNET_URL);
  
  try {
    await client.connect();
    
    const feeResponse = await client.request({
      command: 'fee',
    });
    
    // Get the median fee in drops
    const feeDrops = feeResponse.result.drops?.median_fee || DEFAULT_FEE_DROPS;
    
    // Convert to XRP
    return xrpl.dropsToXrp(feeDrops);
  } catch (error) {
    console.warn('Failed to fetch XRP fee, using default:', error);
    return xrpl.dropsToXrp(DEFAULT_FEE_DROPS); // Default 0.000012 XRP
  } finally {
    await client.disconnect();
  }
}
