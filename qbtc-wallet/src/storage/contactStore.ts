import { getDb, type ContactRecord } from './db';

export async function addContact(contact: ContactRecord): Promise<void> {
  const db = await getDb();
  await db.put('contacts', contact);
}

export async function listContacts(): Promise<ContactRecord[]> {
  const db = await getDb();
  return db.getAll('contacts');
}

export async function getContact(address: string): Promise<ContactRecord | undefined> {
  const db = await getDb();
  return db.get('contacts', address);
}

export async function deleteContact(address: string): Promise<void> {
  const db = await getDb();
  await db.delete('contacts', address);
}

export async function updateLastSeen(address: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('contacts', address);
  if (existing) {
    await db.put('contacts', { ...existing, lastSeen: Date.now() });
  }
}
