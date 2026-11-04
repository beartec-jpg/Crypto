// Injected EIP-1193 browser wallet provider (e.g. a wallet browser extension).
// Previously typed transitively via wagmi/@metamask/sdk, which have been removed.
interface Window {
  ethereum?: unknown;
}
