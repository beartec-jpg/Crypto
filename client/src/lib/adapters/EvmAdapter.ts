/**
 * EvmAdapter.ts
 *
 * IChainAdapter implementation for EVM-compatible chains:
 *   - USDC  — ERC-20 HTLC via HashedTimelockERC20 (already deployed)
 *   - ETH   — Native ETH HTLC via HashedTimelockETH (deployed in Phase 4)
 *   - BNB   — Native ETH HTLC via HashedTimelockETH on BSC (deployed in Phase 4)
 *
 * Contract ABIs are compatible with the widely-used hashed-timelock-contract-ethereum
 * pattern.  The ERC-20 contract is the same one already live for QBTC↔USDC swaps.
 *
 * Environment / config keys (passed via EvmAdapterConfig):
 *   htlcContractAddress  — deployed HashedTimelockERC20 or HashedTimelockETH address
 *   tokenAddress         — ERC-20 token address (USDC only; omit for native ETH/BNB)
 *   rpcUrl               — JSON-RPC endpoint for this chain
 */

import { ethers } from 'ethers';
import type { IChainAdapter, LockParams, LockResult, ClaimParams, RefundParams, ChainId } from './IChainAdapter.ts';

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const ERC20_HTLC_ABI = [
  'function newContract(address receiver, bytes32 hashlock, uint256 timelock, address tokenContract, uint256 amount) returns (bytes32 contractId)',
  'function withdraw(bytes32 contractId, bytes32 preimage) returns (bool)',
  'function refund(bytes32 contractId) returns (bool)',
  'function getContract(bytes32 contractId) view returns (address sender, address receiver, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, bytes32 preimage)',
  'event HTLCERC20New(bytes32 indexed contractId, address indexed sender, address indexed receiver, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock)',
  'event HTLCERC20Withdraw(bytes32 indexed contractId)',
  'event HTLCERC20Refund(bytes32 indexed contractId)',
] as const;

/** ABI for HashedTimelockETH — native ETH, no token address (deployed in Phase 4) */
const NATIVE_ETH_HTLC_ABI = [
  'function newContract(address receiver, bytes32 hashlock, uint256 timelock) payable returns (bytes32 contractId)',
  'function withdraw(bytes32 contractId, bytes32 preimage) returns (bool)',
  'function refund(bytes32 contractId) returns (bool)',
  'function getContract(bytes32 contractId) view returns (address sender, address receiver, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, bytes32 preimage)',
  'event HTLCNew(bytes32 indexed contractId, address indexed sender, address indexed receiver, uint256 amount, bytes32 hashlock, uint256 timelock)',
  'event HTLCWithdraw(bytes32 indexed contractId)',
  'event HTLCRefund(bytes32 indexed contractId)',
] as const;

const ERC20_APPROVE_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
] as const;

// ─── Config ───────────────────────────────────────────────────────────────────

export interface EvmAdapterConfig {
  /** 'USDC', 'ETH', or 'BNB' */
  chain: ChainId;
  /** Address of the deployed HTLC contract */
  htlcContractAddress: string;
  /**
   * ERC-20 token contract address.
   * Required for USDC (and any future ERC-20 tokens).
   * Omit (or leave empty) for native ETH / BNB.
   */
  tokenAddress?: string;
  /** JSON-RPC URL for this EVM network */
  rpcUrl: string;
  /** EVM chain ID (used for signing validation) */
  chainId: number;
  /** ERC-20 token decimals.  Defaults to 6 (USDC). */
  tokenDecimals?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toHex32(hex: string): string {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length !== 64) throw new Error(`Expected 32-byte hex, got ${h.length / 2} bytes`);
  return `0x${h.toLowerCase()}`;
}

function toContractId(id: string): string {
  return id.startsWith('0x') ? id : `0x${id}`;
}

/** Parse amount decimal string → bigint in token base units */
function parseAmount(amount: string, decimals: number): bigint {
  const [whole = '0', frac = ''] = amount.split('.');
  if (frac.length > decimals) throw new Error(`Too many decimal places for amount: ${amount}`);
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
}

