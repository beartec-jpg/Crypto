import { useState, useEffect, useCallback, useRef } from 'react';
import { saveMessage, getThread, getLatestPerThread } from '../storage/messageStore';
import { pollRelayMessages, sendRelayMessage, encryptMessage, decryptMessage, deriveSharedKey } from '../lib/messaging';
import type { MessageRecord } from '../storage/db';

export interface ThreadSummary {
  address: string;
  lastMessage: MessageRecord;
}

const POLL_INTERVAL_MS = 8_000;

export function useMessages(
  myAddress: string | null,
  myPrivateKey: CryptoKey | null,
  getContactPublicKey: (address: string) => Uint8Array | undefined,
) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const lastPollRef = useRef<number>(Date.now() - POLL_INTERVAL_MS);

  const refreshThreads = useCallback(async () => {
    const latest = await getLatestPerThread();
    setThreads(
      latest.map(msg => ({ address: msg.threadAddress, lastMessage: msg })),
    );
  }, []);

  // Poll for incoming messages
  useEffect(() => {
    if (!myAddress || !myPrivateKey) return;

    const poll = async () => {
      const since = lastPollRef.current;
      lastPollRef.current = Date.now();
      try {
        const incoming = await pollRelayMessages(myAddress, since);
        for (const relayMsg of incoming) {
          const theirPubKey = getContactPublicKey(relayMsg.from);
          if (!theirPubKey) continue; // unknown sender — skip
          try {
            const sharedKey = await deriveSharedKey(myPrivateKey, theirPubKey);
            const plaintext = await decryptMessage(relayMsg.payload, sharedKey);
            const record: MessageRecord = {
              id: relayMsg.id,
              threadAddress: relayMsg.from,
              direction: 'received',
              encryptedPayload: relayMsg.payload,
              plaintextPreview: plaintext.slice(0, 60),
              timestamp: relayMsg.timestamp,
              status: 'delivered',
            };
            await saveMessage(record);
          } catch {
            // decryption failed — tampered or wrong key, skip silently
          }
        }
        await refreshThreads();
      } catch {
        // network error — ignore
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [myAddress, myPrivateKey, getContactPublicKey, refreshThreads]);

  useEffect(() => { refreshThreads(); }, [refreshThreads]);

  const getMessages = useCallback(
    (threadAddress: string) => getThread(threadAddress),
    [],
  );

  const send = useCallback(
    async (
      toAddress: string,
      plaintext: string,
      theirPublicKeyRaw: Uint8Array,
    ): Promise<void> => {
      if (!myAddress || !myPrivateKey) throw new Error('Wallet not unlocked');
      const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKeyRaw);
      const encryptedPayload = await encryptMessage(plaintext, sharedKey);

      const id = crypto.randomUUID();
      const timestamp = Date.now();

      // Save locally first (optimistic)
      const record: MessageRecord = {
        id,
        threadAddress: toAddress,
        direction: 'sent',
        encryptedPayload,
        plaintextPreview: plaintext.slice(0, 60),
        timestamp,
        status: 'queued',
      };
      await saveMessage(record);
      await refreshThreads();

      // Send to relay
      try {
        await sendRelayMessage(myAddress, toAddress, encryptedPayload);
        const updated: MessageRecord = { ...record, status: 'sent' };
        await saveMessage(updated);
        await refreshThreads();
      } catch (e) {
        throw e;
      }
    },
    [myAddress, myPrivateKey, refreshThreads],
  );

  return { threads, getMessages, send, refreshThreads };
}
