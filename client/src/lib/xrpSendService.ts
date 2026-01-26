// client/src/lib/xrpSendService.ts
// XRP native send service - STANDARD XRPL.js ONLY

import * as xrpl from 'xrpl';

const BASE_RESERVE = 10; // 10 XRP
const OWNER_RESERVE = 2; // 2 XRP per object
const XRP_MAINNET_URL = 'wss://xrplcluster.com';

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
 * Sign XRP transaction using STANDARD XRPL.js ONLY
 * Expects XRP seed format from walletService.getXRPSeed()
 */
export function signXrpTransaction(
  tx: xrpl.Payment,
  seed: string
): string {
  // Use ONLY standard XRPL.js Wallet.fromSeed()
  const wallet = xrpl.Wallet.fromSeed(seed);
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
 * Send XRP (convenience function combining build, sign, broadcast)
 */
export async function sendXrp(
  walletId: string,
  password: string,
  to: string,
  amount: string,
  destinationTag?: number
): Promise<XRPTransactionBroadcastResult> {
  try {
    // Get XRP seed from wallet service
    const { getXRPSeed } = await import('./walletService');
    const seed = await getXRPSeed(walletId, password);
    
    // Create wallet to get address
    const wallet = xrpl.Wallet.fromSeed(seed);
    const from = wallet.address;
    
    console.log('📤 Sending XRP...');
    console.log('  From:', from);
    console.log('  To:', to);
    console.log('  Amount:', amount, 'XRP');
    
    // Build transaction
    const tx = await buildXrpTransaction(from, to, amount, destinationTag);
    console.log('  Transaction built');
    
    // Sign transaction
    const signedTx = signXrpTransaction(tx, seed);
    console.log('  Transaction signed');
    
    // Broadcast transaction
    const result = await broadcastXrpTransaction(signedTx);
    console.log('  Transaction broadcast:', result.hash);
    
    return result;
  } catch (error: any) {
    console.error('❌ Failed to send XRP:', error);
    throw error;
  }
}