/** Extract contractId from a transaction receipt by scanning event logs */
function extractContractId(receipt: ethers.TransactionReceipt, isNative: boolean): string {
  const iface = new ethers.Interface(isNative ? NATIVE_ETH_HTLC_ABI : ERC20_HTLC_ABI);
  const eventName = isNative ? 'HTLCNew' : 'HTLCERC20New';
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: Array.from(log.topics), data: log.data });
      if (parsed?.name === eventName) {
        return parsed.args.contractId as string;
      }
    } catch {
      // not this event
    }
  }
  throw new Error(`${eventName} event not found in transaction receipt`);
}

// ─── EvmAdapter ───────────────────────────────────────────────────────────────

export class EvmAdapter implements IChainAdapter {
  readonly chain: ChainId;
  private readonly config: EvmAdapterConfig;
  private readonly isNative: boolean;
  private readonly decimals: number;

  constructor(config: EvmAdapterConfig) {
    this.chain = config.chain;
    this.config = config;
    this.isNative = config.chain === 'ETH' || config.chain === 'BNB';
    this.decimals = config.tokenDecimals ?? 6;

    if (!this.isNative && !config.tokenAddress) {
      throw new Error(`EvmAdapter: tokenAddress is required for ERC-20 chain "${config.chain}"`);
    }
    if (!config.htlcContractAddress) {
      throw new Error(`EvmAdapter: htlcContractAddress is required for chain "${config.chain}"`);
    }
  }

  // ── lockFunds ───────────────────────────────────────────────────────────────

  async lockFunds(params: LockParams): Promise<LockResult> {
    const signer = params.signerKey as ethers.Signer;
    if (!signer || typeof signer.sendTransaction !== 'function') {
      throw new Error('EvmAdapter.lockFunds: signerKey must be an ethers.Signer');
    }

    const hashlock = toHex32(params.secretHash);
    const timelockUnix = BigInt(Math.floor(Date.now() / 1000) + params.timelockSecs);
    const amountUnits = parseAmount(params.amount, this.decimals);

    let contractId: string;

    if (this.isNative) {
      // HashedTimelockETH — payable, no token approval needed
      const htlc = new ethers.Contract(
        this.config.htlcContractAddress,
        NATIVE_ETH_HTLC_ABI,
        signer,
      );

      const tx = await htlc.newContract(
        params.counterpartyAddress,
        hashlock,
        timelockUnix,
        { value: amountUnits },
      );
      const receipt: ethers.TransactionReceipt = await tx.wait();
      contractId = extractContractId(receipt, true);
    } else {
      // HashedTimelockERC20 — ERC-20 approve + newContract
      const tokenContract = new ethers.Contract(
        this.config.tokenAddress!,
        ERC20_APPROVE_ABI,
        signer,
      );
      const signerAddress = await signer.getAddress();
      const allowance: bigint = await tokenContract.allowance(
        signerAddress,
        this.config.htlcContractAddress,
      );
      if (allowance < amountUnits) {
        const approveTx = await tokenContract.approve(
          this.config.htlcContractAddress,
          amountUnits,
        );
        await approveTx.wait();
      }

      const htlc = new ethers.Contract(
        this.config.htlcContractAddress,
        ERC20_HTLC_ABI,
        signer,
      );
      const tx = await htlc.newContract(
        params.counterpartyAddress,
        hashlock,
        timelockUnix,
        this.config.tokenAddress,
        amountUnits,
      );
      const receipt: ethers.TransactionReceipt = await tx.wait();
      contractId = extractContractId(receipt, false);
    }

    return { lockId: contractId };
  }

  // ── claimFunds ──────────────────────────────────────────────────────────────

