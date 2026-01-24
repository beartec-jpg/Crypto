// client/src/lib/securityService.ts
// Wallet security management - auto-lock, key protection, session management, 3-tier security

import { getCurrentWallet } from './walletService';
import { authenticateWithPasskey, isPasskeyAuthenticated } from './passkeyService';

// Security tier types
export type SecurityTier = 'standard' | 'enhanced' | 'maximum';
export type SecurityAction = 'openWallet' | 'viewBalance' | 'receive' | 'send' | 'viewSeed' | 'exportKeys';
export type AuthMethod = 'pin' | 'password' | 'passkey';

// Security settings interface
export interface SecuritySettings {
  tier: SecurityTier;
  pinHash?: string;        // SHA-256 hash of PIN (Tier 3 only)
  pinSalt?: string;        // Random salt for PIN
  failedPinAttempts: number;
  pinLockoutUntil?: number; // Timestamp
  autoLockMinutes: number;  // 0 = disabled, 5/15/30 minutes
  lastActivity?: number;    // For auto-lock
}

// Security requirements by tier and action
export const SECURITY_REQUIREMENTS: Record<SecurityTier, Record<SecurityAction, AuthMethod[]>> = {
  standard: {
    openWallet: [],
    viewBalance: [],
    receive: [],
    send: ['passkey'],
    viewSeed: ['password', 'passkey'],
    exportKeys: ['password', 'passkey'],
  },
  enhanced: {
    openWallet: ['passkey'],
    viewBalance: [],
    receive: [],
    send: ['passkey'],
    viewSeed: ['password', 'passkey'],
    exportKeys: ['password', 'passkey'],
  },
  maximum: {
    openWallet: ['pin', 'passkey'],
    viewBalance: [],
    receive: [],
    send: ['pin', 'passkey'],
    viewSeed: ['pin', 'password', 'passkey'],
    exportKeys: ['pin', 'password', 'passkey'],
  },
};

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

// ============================================================================
// 3-Tier Security System Functions
// ============================================================================

const SECURITY_SETTINGS_KEY = 'wallet_security_settings';

/**
 * Get current security settings (defaults to Tier 1 for existing wallets)
 */
export function getSecuritySettings(): SecuritySettings {
  const stored = localStorage.getItem(SECURITY_SETTINGS_KEY);
  
  if (!stored) {
    // DEFAULT: Tier 1 (Standard) for existing wallets - NO LOCKOUT!
    return {
      tier: 'standard',
      failedPinAttempts: 0,
      autoLockMinutes: 0, // 0 = use system default (10 min)
    };
  }
  
  return JSON.parse(stored);
}

/**
 * Save security settings
 */
export function saveSecuritySettings(settings: SecuritySettings): void {
  localStorage.setItem(SECURITY_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Hash PIN securely with salt using PBKDF2
 * Uses 100,000 iterations for strong protection against brute force
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin);
  const saltData = encoder.encode(salt);
  
  // Import key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    pinData,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  // Derive key using PBKDF2 with 100,000 iterations
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltData,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256 // 256 bits = 32 bytes
  );
  
  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate random salt for PIN
 */
export function generateSalt(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify PIN with rate limiting
 */
export async function verifyPin(enteredPin: string): Promise<boolean> {
  const settings = getSecuritySettings();
  
  // Check if PIN is set
  if (!settings.pinHash || !settings.pinSalt) {
    throw new Error('PIN not configured');
  }
  
  // Check lockout
  if (settings.pinLockoutUntil && Date.now() < settings.pinLockoutUntil) {
    const remaining = Math.ceil((settings.pinLockoutUntil - Date.now()) / 60000);
    throw new Error(`Too many failed attempts. Try again in ${remaining} minute${remaining > 1 ? 's' : ''}.`);
  }
  
  // Verify PIN
  const hash = await hashPin(enteredPin, settings.pinSalt);
  
  if (hash === settings.pinHash) {
    // Reset on success
    settings.failedPinAttempts = 0;
    settings.pinLockoutUntil = undefined;
    saveSecuritySettings(settings);
    return true;
  } else {
    // Failed attempt
    settings.failedPinAttempts++;
    if (settings.failedPinAttempts >= 5) {
      settings.pinLockoutUntil = Date.now() + (15 * 60 * 1000); // 15 min lockout
    }
    saveSecuritySettings(settings);
    
    const remaining = 5 - settings.failedPinAttempts;
    if (remaining > 0) {
      throw new Error(`Wrong PIN. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`);
    } else {
      throw new Error('Too many failed attempts. Locked for 15 minutes.');
    }
  }
}

/**
 * Set up PIN for Maximum security tier
 */
export async function setupPin(pin: string): Promise<void> {
  if (pin.length !== 6 || !/^\d+$/.test(pin)) {
    throw new Error('PIN must be exactly 6 digits');
  }
  
  const settings = getSecuritySettings();
  const salt = generateSalt();
  const hash = await hashPin(pin, salt);
  
  settings.pinHash = hash;
  settings.pinSalt = salt;
  settings.failedPinAttempts = 0;
  settings.pinLockoutUntil = undefined;
  
  saveSecuritySettings(settings);
}

/**
 * Remove PIN (when downgrading from Tier 3)
 */
export function removePin(): void {
  const settings = getSecuritySettings();
  delete settings.pinHash;
  delete settings.pinSalt;
  settings.failedPinAttempts = 0;
  settings.pinLockoutUntil = undefined;
  saveSecuritySettings(settings);
}

/**
 * Change security tier
 */
export function changeSecurityTier(newTier: SecurityTier): void {
  const settings = getSecuritySettings();
  settings.tier = newTier;
  
  // If downgrading from maximum, remove PIN
  if (newTier !== 'maximum' && settings.pinHash) {
    removePin();
  }
  
  saveSecuritySettings(settings);
}

/**
 * Emergency reset to Standard tier (requires password verification separately)
 */
export function emergencySecurityReset(): void {
  const resetSettings: SecuritySettings = {
    tier: 'standard',
    failedPinAttempts: 0,
    autoLockMinutes: 0,
  };
  saveSecuritySettings(resetSettings);
  console.log('🔓 Security reset to Standard tier');
}

/**
 * Check if PIN is currently locked out
 */
export function isPinLockedOut(): boolean {
  const settings = getSecuritySettings();
  return !!(settings.pinLockoutUntil && Date.now() < settings.pinLockoutUntil);
}

/**
 * Get remaining lockout time in minutes
 */
export function getPinLockoutMinutes(): number {
  const settings = getSecuritySettings();
  if (!settings.pinLockoutUntil || Date.now() >= settings.pinLockoutUntil) {
    return 0;
  }
  return Math.ceil((settings.pinLockoutUntil - Date.now()) / 60000);
}

/**
 * Main security check function - validates all required auth methods for an action
 * Returns true if all requirements are met, false if any fail
 * 
 * Note: This function should be called with appropriate UI handlers for each auth method
 * The actual prompting should be done by the caller (UI components)
 */
export function getSecurityRequirements(action: SecurityAction): AuthMethod[] {
  const settings = getSecuritySettings();
  return SECURITY_REQUIREMENTS[settings.tier][action];
}

/**
 * Check if an action requires any authentication
 */
export function requiresAuthentication(action: SecurityAction): boolean {
  const requirements = getSecurityRequirements(action);
  return requirements.length > 0;
}
