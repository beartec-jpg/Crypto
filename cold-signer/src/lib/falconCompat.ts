import { sha256 } from '@noble/hashes/sha256';
import type { FalconKernel } from 'falcon-sign';

const FALCON_KERNEL_ID = 'falcon512_n3_v1';
let kernelPromise: Promise<FalconKernel> | null = null;

async function getFalconKernel(): Promise<FalconKernel> {
  if (!kernelPromise) {
    kernelPromise = (async () => {
      const mod = await import('falcon-sign');
      const getKernel =
        typeof (mod as any).getKernel === 'function'
          ? (mod as any).getKernel
          : typeof (mod as any).default?.getKernel === 'function'
            ? (mod as any).default.getKernel
            : null;
      if (typeof getKernel !== 'function') {
        throw new Error('falcon-sign module does not export getKernel');
      }
      const kernel = await getKernel(FALCON_KERNEL_ID);
      if (!kernel) throw new Error(`Unsupported Falcon kernel: ${FALCON_KERNEL_ID}`);
      return kernel as FalconKernel;
    })();
  }
  return kernelPromise;
}

function expandSeed(masterSeed: Uint8Array, targetLength: number, label: string): Uint8Array {
  const labelBytes = new TextEncoder().encode(label);
  const out = new Uint8Array(targetLength);
  let written = 0;
  let counter = 0;

  while (written < targetLength) {
    const input = new Uint8Array(masterSeed.length + labelBytes.length + 1);
    input.set(masterSeed, 0);
    input.set(labelBytes, masterSeed.length);
    input[input.length - 1] = counter & 0xff;
    const block = sha256(input);
    const chunk = Math.min(block.length, targetLength - written);
    out.set(block.slice(0, chunk), written);
    written += chunk;
    counter += 1;
  }

  return out;
}

export interface FalconCompatibilityProof {
  algorithm: 'falcon-512-staged-compat';
  mode: 'offchain-sidecar';
  messageDigestHex: string;
  falconPublicKeyHex: string;
  falconSignatureHex: string;
  note: string;
}

export async function createQBTCFalconCompatibilityProof(
  ecdsaPriv: Uint8Array,
  dilSeed: Uint8Array,
  messageDigest: Uint8Array
): Promise<FalconCompatibilityProof> {
  const kernel = await getFalconKernel();
  const master = new Uint8Array(ecdsaPriv.length + dilSeed.length);
  master.set(ecdsaPriv, 0);
  master.set(dilSeed, ecdsaPriv.length);
  const falconSeed = expandSeed(master, kernel.genkeySeedByte, 'QBTC-FALCON-COMPAT');
  const keyPair = kernel.genkey(falconSeed);
  if (!keyPair) {
    throw new Error('Falcon compatibility key generation failed');
  }
  const sig = kernel.sign(messageDigest, keyPair.sk);
  if (!sig) {
    throw new Error('Falcon compatibility signing failed');
  }
  return {
    algorithm: 'falcon-512-staged-compat',
    mode: 'offchain-sidecar',
    messageDigestHex: Buffer.from(messageDigest).toString('hex'),
    falconPublicKeyHex: Buffer.from(keyPair.pk).toString('hex'),
    falconSignatureHex: Buffer.from(sig).toString('hex'),
    note: 'Staged compatibility proof only. QBTC consensus witness remains ML-DSA-44 + ECDSA until protocol upgrade.',
  };
}
