// client/src/lib/securityService.ts
// Wallet security management - auto-lock, key protection, session management, 3-tier security

// Security tier types
export type SecurityTier = 'standard' | 'enhanced' | 'maximum';
export type SecurityAction = 'openWallet' | 'viewBalance' | 'receive' | 'send' | 'viewSeed' | 'exportKeys';
export type AuthMethod = 'pin' | 'password' | 'passkey';

// Auto-lock timer options (in minutes)
export const AUTO_LOCK_OPTIONS = [1, 2, 5, 10, 15] as const;
export type AutoLockMinutes = typeof AUTO_LOCK_OPTIONS[number];

const STORAGE_KEY_AUTO_LOCK = 'wallet_auto_lock_minutes';

// Security settings interface
export interface SecuritySettings {
  tier: SecurityTier;
  pinHash?: string;
  pinSalt?: string;
  failedPinAttempts: number;
  pinLockoutUntil?: number;
  autoLockMinutes: number;
  lastActivity?: number;
}

// Security requirements by tier and action
export const SECURITY_REQUIREMENTS: Record<SecurityTier, Record<SecurityAction, AuthMethod[]>> = {
  standard: {
    openWallet: ['passkey'],
    viewBalance: [],
    receive: [],
    send: ['passkey'], // Passkey only
    viewSeed: ['password', 'passkey'], // Password + Passkey
    exportKeys: ['password', 'passkey'],
  },
  enhanced: {
    openWallet: ['passkey'],
    viewBalance: [],
    receive: [],
    send: ['password', 'passkey'], // Password + Passkey (Bug 21 fix)
    viewSeed: ['password', 'passkey'], // Password + Passkey
    exportKeys: ['password', 'passkey'],
  },
  maximum: {
    openWallet: ['pin', 'passkey'],
    viewBalance: [],
    receive: [],
    send: ['pin', 'password', 'passkey'], // PIN + Password + Passkey (Bug 21 fix)
    viewSeed: ['pin', 'password', 'passkey'], // PIN + Password + Passkey
    exportKeys: ['pin', 'password', 'passkey'],
  },
};

interface SecurityConfig {
  autoLockTimeout: number;
  requirePasskeyForTransactions: boolean;
  clearKeysOnUnmount: boolean;
}

/**
 * Get user's auto-lock preference (default 10 minutes, max 15, min 1)
 */
function getAutoLockTimeout(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_AUTO_LOCK);
    if (stored) {
      const minutes = parseInt(stored, 10);
      // Enforce min 1, max 15
      if (minutes >= 1 && minutes <= 15) {
        return minutes * 60 * 1000;
      }
    }
  } catch (error) {
    console.warn('Failed to read auto-lock setting:', error);
  }
  return 10 * 60 * 1000; // Default 10 minutes
}

class SecurityManager {
  private lockTimer: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  private isLocked: boolean = true;
  private listeners: Set<(locked: boolean) => void> = new Set();
  private autoLockTimeout: number;

  constructor() {
    this.autoLockTimeout = getAutoLockTimeout();
    this.setupActivityListeners();
    this.startAutoLockTimer();
  }

  /**
   * Set auto-lock timeout (1-15 minutes)
   */
  public setAutoLockMinutes(minutes: number): void {
    // Enforce bounds
    const clamped = Math.max(1, Math.min(15, minutes));
    this.autoLockTimeout = clamped * 60 * 1000;
    
    try {
      localStorage.setItem(STORAGE_KEY_AUTO_LOCK, String(clamped));
    } catch (error) {
      console.warn('Failed to save auto-lock setting:', error);
    }
    
    // Reset timer with new timeout
    if (!this.isLocked) {
      this.resetAutoLockTimer();
    }
    
    console.log(`⏱️ Auto-lock set to ${clamped} minutes`);
  }

