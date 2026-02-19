export type Chain = 'ethereum' | 'bsc' | 'xrp';

export interface UnsignedTransaction {
  tx: {
    chain: Chain;
    to: string;
    amount: string;
    fee: string;
    nonce?: number;
    gasLimit?: string;
    maxFeePerGas?: string;
    chainId?: number;
    // XRP specific
    destination?: string;
    destinationTag?: number;
    sequence?: number;
  };
  hotShare: string; // hex-encoded Shamir share
}

export interface EncryptedShare {
  id: string;
  encryptedData: string; // hex-encoded IV + ciphertext
  salt: string; // hex-encoded salt
  createdAt: string;
}

export interface ShareMetadata {
  shareNumber: number; // 1, 2, or 3
  totalShares: number; // Always 3
  threshold: number; // Always 2
  fingerprint: string; // First 8 chars of share for verification
}

export type AppStep = 'idle' | 'scanning' | 'preview' | 'auth' | 'signing' | 'complete';

export interface TransactionPreviewData {
  chain: Chain;
  to: string;
  amount: string;
  fee: string;
  additionalInfo?: Record<string, string>;
}
