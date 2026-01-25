// client/src/lib/solanaService.ts
// Solana transaction building and SPL token support

import axios from 'axios';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  Keypair,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
} from '@solana/spl-token';
import bs58 from 'bs58';

// RPC endpoint
const getRPCUrl = () => {
  const HELIUS_KEY = import.meta.env.VITE_HELIUS_API_KEY || '';
  return HELIUS_KEY 
    ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
    : 'https://rpc.ankr.com/solana';
};

export interface SolanaPriorityFee {
  none: number;      // 0 microlamports
  low: number;       // 5,000 microlamports
  medium: number;    // 50,000 microlamports  
  high: number;      // 100,000 microlamports
  veryHigh: number;  // 500,000 microlamports
}

export interface SolanaTxResult {
  signature: string;
  slot: number;
}

/**
 * Get Solana connection
 */
export function getSolanaConnection(): Connection {
  return new Connection(getRPCUrl(), 'confirmed');
}

/**
 * Lamports to SOL
 */
export function lamportsToSOL(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * SOL to lamports
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

/**
 * Get Solana priority fees (static for now)
 */
export function getSolanaPriorityFees(): SolanaPriorityFee {
  return {
    none: 0,
    low: 5000,        // 0.000005 SOL
    medium: 50000,    // 0.00005 SOL
    high: 100000,     // 0.0001 SOL
    veryHigh: 500000, // 0.0005 SOL
  };
}

/**
 * Validate Solana address
 */
export function validateSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Send native SOL
 */
export async function sendSolana(
  privateKeyBase58: string,
  toAddress: string,
  amountSOL: number,
  priorityFee: number = 0, // microlamports
  memo?: string
): Promise<SolanaTxResult> {
  try {
    const connection = getSolanaConnection();

    // Create keypair from private key
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    const fromKeypair = Keypair.fromSecretKey(privateKeyBytes);
    const fromPubkey = fromKeypair.publicKey;
    const toPubkey = new PublicKey(toAddress);

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    // Create transaction
    const transaction = new Transaction({
      feePayer: fromPubkey,
      blockhash,
      lastValidBlockHeight,
    });

    // Add priority fee if specified
    if (priorityFee > 0) {
      const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFee,
      });
      transaction.add(priorityFeeIx);
    }

    // Add transfer instruction
    const transferIx = SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports: solToLamports(amountSOL),
    });
    transaction.add(transferIx);

    // Add memo if provided
    if (memo) {
      const memoIx = {
        keys: [],
        programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
        data: Buffer.from(memo, 'utf-8'),
      };
      transaction.add(memoIx);
    }

    // Sign transaction
    transaction.sign(fromKeypair);

    // Send and confirm
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');

    if (confirmation.value.err) {
      throw new Error('Transaction failed: ' + JSON.stringify(confirmation.value.err));
    }

    const slot = confirmation.context.slot;

    return { signature, slot };
  } catch (error: any) {
    console.error('Failed to send Solana:', error);
    throw new Error(error.message || 'Failed to send SOL transaction');
  }
}

/**
 * Check if account has an Associated Token Account (ATA) for a token
 */
export async function getTokenAccount(
  walletAddress: string,
  mintAddress: string
): Promise<{ exists: boolean; address: string; balance: number }> {
  try {
    const connection = getSolanaConnection();
    const walletPubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(mintAddress);

    // Get associated token address
    const ata = await getAssociatedTokenAddress(
      mintPubkey,
      walletPubkey,
      false,
      TOKEN_PROGRAM_ID
    );

    try {
      // Check if account exists and get balance
      const accountInfo = await getAccount(connection, ata, 'confirmed', TOKEN_PROGRAM_ID);
      
      return {
        exists: true,
        address: ata.toBase58(),
        balance: Number(accountInfo.amount),
      };
    } catch {
      // Account doesn't exist
      return {
        exists: false,
        address: ata.toBase58(),
        balance: 0,
      };
    }
  } catch (error: any) {
    console.error('Failed to get token account:', error);
    throw error;
  }
}

/**
 * Send SPL Token
 */
