import { getDb, type MessageRecord } from './db';

export async function saveMessage(msg: MessageRecord): Promise<void> {
  const db = await getDb();
  await db.put('messages', msg);
}

export async function getThread(threadAddress: string): Promise<MessageRecord[]> {
  const db = await getDb();
  const msgs = await db.getAllFromIndex('messages', 'by_thread', threadAddress);
  return msgs.sort((a, b) => a.timestamp - b.timestamp);
}

export async function getLatestPerThread(): Promise<MessageRecord[]> {
  const db = await getDb();
  const all = await db.getAll('messages');
  const latest = new Map<string, MessageRecord>();
  for (const msg of all) {
    const prev = latest.get(msg.threadAddress);
    if (!prev || msg.timestamp > prev.timestamp) {
      latest.set(msg.threadAddress, msg);
    }
  }
  return Array.from(latest.values()).sort((a, b) => b.timestamp - a.timestamp);
}

export async function markDelivered(id: string): Promise<void> {
  const db = await getDb();
  const msg = await db.get('messages', id);
  if (msg) {
    await db.put('messages', { ...msg, status: 'delivered' });
  }
}

export async function deleteThread(threadAddress: string): Promise<void> {
  const db = await getDb();
  const msgs = await db.getAllFromIndex('messages', 'by_thread', threadAddress);
  const tx = db.transaction('messages', 'readwrite');
  await Promise.all(msgs.map(m => tx.store.delete(m.id)));
  await tx.done;
}
