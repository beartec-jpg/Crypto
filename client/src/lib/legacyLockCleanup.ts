/** Legacy bridge lock (v1, no withdraw) — testnet cleanup only. */

export const LEGACY_LOCK_CONTRACT = '0x05712e9BC202cE3F1E601caCb1C82fc3AC9D8651'

/** Sepolia passkey wallet that originally deposited (qXRP-faucet-wallet). */
export const LEGACY_RELEASE_RECIPIENT = '0x0521ddA874C45A8A6a93311Bc0A206678134f937'

export const LEGACY_DEPOSITS = [
  {
    depositId: '0xb6d5bbad08bf478711907c2da000e671ca538e6c985087796b75701309c32a1b',
    amountUsdc: 5,
  },
  {
    depositId: '0x1bf16a7396c5ffdc60d2014bb1e15e100fcbb322e7d9af44573eb3da7636b04e',
    amountUsdc: 75,
  },
] as const

export const FALCON_QUC_ISSUER = 'rfftKWuA7Dk7PF1YrH8NA7262oY3tejhqt'

export const LEGACY_LOCK_RELEASE_ABI = [
  'function release(bytes32 depositId, address recipient)',
  'function owner() view returns (address)',
] as const