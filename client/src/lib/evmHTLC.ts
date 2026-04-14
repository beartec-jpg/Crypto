/**
 * evmHTLC.ts
 *
 * Client-side wrapper for the HashedTimelockERC20 contract.
 *
 * The contract ABI used here is compatible with the widely-audited
 * HashTimeLock ERC-20 pattern (e.g. https://github.com/chatch/hashed-timelock-contract-ethereum).
 *
 * All addresses and RPC endpoints come from the swap config — nothing is
 * hardcoded here so the same code runs on testnet (Sepolia) and mainnet by
 * changing env vars.
 */

import { ethers } from 'ethers';

// Minimal ABI covering the four interactions the swap needs.
const HTLC_ABI = [
  // initiate: lock tokens, returns bytes32 contractId
  'function newContract(address receiver, bytes32 hashlock, uint256 timelock, address tokenContract, uint256 amount) payable returns (bytes32 contractId)',
  // claim: reveal preimage, transfer tokens to receiver
  'function withdraw(bytes32 contractId, bytes32 preimage) returns (bool)',
  // refund after timelock
  'function refund(bytes32 contractId) returns (bool)',
  // view
  'function getContract(bytes32 contractId) view returns (address sender, address receiver, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, bytes32 preimage)',
  // events
  'event HTLCERC20New(bytes32 indexed contractId, address indexed sender, address indexed receiver, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock)',
  'event HTLCERC20Withdraw(bytes32 indexed contractId)',
  'event HTLCERC20Refund(bytes32 indexed contractId)',
] as const;

const ERC20_APPROVE_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
] as const;

export interface EvmHTLCConfig {
  /** Address of the HashedTimelockERC20 contract */
  contractAddress: string;
  /** USDC token contract address */
  usdcAddress: string;
  /** An ethers.js Provider or Signer */
  signerOrProvider: ethers.Signer | ethers.Provider;
}

export interface HTLCContractDetails {
  sender: string;
  receiver: string;
  tokenContract: string;
  amount: bigint;
  hashlock: string;
  timelock: bigint;
  withdrawn: boolean;
  refunded: boolean;
  preimage: string;
}

export class EvmHTLC {
  private contract: ethers.Contract;
  private config: EvmHTLCConfig;

  constructor(config: EvmHTLCConfig) {
    this.config = config;
    this.contract = new ethers.Contract(config.contractAddress, HTLC_ABI, config.signerOrProvider);
  }