  /**
   * Get current auto-lock timeout in minutes
   */
  public getAutoLockMinutes(): number {
    return Math.round(this.autoLockTimeout / 60000);
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
    }, this.autoLockTimeout); // Uses instance variable
  }

  /**
   * Lock the wallet (clear session, keys from memory)
   */
  public lockWallet() {
    console.log('🔒 Locking wallet...');
    
    sessionStorage.removeItem('wallet_unlocked');
    this.clearSensitiveData();
    this.isLocked = true;
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
    this.notifyListeners(false);
    
    console.log('✅ Wallet unlocked');
  }

  /**
   * Check if wallet is currently locked
   */
  public isWalletLocked(): boolean {
    return this.isLocked;
  }

  /**
   * Clear sensitive data from memory
   */
  private clearSensitiveData() {
    const sensitiveKeys = [
      'temp_private_key',
      'temp_mnemonic',
      'temp_seed',
    ];
    
    sensitiveKeys.forEach(key => {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    });
    
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
    const remaining = this.autoLockTimeout - elapsed; // Uses instance variable
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

export const securityManager = new SecurityManager();

// Storage key for security settings
const SECURITY_STORAGE_KEY = 'wallet_security_';

/**
 * Get security settings for user
 */
export function getSecuritySettings(userId: string): SecuritySettings {
  try {
    const stored = localStorage.getItem(`${SECURITY_STORAGE_KEY}${userId}`);
    if (stored) {
      const settings = JSON.parse(stored);
      return settings;
    }
  } catch (error) {
    console.error('Failed to load security settings:', error);
  }
  
  return {
    tier: 'standard',
    failedPinAttempts: 0,
    autoLockMinutes: 10,
  };
}

/**
 * Save security settings
 */
export function saveSecuritySettings(userId: string, settings: SecuritySettings): void {
  try {
    localStorage.setItem(`${SECURITY_STORAGE_KEY}${userId}`, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save security settings:', error);
  }
}

/**
 * Get security requirements for an action
 */
export function getSecurityRequirements(userId: string, action: SecurityAction): AuthMethod[] {
  const settings = getSecuritySettings(userId);
  return SECURITY_REQUIREMENTS[settings.tier][action];
}

/**
 * Change security tier
 */
export function changeSecurityTier(userId: string, newTier: SecurityTier): void {
  const settings = getSecuritySettings(userId);
  settings.tier = newTier;
  saveSecuritySettings(userId, settings);
}

/**
 * Setup PIN for Maximum tier
 */
export async function setupPin(userId: string, pin: string): Promise<void> {
  if (pin.length !== 6) {
    throw new Error('PIN must be 6 digits');
  }
  
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin + saltHex);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', pinData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  const settings = getSecuritySettings(userId);
  settings.pinHash = hashHex;
  settings.pinSalt = saltHex;
  settings.failedPinAttempts = 0;
  settings.pinLockoutUntil = undefined;
  
  saveSecuritySettings(userId, settings);
}

/**
 * Verify PIN
 */
export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  const settings = getSecuritySettings(userId);
  
  if (!settings.pinHash || !settings.pinSalt) {
    throw new Error('PIN not set up');
  }
  
  if (isPinLockedOut(userId)) {
    const minutesRemaining = getPinLockoutMinutes(userId);
    throw new Error(`Too many failed attempts. Try again in ${minutesRemaining} minutes.`);
  }
  
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin + settings.pinSalt);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', pinData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  if (hashHex === settings.pinHash) {
    settings.failedPinAttempts = 0;
    settings.pinLockoutUntil = undefined;
    saveSecuritySettings(userId, settings);
    return true;
  } else {
    settings.failedPinAttempts += 1;
    
    if (settings.failedPinAttempts >= 5) {
      settings.pinLockoutUntil = Date.now() + (15 * 60 * 1000);
    }
    
    saveSecuritySettings(userId, settings);
    return false;
  }
}

/**
 * Check if PIN is locked out
 */
export function isPinLockedOut(userId: string): boolean {
  const settings = getSecuritySettings(userId);
  
  if (!settings.pinLockoutUntil) return false;
  
  if (Date.now() < settings.pinLockoutUntil) {
    return true;
  } else {
    settings.pinLockoutUntil = undefined;
    settings.failedPinAttempts = 0;
    saveSecuritySettings(userId, settings);
    return false;
  }
}

/**
 * Get remaining lockout time in minutes
 */
export function getPinLockoutMinutes(userId: string): number {
  const settings = getSecuritySettings(userId);
  
  if (!settings.pinLockoutUntil) return 0;
  
  const remaining = settings.pinLockoutUntil - Date.now();
  return Math.max(0, Math.ceil(remaining / 60000));
}

/**
 * Emergency security reset (requires password verification)
 */
export async function emergencySecurityReset(userId: string, password: string): Promise<void> {
  try {
    const { unlockWallet } = await import('./walletService');
    const walletId = localStorage.getItem(`wallet_id_${userId}`);
    
    if (!walletId) {
      throw new Error('Wallet not found');
    }
    
    await unlockWallet(walletId, password);
    
    const settings: SecuritySettings = {
      tier: 'standard',
      failedPinAttempts: 0,
      autoLockMinutes: 10,
      pinHash: undefined,
      pinSalt: undefined,
      pinLockoutUntil: undefined,
    };
    
    saveSecuritySettings(userId, settings);
    
    console.log('✅ Security settings reset to standard tier');
  } catch (error) {
    throw new Error('Invalid password. Cannot reset security settings.');
  }
}
