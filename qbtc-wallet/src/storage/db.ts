import { openDB, type IDBPDatabase } from 'idb';

export interface WalletRecord {
  id: 'main'; // single wallet per PWA install
  encryptedSeed: string;   // AES-256-GCM encrypted master seed (base64)
  seedIv: string;          // IV for seed encryption (base64)
  saltHex: string;         // PBKDF2 salt (hex)
  qbtcAddress: string;     // derived qBTC testnet address
  createdAt: number;
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
