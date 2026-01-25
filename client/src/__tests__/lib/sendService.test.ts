/**
 * Tests for send service utilities
 */

import { describe, it, expect } from 'vitest';
import { validateAddress, getChainSymbol } from '@/lib/sendService';

describe('sendService', () => {
  describe('validateAddress', () => {
    // Ethereum address validation
    it('should validate correct Ethereum address', () => {
      const validAddress = '0x2C65cB6460A68472e08Adda1242324E70f8180c3';
      expect(validateAddress(validAddress, 'ethereum')).toBe(true);
    });

    it('should reject invalid Ethereum address - wrong prefix', () => {
      const invalidAddress = '2C65cB6460A68472e08Adda1242324E70f8180c3';
      expect(validateAddress(invalidAddress, 'ethereum')).toBe(false);
    });

    it('should reject invalid Ethereum address - wrong length', () => {
      const invalidAddress = '0x2C65cB6460A68472e08Adda1242324E70f8180';
      expect(validateAddress(invalidAddress, 'ethereum')).toBe(false);
    });

    it('should reject invalid Ethereum address - invalid characters', () => {
      const invalidAddress = '0xZZZZcB6460A68472e08Adda1242324E70f8180c3';
      expect(validateAddress(invalidAddress, 'ethereum')).toBe(false);
    });

    // BSC address validation (same format as Ethereum)
    it('should validate correct BSC address', () => {
      const validAddress = '0x2C65cB6460A68472e08Adda1242324E70f8180c3';
      expect(validateAddress(validAddress, 'bsc')).toBe(true);
    });

    it('should reject invalid BSC address', () => {
      const invalidAddress = '0x2C65cB6460A68472e08Adda1242324E70f8180';
      expect(validateAddress(invalidAddress, 'bsc')).toBe(false);
    });

    // XRP address validation
    it('should validate correct XRP address', () => {
      const validAddress = 'rN7n7otQDd6FczFgLdlqtyMVrn3HMfXx3Z';
      expect(validateAddress(validAddress, 'xrp')).toBe(true);
    });

    it('should reject invalid XRP address - wrong prefix', () => {
      const invalidAddress = 'xN7n7otQDd6FczFgLdlqtyMVrn3HMfXx3Z';
      expect(validateAddress(invalidAddress, 'xrp')).toBe(false);
    });

    it('should reject invalid XRP address - too short', () => {
      const invalidAddress = 'rN7n7otQDd6FczFg';
      expect(validateAddress(invalidAddress, 'xrp')).toBe(false);
    });

    it('should reject invalid XRP address - invalid characters', () => {
      const invalidAddress = 'rN7n7otQDd6FczFgLdlqtyMVrn3HMfXx3Z0O';
      expect(validateAddress(invalidAddress, 'xrp')).toBe(false);
    });
  });

  describe('getChainSymbol', () => {
    it('should return correct symbol for ethereum', () => {
      expect(getChainSymbol('ethereum')).toBe('ETH');
    });

    it('should return correct symbol for bsc', () => {
      expect(getChainSymbol('bsc')).toBe('BNB');
    });

    it('should return correct symbol for xrp', () => {
      expect(getChainSymbol('xrp')).toBe('XRP');
    });
  });
});
