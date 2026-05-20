/**
 * Cold signer IndexedDB storage — passkey-based.
 *
 * Replaces the old Shamir-share + password scheme.
 * The master seed is never stored on disk; only the credentialId is persisted.
 * The seed is re-derived from the passkey PRF on every unlock.
 *
 * DB: 'qbtc-cold-signer', version 2
 * Stores:
 *   wallet  — single row: credentialId, qBTC address, public keys, network
 */

import { openDB, type IDBPDatabase } from 'idb';

export interface ColdWalletRecord {
  id: 'main';
  credentialIdB64: string;       // base64url(credentialId) — used to select passkey
  rpId: string;                  // relying-party ID used at registration
  qbtcAddress: string;
  ecdsaPubHex: string;           // compressed 33-byte ECDSA pub key (hex)
  falconPubHex: string;          // Falcon-512 pub key (hex, ~897 bytes → ~1794 hex chars)
  network: 'testnet' | 'mainnet';
  createdAt: number;
}

type ColdDB = {
  wallet: ColdWalletRecord;
};

let _db: IDBPDatabase<ColdDB> | null = null;

async function getDb(): Promise<IDBPDatabase<ColdDB>> {
  if (_db) return _db;
  _db = await openDB<ColdDB>('qbtc-cold-signer', 2, {
    upgrade(db, oldVersion) {
      // v1: old shares store — keep for now so we can warn if it exists
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('wallet')) {
          db.createObjectStore('wallet', { keyPath: 'id' });
        }
      }
    },
  });
  return _db;
}

export async function hasColdWallet(): Promise<boolean> {
  const db = await getDb();
  const record = await db.get('wallet', 'main');
  return !!record;
}

export async function saveColdWallet(record: ColdWalletRecord): Promise<void> {
  const db = await getDb();
  await db.put('wallet', record);
}

export async function loadColdWallet(): Promise<ColdWalletRecord | null> {
  const db = await getDb();
  return (await db.get('wallet', 'main')) ?? null;
}

export async function deleteColdWallet(): Promise<void> {
  const db = await getDb();
  await db.delete('wallet', 'main');
}
