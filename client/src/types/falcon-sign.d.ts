declare module 'falcon-sign' {
  export interface FalconKernel {
    algid: string;
    genkeySeedByte: number;
    skByte: number;
    pkByte: number;
    signByte: number;
    signSaltByte: number;
    signNonceByte: number;
    genkey(genkeySeed?: Uint8Array): { genkeySeed: Uint8Array; pk: Uint8Array; sk: Uint8Array } | undefined;
    publicKeyCreate(sk: Uint8Array): Uint8Array | undefined;
    sign(message: Uint8Array | string, sk: Uint8Array, salt?: Uint8Array): Uint8Array | undefined;
    verify(signMsg: Uint8Array, message: Uint8Array | string, pk: Uint8Array): boolean;
  }

  export function getKernel(algid: string): Promise<FalconKernel> | FalconKernel | undefined;
  export function getKernelNameList(): string[];
}
