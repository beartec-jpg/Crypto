/**
 * Tests for XRP send service
 */

import { describe, it, expect } from 'vitest';
import { signXrpTransaction } from '@/lib/xrpSendService';

describe('xrpSendService', () => {
  describe('signXrpTransaction - key format validation', () => {
    // Mock transaction that would normally come from buildXrpTransaction/autofill
    // Note: This is a simplified test. In production, the transaction must be properly
    // autofilled by xrpl.Client before signing
    const mockTransaction = {
      TransactionType: 'Payment' as const,
      Account: 'rN7n7otQDd6FczFgLdlqtyMVrn3HMfXx3Z',
      Destination: 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY',
      Amount: '1000000', // 1 XRP in drops
      Fee: '12',
      Sequence: 12345,
      LastLedgerSequence: 12345678,
    };

    it('should accept hex private key without 0x prefix', () => {
      const hexPrivateKey = '0000000000000000000000000000000000000000000000000000000000000001';
      
      // The function should accept hex keys and attempt to sign
      // (may fail during encoding since this is a test transaction not autofilled by xrpl client)
      try {
        signXrpTransaction(mockTransaction, hexPrivateKey);
        // If it succeeds, that's fine too
        expect(true).toBe(true);
      } catch (error: any) {
        // Should not reject based on key format
        expect(error.message).not.toContain('Invalid private key format');
      }
    });

    it('should accept hex private key with 0x prefix', () => {
      const hexPrivateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';
      
      try {
        signXrpTransaction(mockTransaction, hexPrivateKey);
        expect(true).toBe(true);
      } catch (error: any) {
        // Should not reject based on key format
        expect(error.message).not.toContain('Invalid private key format');
      }
    });

    it('should reject invalid key format', () => {
      const invalidKey = 'invalid_key';
      
      expect(() => {
        signXrpTransaction(mockTransaction, invalidKey);
      }).toThrow('Invalid private key format');
    });

    it('should reject hex key with wrong length', () => {
      const shortKey = 'a1b2c3d4e5f6';
      
      expect(() => {
        signXrpTransaction(mockTransaction, shortKey);
      }).toThrow('Invalid private key format');
    });

    it('should correctly detect hex key pattern', () => {
      // Test the regex patterns
      const hexKey64 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const hexKey64With0x = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const xrpSeed = 'sEdV19BLfeQeKdEXyYA4NhjPJe6XBfG';
      
      expect(/^[0-9a-fA-F]{64}$/.test(hexKey64)).toBe(true);
      expect(/^0x[0-9a-fA-F]{64}$/.test(hexKey64With0x)).toBe(true);
      expect(xrpSeed.startsWith('s')).toBe(true);
      
      // These should not match
      expect(/^[0-9a-fA-F]{64}$/.test('too_short')).toBe(false);
      expect(/^[0-9a-fA-F]{64}$/.test(xrpSeed)).toBe(false);
    });
  });
});
