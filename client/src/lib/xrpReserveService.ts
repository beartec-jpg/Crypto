// client/src/lib/xrpReserveService.ts
// XRPL reserve calculation and trustline management

import { Client, Wallet as XRPLWallet, dropsToXrp, xrpToDrops } from 'xrpl';
import { xrplService } from './xrpService';

export interface XRPReserveInfo {
  baseReserve: number;        // 10 XRP (base account reserve)
  ownerReserve: number;        // 2 XRP per object
  currentObjects: number;      // Current trustlines + offers + escrows + etc
  totalReserve: number;        // Total locked XRP
  totalBalance: number;        // Total XRP in account
  availableBalance: number;    // Balance - reserve (spendable)
  canAddTrustline: boolean;    // Has 2+ XRP available
  trustlineCount: number;      // Number of active trustlines
}

/**
 * Calculate XRP reserve requirements
 */
export async function calculateXRPReserve(address: string): Promise<XRPReserveInfo> {
  try {
    const client = await xrplService.getClient(true);
    
    const accountInfo = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    });
    
    const accountData = accountInfo.result.account_data;
    const totalBalance = parseFloat(dropsToXrp(accountData.Balance));
    const ownerCount = accountData.OwnerCount || 0;
    
    // Get trustline count
    let trustlineCount = 0;
    try {
      const lines = await client.request({
        command: 'account_lines',
        account: address,
        ledger_index: 'validated',
      });
      trustlineCount = lines.result.lines?.length || 0;
    } catch {
      trustlineCount = 0;
    }
    
    const baseReserve = 10;  // 10 XRP base
    const ownerReserve = 2;   // 2 XRP per object
    const totalReserve = baseReserve + (ownerCount * ownerReserve);
    const availableBalance = Math.max(0, totalBalance - totalReserve);
    
    return {
      baseReserve,
      ownerReserve,
      currentObjects: ownerCount,
      totalReserve,
      totalBalance,
      availableBalance,
      canAddTrustline: availableBalance >= 2,
      trustlineCount,
    };
  } catch (error) {
    console.error('Failed to calculate XRP reserve:', error);
    throw error;
  }
}

/**
 * Set a trustline for an XRPL token
 */
export async function setXRPLTrustline(
  privateKeyHex: string,
  currency: string,
  issuer: string,
  limit: string = '999999999'
): Promise<{ success: boolean; txHash: string; error?: string }> {
  try {
    // Convert hex private key to seed format
    const wallet = XRPLWallet.fromSeed(privateKeyHex);
    const client = await xrplService.getClient(true);
    
    // Prepare TrustSet transaction
    const trustSet = {
      TransactionType: 'TrustSet',
      Account: wallet.address,
      LimitAmount: {
        currency,
        issuer,
        value: limit,
      },
    };
    
    // Auto-fill transaction (adds fee, sequence, etc)
    const prepared = await client.autofill(trustSet);
    
    // Sign transaction
    const signed = wallet.sign(prepared);
    
    // Submit and wait for validation
    const result = await client.submitAndWait(signed.tx_blob);
    
    if (result.result.meta && typeof result.result.meta === 'object' && 'TransactionResult' in result.result.meta) {
      const transactionResult = (result.result.meta as any).TransactionResult;
      
      if (transactionResult === 'tesSUCCESS') {
        return {
          success: true,
          txHash: result.result.hash,
        };
      } else {
        return {
          success: false,
          txHash: result.result.hash,
          error: `Transaction failed: ${transactionResult}`,
        };
      }
    }
    
    throw new Error('Invalid transaction result');
  } catch (error: any) {
    console.error('Failed to set trustline:', error);
    return {
      success: false,
      txHash: '',
      error: error.message || 'Failed to set trustline',
    };
  }
}

/**
 * Remove a trustline (balance must be 0)
 */
export async function removeXRPLTrustline(
  privateKeyHex: string,
  currency: string,
  issuer: string
): Promise<{ success: boolean; txHash: string; error?: string }> {
  try {
    const wallet = XRPLWallet.fromSeed(privateKeyHex);
    const client = await xrplService.getClient(true);
    
    // Set limit to 0 to remove trustline
    const trustSet = {
      TransactionType: 'TrustSet',
      Account: wallet.address,
      LimitAmount: {
        currency,
        issuer,
        value: '0',
      },
    };
    
    const prepared = await client.autofill(trustSet);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    
    if (result.result.meta && typeof result.result.meta === 'object' && 'TransactionResult' in result.result.meta) {
      const transactionResult = (result.result.meta as any).TransactionResult;
      
      if (transactionResult === 'tesSUCCESS') {
        return {
          success: true,
          txHash: result.result.hash,
        };
      } else {
        return {
          success: false,
          txHash: result.result.hash,
          error: `Transaction failed: ${transactionResult}`,
        };
      }
    }
    
    throw new Error('Invalid transaction result');
  } catch (error: any) {
    console.error('Failed to remove trustline:', error);
    return {
      success: false,
      txHash: '',
      error: error.message || 'Failed to remove trustline',
    };
  }
}
