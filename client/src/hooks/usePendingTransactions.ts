// client/src/hooks/usePendingTransactions.ts
// Hook for tracking pending transactions with real-time status updates

import { useState, useEffect, useCallback } from 'react';
import { getTransactionStatus } from '@/lib/sendService';
import { QBTCChain, getQBTCRpcSettings } from '@/lib/qbtcService';

export type TransactionStatus = 
  | 'authenticating'
  | 'signing'
  | 'broadcasting'
  | 'pending'
  | 'confirming'
  | 'confirmed'
  | 'failed';

export interface TransactionStep {
  name: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  timestamp?: number;
}

export interface PendingTransaction {
  id: string;
  hash: string;
  chain: 'ethereum' | 'bsc' | 'bitcoin' | 'xrp' | 'solana' | 'qbtc';
  from: string;
  to: string;
  amount: string;
  token: string;
  status: TransactionStatus;
  confirmations: number;
  requiredConfirmations: number;
  timestamp: number;
  steps: TransactionStep[];
  explorerUrl: string;
}

const STORAGE_KEY = 'pending_transactions';
const POLL_INTERVAL = 10000; // Poll every 10 seconds

/**
 * Get pending transactions from localStorage
 */
function loadPendingTransactions(): PendingTransaction[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load pending transactions:', error);
    return [];
  }
}

/**
 * Save pending transactions to localStorage
 */
function savePendingTransactions(transactions: PendingTransaction[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch (error) {
    console.error('Failed to save pending transactions:', error);
  }
}

/**
 * Create transaction steps based on status
 */
function createSteps(status: TransactionStatus, confirmations: number, required: number): TransactionStep[] {
  const steps: TransactionStep[] = [
    { name: 'Authenticated', status: 'pending' },
    { name: 'Signed', status: 'pending' },
    { name: 'Broadcast', status: 'pending' },
    { name: `Confirming (${confirmations}/${required} blocks)`, status: 'pending' },
    { name: 'Complete', status: 'pending' },
  ];

  // Update step statuses based on transaction status
  switch (status) {
    case 'authenticating':
      steps[0].status = 'active';
      break;
    case 'signing':
      steps[0].status = 'complete';
      steps[0].timestamp = Date.now();
      steps[1].status = 'active';
      break;
    case 'broadcasting':
      steps[0].status = 'complete';
      steps[1].status = 'complete';
      steps[1].timestamp = Date.now();
      steps[2].status = 'active';
      break;
    case 'pending':
      steps[0].status = 'complete';
      steps[1].status = 'complete';
      steps[2].status = 'complete';
      steps[2].timestamp = Date.now();
      steps[3].status = 'active';
      steps[3].name = `Confirming (${confirmations}/${required} blocks)`;
      break;
    case 'confirming':
      steps[0].status = 'complete';
      steps[1].status = 'complete';
      steps[2].status = 'complete';
      steps[3].status = 'active';
      steps[3].name = `Confirming (${confirmations}/${required} blocks)`;
      break;
    case 'confirmed':
      steps[0].status = 'complete';
      steps[1].status = 'complete';
      steps[2].status = 'complete';
      steps[3].status = 'complete';
      steps[3].name = `Confirmed (${required}/${required} blocks)`;
      steps[4].status = 'complete';
      steps[4].timestamp = Date.now();
      break;
    case 'failed':
      steps[0].status = 'complete';
      steps[1].status = 'complete';
      steps[2].status = 'complete';
      steps[3].status = 'error';
      steps[3].name = 'Failed';
      break;
  }

  return steps;
}

/**
 * Hook for managing pending transactions
 */
export function usePendingTransactions() {
  const [transactions, setTransactions] = useState<PendingTransaction[]>([]);

  // Load transactions on mount
  useEffect(() => {
    const loaded = loadPendingTransactions();
    setTransactions(loaded);
  }, []);

  // Save transactions whenever they change
  useEffect(() => {
    savePendingTransactions(transactions);
  }, [transactions]);

  // Poll for transaction status updates
  useEffect(() => {
    const pollStatus = async () => {
      const activeTransactions = transactions.filter(
        tx => tx.status !== 'confirmed' && tx.status !== 'failed'
      );

      if (activeTransactions.length === 0) return;

      // Poll all active transactions in parallel
      const statusUpdates = await Promise.allSettled(
        activeTransactions.map(tx => {
          if (tx.chain === 'qbtc') {
            const qbtcChain = new QBTCChain(getQBTCRpcSettings());
            return qbtcChain.getTransactionConfirmations(tx.hash).then(confirmations => ({
              status: confirmations >= tx.requiredConfirmations ? 'confirmed' as const : 'confirming' as const,
              confirmations,
              requiredConfirmations: tx.requiredConfirmations,
            }));
          }
          if (tx.chain !== 'ethereum' && tx.chain !== 'bsc' && tx.chain !== 'xrp') {
            return Promise.resolve({
              status: 'pending' as const,
              confirmations: tx.confirmations,
              requiredConfirmations: tx.requiredConfirmations,
            });
          }
          return getTransactionStatus(tx.chain, tx.hash);
        })
      );

      setTransactions(prev => 
        prev.map(t => {
          const index = activeTransactions.findIndex(atx => atx.id === t.id);
          if (index === -1) return t;

          const result = statusUpdates[index];
          if (result.status === 'rejected') {
            console.error(`Failed to poll transaction ${t.hash}:`, result.reason);
            return t;
          }

          const status = result.value;
          const newStatus: TransactionStatus = 
            status.status === 'pending' ? 'pending' :
            status.status === 'confirming' ? 'confirming' :
            status.status === 'confirmed' ? 'confirmed' :
            'failed';
          
          return {
            ...t,
            status: newStatus,
            confirmations: status.confirmations,
            steps: createSteps(newStatus, status.confirmations, status.requiredConfirmations),
          };
        })
      );
    };

    // Poll immediately and then at intervals
    pollStatus();
    const interval = setInterval(pollStatus, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [transactions]);

  /**
   * Add a new pending transaction
   */
  const addPendingTransaction = useCallback((tx: Omit<PendingTransaction, 'id' | 'steps'>) => {
    const newTransaction: PendingTransaction = {
      ...tx,
      id: `${tx.hash}-${Date.now()}`,
      steps: createSteps(tx.status, tx.confirmations, tx.requiredConfirmations),
    };

    setTransactions(prev => [newTransaction, ...prev]);
  }, []);

  /**
   * Remove a transaction (e.g., after it's been confirmed for a while)
   */
  const removeTransaction = useCallback((id: string) => {
    setTransactions(prev => prev.filter(tx => tx.id !== id));
  }, []);

  /**
   * Clear old confirmed/failed transactions
   */
  const clearOldTransactions = useCallback(() => {
    const ONE_HOUR = 60 * 60 * 1000;
    const now = Date.now();

    setTransactions(prev => 
      prev.filter(tx => {
        // Keep active transactions
        if (tx.status !== 'confirmed' && tx.status !== 'failed') {
          return true;
        }
        // Remove old completed transactions
        return now - tx.timestamp < ONE_HOUR;
      })
    );
  }, []);

  return {
    transactions,
    addPendingTransaction,
    removeTransaction,
    clearOldTransactions,
  };
}