export async function sendSPLToken(
  privateKeyBase58: string,
  toAddress: string,
  mintAddress: string,
  amount: number,        // Token amount (not raw)
  decimals: number,      // Token decimals
  priorityFee: number = 0,
  memo?: string
): Promise<SolanaTxResult> {
  try {
    const connection = getSolanaConnection();

    // Create keypair from private key
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    const fromKeypair = Keypair.fromSecretKey(privateKeyBytes);
    const fromPubkey = fromKeypair.publicKey;
    const toPubkey = new PublicKey(toAddress);
    const mintPubkey = new PublicKey(mintAddress);

    // Get sender's token account
    const fromTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      fromPubkey,
      false,
      TOKEN_PROGRAM_ID
    );

    // Get recipient's token account
    const toTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      toPubkey,
      false,
      TOKEN_PROGRAM_ID
    );

    // Check if recipient has token account
    const recipientAccount = await getTokenAccount(toAddress, mintAddress);

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    // Create transaction
    const transaction = new Transaction({
      feePayer: fromPubkey,
      blockhash,
      lastValidBlockHeight,
    });

    // Add priority fee if specified
    if (priorityFee > 0) {
      const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFee,
      });
      transaction.add(priorityFeeIx);
    }

    // If recipient doesn't have token account, create it
    if (!recipientAccount.exists) {
      const createAtaIx = createAssociatedTokenAccountInstruction(
        fromPubkey,        // payer
        toTokenAccount,    // associated token account
        toPubkey,          // owner
        mintPubkey,        // mint
        TOKEN_PROGRAM_ID
      );
      transaction.add(createAtaIx);
    }

    // Add transfer instruction
    const rawAmount = amount * Math.pow(10, decimals);
    const transferIx = createTransferInstruction(
      fromTokenAccount,
      toTokenAccount,
      fromPubkey,
      rawAmount,
      [],
      TOKEN_PROGRAM_ID
    );
    transaction.add(transferIx);

    // Add memo if provided
    if (memo) {
      const memoIx = {
        keys: [],
        programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
        data: Buffer.from(memo, 'utf-8'),
      };
      transaction.add(memoIx);
    }

    // Sign transaction
    transaction.sign(fromKeypair);

    // Send and confirm
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');

    if (confirmation.value.err) {
      throw new Error('Transaction failed: ' + JSON.stringify(confirmation.value.err));
    }

    const slot = confirmation.context.slot;

    return { signature, slot };
  } catch (error: any) {
    console.error('Failed to send SPL token:', error);
    throw new Error(error.message || 'Failed to send SPL token');
  }
}

/**
 * Get SPL token balance
 */
export async function getSPLTokenBalance(
  walletAddress: string,
  mintAddress: string
): Promise<number> {
  try {
    const account = await getTokenAccount(walletAddress, mintAddress);
    return account.balance;
  } catch (error) {
    console.error('Failed to get SPL token balance:', error);
    return 0;
  }
}

/**
 * Get token metadata (name, symbol, decimals) from mint
 */
export async function getTokenMetadata(mintAddress: string): Promise<{
  name: string;
  symbol: string;
  decimals: number;
  logoUrl?: string;
} | null> {
  try {
    const connection = getSolanaConnection();
    const mintPubkey = new PublicKey(mintAddress);

    // Get mint info for decimals
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
    
    if (!mintInfo.value || !('parsed' in mintInfo.value.data)) {
      return null;
    }

    const decimals = (mintInfo.value.data as any).parsed.info.decimals;

    // Try to fetch metadata from token list or metadata program
    // For now, return basic info
    return {
      name: `Token ${mintAddress.slice(0, 8)}`,
      symbol: mintAddress.slice(0, 6).toUpperCase(),
      decimals,
    };
  } catch (error) {
    console.error('Failed to get token metadata:', error);
    return null;
  }
}

/**
 * Estimate transaction fee for SOL transfer
 */
export async function estimateSOLTransferFee(
  fromAddress: string,
  priorityFee: number = 0
): Promise<number> {
  try {
    const connection = getSolanaConnection();
    
    // Base signature fee
    const signatureFee = 5000; // lamports (0.000005 SOL)
    
    // Priority fee (if any)
    const totalFee = signatureFee + priorityFee;
    
    return totalFee;
  } catch (error) {
    // Return default if estimation fails
    return 5000 + priorityFee;
  }
}

/**
 * Estimate transaction fee for SPL token transfer
 */
export async function estimateSPLTransferFee(
  fromAddress: string,
  toAddress: string,
  mintAddress: string,
  priorityFee: number = 0
): Promise<{ fee: number; needsATA: boolean }> {
  try {
    // Check if recipient has token account
    const recipientAccount = await getTokenAccount(toAddress, mintAddress);
    
    const signatureFee = 5000; // lamports
    const ataCreationFee = recipientAccount.exists ? 0 : 2039280; // ~0.002 SOL to create ATA
    
    const totalFee = signatureFee + ataCreationFee + priorityFee;
    
    return {
      fee: totalFee,
      needsATA: !recipientAccount.exists,
    };
  } catch (error) {
    console.error('Failed to estimate SPL fee:', error);
    return {
      fee: 5000 + priorityFee,
      needsATA: false,
    };
  }
}
