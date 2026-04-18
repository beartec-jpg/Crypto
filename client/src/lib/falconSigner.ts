import type { FalconKernel } from 'falcon-sign';

// falcon-sign exposes versioned kernel IDs. "n3" is the upstream kernel flavor
// identifier used by the library package (falcon512_n3_v1 / falcon1024_n3_v1).
const FALCON_KERNEL_ID = 'falcon512_n3_v1';
let kernelPromise: Promise<FalconKernel> | null = null;

function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data;
}

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
      if (!kernel) {
        throw new Error(`Unsupported Falcon kernel: ${FALCON_KERNEL_ID}`);
      }
      return kernel as FalconKernel;
    })();
  }
  return kernelPromise;
}

export interface FalconKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  seed: Uint8Array;
}

export async function getFalconSeedLength(): Promise<number> {
  const kernel = await getFalconKernel();
  return kernel.genkeySeedByte;
}

export async function generateFalconKeyPair(seed?: Uint8Array): Promise<FalconKeyPair> {
  const kernel = await getFalconKernel();
  const keyPair = kernel.genkey(seed);
  if (!keyPair) {
    throw new Error('Falcon key generation failed');
  }
  return {
    publicKey: keyPair.pk,
    secretKey: keyPair.sk,
    seed: keyPair.genkeySeed,
  };
}

export async function falconSign(message: Uint8Array | string, secretKey: Uint8Array): Promise<Uint8Array> {
  const kernel = await getFalconKernel();
  const signature = kernel.sign(toBytes(message), secretKey);
  if (!signature) {
    throw new Error('Falcon signing failed');
  }
  return signature;
}

export async function falconVerify(
  signature: Uint8Array,
  message: Uint8Array | string,
  publicKey: Uint8Array
): Promise<boolean> {
  const kernel = await getFalconKernel();
  return kernel.verify(signature, toBytes(message), publicKey);
}