  /**
   * Approve the HTLC contract to spend USDC, then lock the tokens.
   *
   * @param receiverAddress  EVM address of the party who can claim with the secret
   * @param hashlockHex      32-byte SHA-256 hash of the secret, hex-encoded (no 0x prefix)
   * @param timelockUnix     Unix timestamp after which the sender can refund
   * @param usdcAmount       Amount of USDC in base units (6 decimals, so 1 USDC = 1_000_000n)
   * @returns contractId     bytes32 hex string identifying this HTLC
   */
  async initiate(
    receiverAddress: string,
    hashlockHex: string,
    timelockUnix: number,
    usdcAmount: bigint,
  ): Promise<string> {
    const signer = this.config.signerOrProvider as ethers.Signer;
    const usdcToken = new ethers.Contract(this.config.usdcAddress, ERC20_APPROVE_ABI, signer);

    // Ensure approval
    const signerAddress = await signer.getAddress();
    const allowance: bigint = await usdcToken.allowance(signerAddress, this.config.contractAddress);
    if (allowance < usdcAmount) {
      const approveTx = await usdcToken.approve(this.config.contractAddress, usdcAmount);
      await approveTx.wait();
    }

    const hashlock = hashlockHex.startsWith('0x') ? hashlockHex : `0x${hashlockHex}`;
    const tx = await this.contract.newContract(
      receiverAddress,
      hashlock,
      BigInt(timelockUnix),
      this.config.usdcAddress,
      usdcAmount,
    );
    const receipt = await tx.wait();

    // Extract contractId from the HTLCERC20New event
    const iface = new ethers.Interface(HTLC_ABI);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === 'HTLCERC20New') {
          return parsed.args.contractId as string;
        }
      } catch {
        // not this event
      }
    }
    throw new Error('HTLCERC20New event not found in transaction receipt');
  }

  /**
   * Claim the locked USDC by revealing the preimage (secret).
   */
  async withdraw(contractId: string, secretHex: string): Promise<ethers.TransactionReceipt> {
    const preimage = secretHex.startsWith('0x') ? secretHex : `0x${secretHex}`;
    const id = contractId.startsWith('0x') ? contractId : `0x${contractId}`;
    const tx = await this.contract.withdraw(id, preimage);
    return tx.wait();
  }

  /**
   * Refund the locked USDC back to sender after the timelock has expired.
   */
  async refund(contractId: string): Promise<ethers.TransactionReceipt> {
    const id = contractId.startsWith('0x') ? contractId : `0x${contractId}`;
    const tx = await this.contract.refund(id);
    return tx.wait();
  }

  /**
   * Retrieve the current on-chain state of an HTLC.
   */
  async getContractDetails(contractId: string): Promise<HTLCContractDetails> {
    const id = contractId.startsWith('0x') ? contractId : `0x${contractId}`;
    const result = await this.contract.getContract(id);
    return {
      sender: result[0] as string,
      receiver: result[1] as string,
      tokenContract: result[2] as string,
      amount: result[3] as bigint,
      hashlock: result[4] as string,
      timelock: result[5] as bigint,
      withdrawn: result[6] as boolean,
      refunded: result[7] as boolean,
      preimage: result[8] as string,
    };
  }

  /**
   * Watch for a Withdraw event on the contract, returning the revealed secret.
   * Resolves when the event is seen or rejects after `timeoutMs`.
   */
  watchForWithdrawal(contractId: string, timeoutMs = 3_600_000): Promise<string> {
    const id = contractId.startsWith('0x') ? contractId : `0x${contractId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.contract.off('HTLCERC20Withdraw', handler);
        reject(new Error('Timeout waiting for HTLC withdrawal'));
      }, timeoutMs);

      const handler = (emittedId: string, ...rest: unknown[]) => {
        if (emittedId.toLowerCase() !== id.toLowerCase()) return;
        clearTimeout(timer);
        this.contract.off('HTLCERC20Withdraw', handler);
        // Fetch the contract details to get the revealed preimage
        this.getContractDetails(id).then((details) => resolve(details.preimage)).catch(reject);
      };

      this.contract.on('HTLCERC20Withdraw', handler);

      // Also poll once in case the event was already emitted
      this.getContractDetails(id).then((details) => {
        if (details.withdrawn && details.preimage !== ethers.ZeroHash) {
          clearTimeout(timer);
          this.contract.off('HTLCERC20Withdraw', handler);
          resolve(details.preimage);
        }
      }).catch(() => {/* ignore initial poll errors */});
    });
  }
}

// ─── Swap network configuration ─────────────────────────────────────────────

export type SwapNetwork = 'testnet' | 'mainnet';

export interface SwapNetworkConfig {
  network: SwapNetwork;
  evmRpcUrl: string;
  htlcContractAddress: string;
  usdcContractAddress: string;
  evmChainId: number;
}

/**
 * Returns the swap network config from environment variables.
 *
 * Environment variables (set in .env / Vercel project settings):
 *   VITE_SWAP_NETWORK              = testnet | mainnet  (default: testnet)
 *   VITE_EVM_RPC_URL               = RPC URL for the EVM chain
 *   VITE_EVM_HTLC_CONTRACT         = HashedTimelockERC20 contract address
 *   VITE_USDC_CONTRACT             = USDC token contract address
 *   VITE_EVM_CHAIN_ID              = chain ID (11155111 for Sepolia, 1 for mainnet)
 */
export function getSwapNetworkConfig(): SwapNetworkConfig {
  const network = (import.meta.env.VITE_SWAP_NETWORK || 'testnet') as SwapNetwork;

  if (network === 'mainnet') {
    const evmRpcUrl = import.meta.env.VITE_EVM_RPC_URL || '';
    const htlcContractAddress = import.meta.env.VITE_EVM_HTLC_CONTRACT || '';
    const usdcContractAddress = import.meta.env.VITE_USDC_CONTRACT || '';

    if (!evmRpcUrl) throw new Error('VITE_EVM_RPC_URL must be set for mainnet');
    if (!htlcContractAddress) throw new Error('VITE_EVM_HTLC_CONTRACT must be set for mainnet');
    if (!usdcContractAddress) throw new Error('VITE_USDC_CONTRACT must be set for mainnet');

    return {
      network: 'mainnet',
      evmRpcUrl,
      htlcContractAddress,
      usdcContractAddress,
      evmChainId: Number(import.meta.env.VITE_EVM_CHAIN_ID || 1),
    };
  }

  // Sepolia testnet defaults
  return {
    network: 'testnet',
    evmRpcUrl: import.meta.env.VITE_EVM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
    htlcContractAddress: import.meta.env.VITE_EVM_HTLC_CONTRACT || '',
    usdcContractAddress: import.meta.env.VITE_USDC_CONTRACT || '',
    evmChainId: Number(import.meta.env.VITE_EVM_CHAIN_ID || 11155111),
  };
}

export function isSwapMainnetActive(): boolean {
  return (import.meta.env.VITE_SWAP_NETWORK || 'testnet') === 'mainnet';
}
