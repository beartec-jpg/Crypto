// client/src/lib/securityService.ts
// Wallet security management - auto-lock, key protection, session management

import { getCurrentWallet } from './walletService';

interface SecurityConfig {
  autoLockTimeout: number; // milliseconds
  requirePasskeyForTransactions: boolean;
  clearKeysOnUnmount: boolean;
}

const DEFAULT_CONFIG: SecurityConfig = {
  autoLockTimeout: 10 * 60 * 1000, // 10 minutes
  requirePasskeyForTransactions: true,
  clearKeysOnUnmount: true,
};

class SecurityManager {
  private lockTimer: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  private isLocked: boolean = true;
  private listeners: Set<(locked: boolean) => void> = new Set();

  constructor() {
    this.setupActivityListeners();
    this.startAutoLockTimer();
  }

  /**
   * Setup activity listeners to reset auto-lock timer
   */
  private setupActivityListeners() {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      window.addEventListener(event, () => this.recordActivity(), { passive: true });
    });
  }

  /**
   * Record user activity and reset auto-lock timer
   */
  private recordActivity() {
    this.lastActivity = Date.now();
    
    if (!this.isLocked) {
      this.resetAutoLockTimer();
    }
  }

  /**
   * Start auto-lock countdown timer
   */
  private startAutoLockTimer() {
    this.resetAutoLockTimer();
  }

  /**
   * Reset auto-lock timer
   */
  private resetAutoLockTimer() {
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
    }

    this.lockTimer = setTimeout(() => {
      this.lockWallet();
    }, DEFAULT_CONFIG.autoLockTimeout);
  }

  /**
   * Lock the wallet (clear session, keys from memory)
   */
  public lockWallet() {
    console.log('🔒 Locking wallet...');
    
    // Clear session
    sessionStorage.removeItem('wallet_unlocked');
    
    // Clear any cached keys from memory
    this.clearSensitiveData();
    
    // Update lock state
    this.isLocked = true;
    
    // Notify listeners
    this.notifyListeners(true);
    
    console.log('✅ Wallet locked');
  }

  /**
   * Unlock the wallet after passkey authentication
   */
  public unlockWallet() {
    console.log('🔓 Unlocking wallet...');
    
    sessionStorage.setItem('wallet_unlocked', 'true');
    this.isLocked = false;
    this.lastActivity = Date.now();
    this.resetAutoLockTimer();
    
    // Notify listeners
    this.notifyListeners(false);
    
    console.log('✅ Wallet unlocked');
  }

  /**
   * Check if wallet is currently locked
   */
  public isWalletLocked(): boolean {
    const sessionUnlocked = sessionStorage.getItem('wallet_unlocked') === 'true';
    return this.isLocked || !sessionUnlocked;
  }

  /**
   * Clear sensitive data from memory
   */
  private clearSensitiveData() {
    // Clear any cached wallet data
    const sensitiveKeys = [
      'temp_private_key',
      'temp_mnemonic',
      'temp_seed',
    ];
    
    sensitiveKeys.forEach(key => {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    });
    
    // Force garbage collection hint (not guaranteed, but helps)
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Add listener for lock state changes
   */
  public addLockListener(callback: (locked: boolean) => void) {
    this.listeners.add(callback);
  }

  /**
   * Remove lock listener
   */
  public removeLockListener(callback: (locked: boolean) => void) {
    this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of lock state change
   */
  private notifyListeners(locked: boolean) {
    this.listeners.forEach(callback => callback(locked));
  }

  /**
   * Get time until auto-lock (in seconds)
   */
  public getTimeUntilLock(): number {
    const elapsed = Date.now() - this.lastActivity;
    const remaining = DEFAULT_CONFIG.autoLockTimeout - elapsed;
    return Math.max(0, Math.floor(remaining / 1000));
  }

  /**
   * Cleanup timers and listeners
   */
  public cleanup() {
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
    }
    this.listeners.clear();
  }
}

// Singleton instance
export const securityManager = new SecurityManager();

/**
 * Hook to use security manager in React components
 */
export function useWalletSecurity() {
  return {
    lock: () => securityManager.lockWallet(),
    unlock: () => securityManager.unlockWallet(),
    isLocked: () => securityManager.isWalletLocked(),
    getTimeUntilLock: () => securityManager.getTimeUntilLock(),
  };
}
