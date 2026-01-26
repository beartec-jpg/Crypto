// client/src/lib/xrpReserveService.ts
// XRPL reserve calculation and trustline management

import { Client, Wallet as XRPLWallet, dropsToXrp, xrpToDrops, encode } from 'xrpl';
import { deriveKeypair, sign } from 'ripple-keypairs';
import { secp256k1 } from '@noble/curves/secp256k1';
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
    // Note: XRPL library type definitions are inconsistent across versions.
    // accountData.Balance can be typed as number or string depending on the version,
    // but dropsToXrp() expects BigNumber.Value which includes both types.
    // Using @ts-ignore here is intentional until the XRPL library stabilizes its types.
    // @ts-ignore - XRPL type definitions inconsistency
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
 * FIXED: Now accepts userAddress parameter to use the correct wallet address
 */
export async function setXRPLTrustline(
  privateKey: string,
  userAddress: string,
  currency: string,
  issuer: string,
  limit: string = '999999999'
): Promise<{ success: boolean; txHash: string; error?: string }> {
  try {
    const client = await xrplService.getClient(true);
    
    // Get the public key and private key in correct format
    let publicKey: string;
    let privateKeyHex: string;
    
    if (privateKey.startsWith('s')) {
      // XRP seed format - derive keypair
      console.log('[XRP Trustline] Using seed format');
      const keypair = deriveKeypair(privateKey);
      publicKey = keypair.publicKey;
      privateKeyHex = keypair.privateKey;
    } else {
      // Hex format - need to derive public key from private key using secp256k1
      privateKeyHex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
      console.log('[XRP Trustline] Using hex format');
      
      // Use secp256k1 to get public key
      const publicKeyBytes = secp256k1.getPublicKey(Buffer.from(privateKeyHex, 'hex'), true);
      publicKey = Buffer.from(publicKeyBytes).toString('hex').toUpperCase();
    }
    
    // Build the TrustSet transaction using the ACTUAL user address
    const trustSet = {
      TransactionType: 'TrustSet' as const,
      Account: userAddress, // USE THE PASSED ADDRESS, not derived
      LimitAmount: {
        currency,
        issuer,
        value: limit,
      },
    };
    
    // Prepare the transaction
    const prepared = await client.autofill(trustSet);
    
    // Sign using ripple-keypairs sign function
    const txBlob = encode(prepared);
    const signature = sign(txBlob, privateKeyHex);
    
    // Combine the transaction with signature
    const signedTx = {
      ...prepared,
      SigningPubKey: publicKey,
      TxnSignature: signature,
    };
    
    // Encode the signed transaction
    const tx_blob = encode(signedTx);
    
    // Submit the transaction
    const result = await client.submitAndWait(tx_blob);
    
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
 * FIXED: Now accepts userAddress parameter to use the correct wallet address
 */
export async function removeXRPLTrustline(
  privateKey: string,
  userAddress: string,
  currency: string,
  issuer: string
): Promise<{ success: boolean; txHash: string; error?: string }> {
  try {
    const client = await xrplService.getClient(true);
    
    // Get the public key and private key in correct format
    let publicKey: string;
    let privateKeyHex: string;
    
    if (privateKey.startsWith('s')) {
      // XRP seed format - derive keypair
      const keypair = deriveKeypair(privateKey);
      publicKey = keypair.publicKey;
      privateKeyHex = keypair.privateKey;
    } else {
      // Hex format - need to derive public key from private key using secp256k1
      privateKeyHex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
      
      // Use secp256k1 to get public key
      const publicKeyBytes = secp256k1.getPublicKey(Buffer.from(privateKeyHex, 'hex'), true);
      publicKey = Buffer.from(publicKeyBytes).toString('hex').toUpperCase();
    }
    
    // Set limit to 0 to remove trustline
    const trustSet = {
      TransactionType: 'TrustSet' as const,
      Account: userAddress, // USE THE PASSED ADDRESS, not derived
      LimitAmount: {
        currency,
        issuer,
        value: '0',
      },
    };
    
    const prepared = await client.autofill(trustSet);
    
    // Sign using ripple-keypairs sign function
    const txBlob = encode(prepared);
    const signature = sign(txBlob, privateKeyHex);
    
    // Combine the transaction with signature
    const signedTx = {
      ...prepared,
      SigningPubKey: publicKey,
      TxnSignature: signature,
    };
    
    // Encode the signed transaction
    const tx_blob = encode(signedTx);
    
    // Submit the transaction
    const result = await client.submitAndWait(tx_blob);
    
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
