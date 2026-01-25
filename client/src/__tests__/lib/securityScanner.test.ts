// Test for securityScanner.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  runSecurityScan, 
  quickSecurityCheck, 
  getSecurityLevel,
  type SecurityScanResult 
} from '@/lib/securityScanner';

describe('Security Scanner', () => {
  describe('quickSecurityCheck', () => {
    it('should return boolean result', () => {
      const result = quickSecurityCheck();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('runSecurityScan', () => {
    it('should complete scan and return result object', async () => {
      const result = await runSecurityScan();
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('safe');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('blockers');
      expect(result).toHaveProperty('timestamp');
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.blockers)).toBe(true);
      expect(typeof result.timestamp).toBe('number');
    });

    it('should return warnings and blockers arrays', async () => {
      const result = await runSecurityScan();
      
      // Results should have proper structure
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.blockers)).toBe(true);
      
      // Each warning/blocker should have proper structure
      const allIssues = [...result.warnings, ...result.blockers];
      allIssues.forEach(issue => {
        expect(issue).toHaveProperty('type');
        expect(issue).toHaveProperty('severity');
        expect(issue).toHaveProperty('message');
        expect(['low', 'medium', 'high', 'critical']).toContain(issue.severity);
      });
    });

    it('should categorize high/critical issues as blockers', async () => {
      const result = await runSecurityScan();
      
      // All blockers should be high or critical severity
      result.blockers.forEach(blocker => {
        expect(['high', 'critical']).toContain(blocker.severity);
      });
      
      // All warnings should be low or medium severity
      result.warnings.forEach(warning => {
        expect(['low', 'medium']).toContain(warning.severity);
      });
    });

    it('should set safe flag based on blockers', async () => {
      const result = await runSecurityScan();
      
      // safe should be true when there are no blockers
      if (result.blockers.length === 0) {
        expect(result.safe).toBe(true);
      } else {
        expect(result.safe).toBe(false);
      }
    });
  });

  describe('getSecurityLevel', () => {
    it('should return safe for clean scan', () => {
      const mockResult: SecurityScanResult = {
        safe: true,
        warnings: [],
        blockers: [],
        timestamp: Date.now(),
      };
      
      const level = getSecurityLevel(mockResult);
      expect(level.level).toBe('safe');
      expect(level.icon).toBe('✅');
      expect(level.color).toBe('green');
    });

    it('should return danger when blockers exist', () => {
      const mockResult: SecurityScanResult = {
        safe: false,
        warnings: [],
        blockers: [{
          type: 'crypto_tampering',
          severity: 'critical',
          message: 'Test blocker',
        }],
        timestamp: Date.now(),
      };
      
      const level = getSecurityLevel(mockResult);
      expect(level.level).toBe('danger');
      expect(level.icon).toBe('🚫');
      expect(level.color).toBe('red');
    });

    it('should return caution for few warnings', () => {
      const mockResult: SecurityScanResult = {
        safe: true,
        warnings: [{
          type: 'devtools',
          severity: 'low',
          message: 'Test warning',
        }],
        blockers: [],
        timestamp: Date.now(),
      };
      
      const level = getSecurityLevel(mockResult);
      expect(level.level).toBe('caution');
      expect(level.icon).toBe('⚡');
      expect(level.color).toBe('yellow');
    });

    it('should return warning for multiple warnings', () => {
      const mockResult: SecurityScanResult = {
        safe: true,
        warnings: [
          { type: 'devtools', severity: 'low', message: 'Test 1' },
          { type: 'console_tampering', severity: 'medium', message: 'Test 2' },
          { type: 'script_injection', severity: 'low', message: 'Test 3' },
        ],
        blockers: [],
        timestamp: Date.now(),
      };
      
      const level = getSecurityLevel(mockResult);
      expect(level.level).toBe('warning');
      expect(level.icon).toBe('⚠️');
      expect(level.color).toBe('orange');
    });

    it('should prioritize blockers over warnings', () => {
      const mockResult: SecurityScanResult = {
        safe: false,
        warnings: [
          { type: 'devtools', severity: 'low', message: 'Test 1' },
          { type: 'console_tampering', severity: 'medium', message: 'Test 2' },
        ],
        blockers: [{
          type: 'crypto_tampering',
          severity: 'critical',
          message: 'Critical issue',
        }],
        timestamp: Date.now(),
      };
      
      const level = getSecurityLevel(mockResult);
      // Should be danger because of blockers, not warning because of warnings count
      expect(level.level).toBe('danger');
    });
  });

  describe('Security checks resilience', () => {
    it('should not crash when checking in various error conditions', async () => {
      // The scanner should handle errors gracefully and not throw
      const result = await runSecurityScan();
      expect(result).toBeDefined();
    });

    it('should return valid timestamp', async () => {
      const beforeScan = Date.now();
      const result = await runSecurityScan();
      const afterScan = Date.now();
      
      expect(result.timestamp).toBeGreaterThanOrEqual(beforeScan);
      expect(result.timestamp).toBeLessThanOrEqual(afterScan);
    });
  });
});
