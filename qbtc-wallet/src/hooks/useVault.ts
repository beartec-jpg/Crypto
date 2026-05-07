import { useState, useCallback, useEffect } from 'react';
import { hasWallet, loadWallet } from '../storage/walletStore';
import { deriveVaultKey, decryptSeed } from '../lib/vault';

export type VaultState =
  | { status: 'loading' }
  | { status: 'no-wallet' }
  | { status: 'locked' }
  | { status: 'unlocked'; masterSeed: Uint8Array; qbtcAddress: string };

let _globalMasterSeed: Uint8Array | null = null;
let _lockTimer: ReturnType<typeof setTimeout> | null = null;

const AUTO_LOCK_MS = 5 * 60 * 1000; // 5 minutes

export function useVault() {
  const [state, setState] = useState<VaultState>({ status: 'loading' });

  useEffect(() => {
    (async () => {
      const exists = await hasWallet();
      if (!exists) {
        setState({ status: 'no-wallet' });
      } else if (_globalMasterSeed) {
        const record = await loadWallet();
        setState({ status: 'unlocked', masterSeed: _globalMasterSeed, qbtcAddress: record?.qbtcAddress ?? '' });
      } else {
        setState({ status: 'locked' });
      }
    })();
  }, []);

  const unlock = useCallback(async (pin: string): Promise<boolean> => {
    try {
      const record = await loadWallet();
      if (!record) return false;
      const vaultKey = await deriveVaultKey(pin, record.saltHex);
      const seed = await decryptSeed(record.encryptedSeed, record.seedIv, vaultKey);
      _globalMasterSeed = seed;
      setState({ status: 'unlocked', masterSeed: seed, qbtcAddress: record.qbtcAddress });
      resetLockTimer();
      return true;
    } catch {
      return false;
    }
  }, []);

  const lock = useCallback(() => {
    _globalMasterSeed = null;
    if (_lockTimer) clearTimeout(_lockTimer);
    setState({ status: 'locked' });
  }, []);

  const setUnlocked = useCallback((seed: Uint8Array, address: string) => {
    _globalMasterSeed = seed;
    setState({ status: 'unlocked', masterSeed: seed, qbtcAddress: address });
    resetLockTimer();
  }, []);

  function resetLockTimer() {
    if (_lockTimer) clearTimeout(_lockTimer);
    _lockTimer = setTimeout(() => {
      _globalMasterSeed = null;
      setState({ status: 'locked' });
    }, AUTO_LOCK_MS);
  }

  return { state, unlock, lock, setUnlocked };
}
