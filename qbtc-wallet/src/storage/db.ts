import { openDB, type IDBPDatabase } from 'idb';

/**
 * WalletRecord — single row keyed by 'main'.
 *
 * walletType discriminates three modes:
 *   undefined / 'legacy' — old PIN/PBKDF2 record, detected for one-time migration
 *   'passkey'            — passkey PRF vault (normal hot wallet)
 *   'watch-only'         — cold signer mode, pub keys only, no signing on this device
 */
export interface WalletRecord {
  id: 'main';
  walletType?: 'legacy' | 'passkey' | 'watch-only';
  qbtcAddress: string;
  createdAt: number;

  // Passkey fields (walletType === 'passkey')
  credentialIdB64?: string;   // base64url-encoded credential ID
  rpId?: string;              // relying-party domain used at registration

  // Watch-only fields (walletType === 'watch-only')
  ecdsaPubHex?: string;       // compressed 33-byte ECDSA pub key (hex)
  falconPubHex?: string;      // Falcon-512 pub key (hex)
  network?: 'testnet' | 'mainnet';

  // Legacy PIN fields — present only before migration, cleared afterwards
  encryptedSeed?: string;
  seedIv?: string;
  saltHex?: string;
}

/** Returns true if the record is a pre-passkey PIN-encrypted wallet */
export function isLegacyRecord(r: WalletRecord): boolean {
  return !r.walletType || r.walletType === 'legacy' || !!r.encryptedSeed;
}

export interface ContactRecord {
  address: string;         // qBTC address (primary key)
  name: string;
  addedAt: number;
  lastSeen?: number;
  pubKeyHex?: string;      // ECDH P-256 public key (hex) for E2E messaging
}

export interface MessageRecord {
  id: string;              // uuid
  threadAddress: string;   // the other party's qBTC address (index)
  direction: 'sent' | 'received';
  encryptedPayload: string; // base64 ciphertext stored locally
  plaintextPreview?: string; // first 60 chars cached in plaintext for list view
  timestamp: number;
  status: 'queued' | 'sent' | 'delivered';
}

export type AppDB = {
  wallet: WalletRecord;
  contacts: ContactRecord;
  messages: MessageRecord;
};

let _db: IDBPDatabase<AppDB> | null = null;

export async function getDb(): Promise<IDBPDatabase<AppDB>> {
  if (_db) return _db;
  // Version stays at 1 — object store structure unchanged, only record shape evolves.
  _db = await openDB<AppDB>('qbtc-wallet', 1, {
    upgrade(db) {
      // wallet – single-row store
      if (!db.objectStoreNames.contains('wallet')) {
        db.createObjectStore('wallet', { keyPath: 'id' });
      }
      // contacts – keyed by qBTC address
      if (!db.objectStoreNames.contains('contacts')) {
        db.createObjectStore('contacts', { keyPath: 'address' });
      }
      // messages – auto-increment id, index on threadAddress+timestamp for chat queries
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('by_thread', 'threadAddress');
        msgStore.createIndex('by_thread_time', ['threadAddress', 'timestamp']);
      }
    },
  });
  return _db;
}