  async claimFunds(params: ClaimParams): Promise<string> {
    const signer = params.signerKey as ethers.Signer;
    if (!signer || typeof signer.sendTransaction !== 'function') {
      throw new Error('EvmAdapter.claimFunds: signerKey must be an ethers.Signer');
    }

    const abi = this.isNative ? NATIVE_ETH_HTLC_ABI : ERC20_HTLC_ABI;
    const htlc = new ethers.Contract(this.config.htlcContractAddress, abi, signer);
    const contractId = toContractId(params.lockId);
    const preimage = toHex32(params.secret);

    const tx = await htlc.withdraw(contractId, preimage);
    const receipt: ethers.TransactionReceipt = await tx.wait();
    return receipt.hash;
  }

  // ── refundFunds ─────────────────────────────────────────────────────────────

  async refundFunds(params: RefundParams): Promise<string> {
    const signer = params.signerKey as ethers.Signer;
    if (!signer || typeof signer.sendTransaction !== 'function') {
      throw new Error('EvmAdapter.refundFunds: signerKey must be an ethers.Signer');
    }

    const abi = this.isNative ? NATIVE_ETH_HTLC_ABI : ERC20_HTLC_ABI;
    const htlc = new ethers.Contract(this.config.htlcContractAddress, abi, signer);
    const contractId = toContractId(params.lockId);

    const tx = await htlc.refund(contractId);
    const receipt: ethers.TransactionReceipt = await tx.wait();
    return receipt.hash;
  }
}

// ─── Well-known config factories ──────────────────────────────────────────────

/**
 * Build an EvmAdapterConfig from environment variables.
 *
 * Required env vars per chain:
 *   USDC: VITE_EVM_HTLC_CONTRACT, VITE_USDC_CONTRACT, VITE_EVM_RPC_URL
 *   ETH:  VITE_ETH_HTLC_CONTRACT, VITE_ETH_RPC_URL
 *   BNB:  VITE_BNB_HTLC_CONTRACT, VITE_BNB_RPC_URL
 */
export function getEvmAdapterConfig(chain: 'USDC' | 'ETH' | 'BNB'): EvmAdapterConfig {
  switch (chain) {
    case 'USDC': {
      const htlcContractAddress =
        import.meta.env.VITE_EVM_HTLC_CONTRACT ||
        '0xaF898a5F565c0cAE1746122ad475c0B7F160A3eb'; // Sepolia testnet fallback
      const tokenAddress =
        import.meta.env.VITE_USDC_CONTRACT ||
        '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia testnet USDC
      const rpcUrl =
        import.meta.env.VITE_EVM_RPC_URL ||
        'https://ethereum-sepolia-rpc.publicnode.com';
      return {
        chain: 'USDC',
        htlcContractAddress,
        tokenAddress,
        rpcUrl,
        chainId: Number(import.meta.env.VITE_EVM_CHAIN_ID || 11155111),
        tokenDecimals: 6,
      };
    }
    case 'ETH': {
      const htlcContractAddress = import.meta.env.VITE_ETH_HTLC_CONTRACT || '';
      const rpcUrl = import.meta.env.VITE_ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com';
      if (!htlcContractAddress) {
        throw new Error('VITE_ETH_HTLC_CONTRACT is not set — deploy HashedTimelockETH first (Phase 4)');
      }
      return {
        chain: 'ETH',
        htlcContractAddress,
        rpcUrl,
        chainId: Number(import.meta.env.VITE_ETH_CHAIN_ID || 1),
        tokenDecimals: 18,
      };
    }
    case 'BNB': {
      const htlcContractAddress = import.meta.env.VITE_BNB_HTLC_CONTRACT || '';
      const rpcUrl = import.meta.env.VITE_BNB_RPC_URL || 'https://bsc-dataseed.bnbchain.org';
      if (!htlcContractAddress) {
        throw new Error('VITE_BNB_HTLC_CONTRACT is not set — deploy HashedTimelockETH on BSC first (Phase 4)');
      }
      return {
        chain: 'BNB',
        htlcContractAddress,
        rpcUrl,
        chainId: Number(import.meta.env.VITE_BNB_CHAIN_ID || 56),
        tokenDecimals: 18,
      };
    }
  }
}
