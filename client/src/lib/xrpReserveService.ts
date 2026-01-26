// client/src/lib/xrpReserveService.ts
// XRPL reserve calculation and trustline management

import { Client, Wallet as XRPLWallet, dropsToXrp, xrpToDrops } from 'xrpl';
import { xrplService } from './xrpService';

export interface XRPReserveInfo {
  baseReserve: number;
  ownerReserve: number;
  currentObjects: number;
  totalReserve: number;
  totalBalance: number;
  availableBalance: number;
  canAddTrustline: boolean;
  trustlineCount: number;
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
    
    const baseReserve = 10;
    const ownerReserve = 2;
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
 * Supports both XRP seed format (s...) and hex private keys
 */
export async function setXRPLTrustline(
  privateKey: string,
  currency: string,
  issuer: string,
  limit: string = '999999999'
): Promise<{ success: boolean; txHash: string; error?: string }> {
  try {
    let wallet: XRPLWallet;
    
    // Detect key format and create wallet accordingly
    if (privateKey.startsWith('s')) {
      // XRP seed format (starts with 's')
      console.log('[XRP Trustline] Using seed format');
      wallet = XRPLWallet.fromSeed(privateKey);
    } else if (/^[0-9a-fA-F]{64}$/.test(privateKey)) {
      // Hex private key (64 hex characters)
      console.log('[XRP Trustline] Using hex format');
      wallet = XRPLWallet.fromEntropy(Buffer.from(privateKey, 'hex'));
    } else {
      throw new Error('Invalid private key format. Expected XRP seed (s...) or 64-char hex.');
    }
    
    const client = await xrplService.getClient(true);
    
    // Prepare TrustSet transaction
    const trustSet = {
      TransactionType: 'TrustSet' as const,
      Account: wallet.address,
      LimitAmount: {
        currency,
        issuer,
        value: limit,
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
 * Supports both XRP seed format (s...) and hex private keys
 */
export async function removeXRPLTrustline(
  privateKey: string,
  currency: string,
  issuer: string
): Promise<{ success: boolean; txHash: string; error?: string }> {
  try {
    let wallet: XRPLWallet;
    
    // Detect key format
    if (privateKey.startsWith('s')) {
      wallet = XRPLWallet.fromSeed(privateKey);
    } else if (/^[0-9a-fA-F]{64}$/.test(privateKey)) {
      wallet = XRPLWallet.fromEntropy(Buffer.from(privateKey, 'hex'));
    } else {
      throw new Error('Invalid private key format. Expected XRP seed (s...) or 64-char hex.');
    }
    
    const client = await xrplService.getClient(true);
    
    // Set limit to 0 to remove trustline
    const trustSet = {
      TransactionType: 'TrustSet' as const,
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
