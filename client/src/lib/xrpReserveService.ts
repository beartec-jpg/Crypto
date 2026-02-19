// client/src/lib/xrpReserveService.ts
// XRPL trustline management - STANDARD XRPL.js ONLY

import { Client, Wallet, TrustSet, xrpToDrops } from 'xrpl';
import { xrplService } from './xrpService';

/**
 * XRP Reserve Information Interface
 */
export interface XRPReserveInfo {
  totalBalance: number;
  baseReserve: number;
  ownerReserve: number;
  currentReserve: number;
  totalReserve: number;      // Alias for currentReserve (used by TrustlineWarningModal)
  newReserve: number;
  available: number;
  availableBalance: number;  // Alias for available (used by TrustlineWarningModal)
  currentObjects: number;    // Number of owned objects (trustlines, offers, etc)
}

/**
 * Set XRPL trustline using STANDARD XRPL.js methods ONLY
 * NO custom signing, NO hex key workarounds
 */
export async function setXRPLTrustline(
  walletId: string,
  password: string,
  currency: string,
  issuer: string,
  limit: string = '999999999'
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    console.log('🔧 Setting XRPL trustline...');
    console.log('  Currency:', currency);
    console.log('  Issuer:', issuer);
    console.log('  Limit:', limit);

    // Get XRP seed using wallet service
    const { getXRPSeed } = await import('./walletService');
    const seed = await getXRPSeed(walletId, password);
    
    // Create wallet from seed using STANDARD XRPL.js
    const wallet = Wallet.fromSeed(seed);
    
    console.log('  Using address:', wallet.address);

    // Connect to XRPL
    const client = await xrplService.getClient(true);

    // Build TrustSet transaction
    const trustSet: TrustSet = {
      TransactionType: 'TrustSet',
      Account: wallet.address,
      LimitAmount: {
        currency: currency,
        issuer: issuer,
        value: limit,
      },
    };

    console.log('  Built TrustSet transaction:', trustSet);

    // Prepare transaction (auto-fill fee, sequence, etc)
    const prepared = await client.autofill(trustSet);
    console.log('  Prepared transaction:', prepared);

    // Sign transaction using STANDARD XRPL.js wallet.sign()
    const signed = wallet.sign(prepared);
    console.log('  Transaction signed, hash:', signed.hash);

    // Submit transaction
    const result = await client.submitAndWait(signed.tx_blob);
    console.log('  Transaction result:', result);

    if (result.result.meta && typeof result.result.meta === 'object') {
      const meta = result.result.meta as any;
      if (meta.TransactionResult === 'tesSUCCESS') {
        console.log('✅ Trustline set successfully!');
        return {
          success: true,
          txHash: signed.hash,
        };
      } else {
        console.error('❌ Transaction failed:', meta.TransactionResult);
        return {
          success: false,
          error: `Transaction failed: ${meta.TransactionResult}`,
        };
      }
    }

    return {
      success: false,
      error: 'Unknown transaction result',
    };
  } catch (error: any) {
    console.error('❌ Failed to set trustline:', error);
    return {
      success: false,
      error: error.message || 'Failed to set trustline',
    };
  }
}

/**
 * Get XRPL trustlines for an address
 */
export async function getXRPLTrustlines(address: string): Promise<Array<{
  currency: string;
  issuer: string;
  balance: string;
  limit: string;
}>> {
  try {
    const client = await xrplService.getClient(true);
    
    const response = await client.request({
      command: 'account_lines',
      account: address,
      ledger_index: 'validated',
    });

    if (!response.result.lines) {
      return [];
    }

    return response.result.lines.map((line: any) => ({
      currency: line.currency,
      issuer: line.account,
      balance: line.balance || '0',
      limit: line.limit || '0',
    }));
  } catch (error: any) {
    console.error('Failed to fetch trustlines:', error);
    return [];
  }
}

/**
 * Remove XRPL trustline (set limit to 0)
 */
export async function removeXRPLTrustline(
  walletId: string,
  password: string,
  currency: string,
  issuer: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  return setXRPLTrustline(walletId, password, currency, issuer, '0');
}

/**
 * Calculate XRP reserve requirements for an address
 */
export async function calculateXRPReserve(address: string): Promise<XRPReserveInfo> {
  try {
    // Import from xrpSendService to avoid circular dependency
    const { getXrpAccountInfo } = await import('./xrpSendService');
    
    const accountInfo = await getXrpAccountInfo(address);
    
    const totalBalance = parseFloat(accountInfo.balance);
    const available = parseFloat(accountInfo.available);
    const PER_OBJECT_RESERVE = 2; // Per-object reserve (constant on XRPL)
    
    return {
      totalBalance,
      baseReserve: accountInfo.reserves.base,
      ownerReserve: PER_OBJECT_RESERVE,
      currentReserve: accountInfo.reserves.total,
      totalReserve: accountInfo.reserves.total,  // Alias for TrustlineWarningModal
      newReserve: accountInfo.reserves.total + PER_OBJECT_RESERVE, // Adding trustline adds reserve
      available,
      availableBalance: available,  // Alias for TrustlineWarningModal
      currentObjects: accountInfo.ownerCount,  // Number of objects (trustlines, offers, etc)
    };
  } catch (error: any) {
    console.error('Failed to calculate XRP reserve:', error);
    throw new Error(`Failed to get XRP account info: ${error.message}`);
  }
}
