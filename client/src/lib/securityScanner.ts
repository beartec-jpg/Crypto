// Security Environment Scanner
// Detects potential threats before sensitive operations

export interface SecurityScanResult {
  safe: boolean;
  warnings: SecurityWarning[];
  blockers: SecurityWarning[];
  timestamp: number;
}

export interface SecurityWarning {
  type: SecurityCheckType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: string;
}

export type SecurityCheckType = 
  | 'devtools'
  | 'console_tampering'
  | 'prototype_pollution'
  | 'event_hijacking'
  | 'script_injection'
  | 'mutation_observer'
  | 'crypto_tampering';

/**
 * Main security scan function - runs all checks
 */
export async function runSecurityScan(): Promise<SecurityScanResult> {
  const warnings: SecurityWarning[] = [];
  const blockers: SecurityWarning[] = [];

  // Run all security checks
  const checks = [
    checkDevToolsOpen(),
    checkConsoleTampering(),
    checkPrototypePollution(),
    checkEventHijacking(),
    checkScriptInjection(),
    checkMutationObservers(),
    checkCryptoIntegrity(),
  ];

  const results = await Promise.all(checks);
  
  results.forEach(result => {
    if (result) {
      if (result.severity === 'critical' || result.severity === 'high') {
        blockers.push(result);
      } else {
        warnings.push(result);
      }
    }
  });

  return {
    safe: blockers.length === 0,
    warnings,
    blockers,
    timestamp: Date.now(),
  };
}

/**
 * Check 1: DevTools Detection
 * Uses timing analysis and window size detection
 */
function checkDevToolsOpen(): SecurityWarning | null {
  try {
    // Method 1: Debugger timing detection
    // NOTE: The debugger statement will pause execution if DevTools is open with breakpoints enabled.
    // This is intentional for security detection, though it may briefly disrupt user experience.
    // Users with DevTools open are warned that sensitive data could be inspected.
    const start = performance.now();
    debugger; // This line pauses if DevTools is open with breakpoints
    const end = performance.now();
    
    // If debugger took more than 100ms, DevTools likely open with breakpoints
    if (end - start > 100) {
      return {
        type: 'devtools',
        severity: 'medium',
        message: 'Developer Tools may be open',
        details: 'DevTools with breakpoints enabled was detected. This could allow inspection of sensitive data.',
      };
    }

    // Method 2: Window outer/inner size difference (DevTools changes this)
    const widthThreshold = window.outerWidth - window.innerWidth > 160;
    const heightThreshold = window.outerHeight - window.innerHeight > 160;
    
    if (widthThreshold || heightThreshold) {
      return {
        type: 'devtools',
        severity: 'low',
        message: 'Browser window size anomaly detected',
        details: 'This could indicate DevTools is docked to the side or bottom of your browser.',
      };
    }

    // Method 3: Check for Firebug
    if ((window as any).Firebug?.chrome?.isInitialized) {
      return {
        type: 'devtools',
        severity: 'medium',
        message: 'Firebug debugger detected',
        details: 'The Firebug debugging extension is active.',
      };
    }

    return null;
  } catch {
    return null; // If checks fail, assume safe
  }
}

/**
 * Check 2: Console Tampering Detection
 * Verifies console methods haven't been overridden
 */
function checkConsoleTampering(): SecurityWarning | null {
  try {
    // Check if console.log is native
    const nativeLog = console.log.toString().includes('[native code]');
    const nativeWarn = console.warn.toString().includes('[native code]');
    const nativeError = console.error.toString().includes('[native code]');

    if (!nativeLog || !nativeWarn || !nativeError) {
      return {
        type: 'console_tampering',
        severity: 'high',
        message: 'Console methods have been modified',
        details: 'A script has overridden browser console methods, which could intercept logged data.',
      };
    }

    return null;
  } catch {
    return {
      type: 'console_tampering',
      severity: 'medium',
      message: 'Unable to verify console integrity',
      details: 'Could not confirm console methods are unmodified.',
    };
  }
}

/**
 * Check 3: Prototype Pollution Detection
 * Checks for modifications to native prototypes
 */
function checkPrototypePollution(): SecurityWarning | null {
  try {
    // Check Array prototype for unexpected properties
    // NOTE: This list of expected methods may need updates as JavaScript evolves.
    // Based on ECMAScript 2023 specification. False positives may occur with polyfills.
    const arrayProtoKeys = Object.keys(Array.prototype);
    const suspiciousArrayKeys = arrayProtoKeys.filter(key => 
      !['length', 'constructor', 'concat', 'copyWithin', 'fill', 'find', 
        'findIndex', 'lastIndexOf', 'pop', 'push', 'reverse', 'shift', 
        'unshift', 'slice', 'sort', 'splice', 'includes', 'indexOf', 
        'join', 'keys', 'entries', 'values', 'forEach', 'filter', 'flat',
        'flatMap', 'map', 'every', 'some', 'reduce', 'reduceRight',
        'toLocaleString', 'toString', 'at', 'findLast', 'findLastIndex',
        'toReversed', 'toSorted', 'toSpliced', 'with'].includes(key)
    );

    if (suspiciousArrayKeys.length > 0) {
      return {
        type: 'prototype_pollution',
        severity: 'high',
        message: 'Array prototype has been modified',
        details: `Suspicious properties found: ${suspiciousArrayKeys.join(', ')}`,
      };
    }

    // Check Object prototype
    const objectProtoKeys = Object.keys(Object.prototype);
    if (objectProtoKeys.length > 0) {
      return {
        type: 'prototype_pollution',
        severity: 'high',
        message: 'Object prototype has been polluted',
        details: `Unexpected properties: ${objectProtoKeys.join(', ')}`,
      };
    }

    // Check String prototype for suspicious additions
    const stringProtoKeys = Object.keys(String.prototype);
    const suspiciousStringKeys = stringProtoKeys.filter(key =>
      !['length', 'constructor', 'anchor', 'at', 'big', 'blink', 'bold',
        'charAt', 'charCodeAt', 'codePointAt', 'concat', 'endsWith',
        'fixed', 'fontcolor', 'fontsize', 'includes', 'indexOf',
        'isWellFormed', 'italics', 'lastIndexOf', 'link', 'localeCompare',
        'match', 'matchAll', 'normalize', 'padEnd', 'padStart', 'repeat',
        'replace', 'replaceAll', 'search', 'slice', 'small', 'split',
        'startsWith', 'strike', 'sub', 'substr', 'substring', 'sup',
        'toLocaleLowerCase', 'toLocaleUpperCase', 'toLowerCase',
        'toString', 'toUpperCase', 'toWellFormed', 'trim', 'trimEnd',
        'trimLeft', 'trimRight', 'trimStart', 'valueOf'].includes(key)
    );

    if (suspiciousStringKeys.length > 0) {
      return {
        type: 'prototype_pollution',
        severity: 'medium',
        message: 'String prototype has been modified',
        details: `Suspicious properties: ${suspiciousStringKeys.join(', ')}`,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check 4: Event Listener Hijacking Detection
 * Looks for suspicious global event listeners
 */
function checkEventHijacking(): SecurityWarning | null {
  try {
    // Check if addEventListener has been wrapped
    const nativeAddEventListener = EventTarget.prototype.addEventListener.toString().includes('[native code]');
    
    if (!nativeAddEventListener) {
      return {
        type: 'event_hijacking',
        severity: 'high',
        message: 'Event listener system has been modified',
        details: 'addEventListener has been overridden, which could intercept all user input.',
      };
    }

    // Check for suspicious capturing listeners on document (keyloggers often use this)
    // Note: We can't directly enumerate listeners, but we can check for common patterns
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Check 5: Script Injection Detection
 * Scans for injected scripts that shouldn't be there
 */
function checkScriptInjection(): SecurityWarning | null {
  try {
    const scripts = document.querySelectorAll('script');
    const suspiciousScripts: string[] = [];

    scripts.forEach(script => {
      const src = script.src || '';
      
      // Check for known malicious patterns
      const suspiciousPatterns = [
        'keylogger',
        'inject',
        'hook',
        'intercept',
        'capture',
        'steal',
        'exfil',
        'chrome-extension://', // Extensions injecting scripts
        'moz-extension://',
      ];

      // Check inline scripts for suspicious content
      const inlineContent = script.textContent || '';
      const suspiciousInlinePatterns = [
        'XMLHttpRequest.prototype',
        'fetch = ',
        'document.cookie',
        'localStorage.getItem',
        'eval(',
        'Function(',
      ];

      if (suspiciousPatterns.some(p => src.toLowerCase().includes(p))) {
        suspiciousScripts.push(`External: ${src.substring(0, 50)}`);
      }

      if (suspiciousInlinePatterns.some(p => inlineContent.includes(p))) {
        // Be careful not to flag our own code
        // NOTE: This uses simple string matching as a heuristic. Not foolproof but provides basic protection.
        // More robust solutions would require script integrity hashing or CSP nonces.
        if (!inlineContent.includes('beartec') && !inlineContent.includes('walletService')) {
          suspiciousScripts.push('Inline script with suspicious patterns');
        }
      }
    });

    // Check for extension-injected elements
    const extensionElements = document.querySelectorAll('[data-extension-id], [class*="extension"]');
    if (extensionElements.length > 0) {
      return {
        type: 'script_injection',
        severity: 'low',
        message: 'Browser extension elements detected',
        details: 'One or more browser extensions have injected elements into the page.',
      };
    }

    if (suspiciousScripts.length > 0) {
      return {
        type: 'script_injection',
        severity: 'high',
        message: 'Suspicious scripts detected',
        details: suspiciousScripts.join('; '),
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check 6: MutationObserver Abuse Detection
 * Checks for excessive DOM monitoring
 */
function checkMutationObservers(): SecurityWarning | null {
  try {
    // We can't directly enumerate MutationObservers, but we can check if
    // the MutationObserver constructor has been tampered with
    const nativeMutationObserver = MutationObserver.toString().includes('[native code]');
    
    if (!nativeMutationObserver) {
      return {
        type: 'mutation_observer',
        severity: 'high',
        message: 'MutationObserver has been modified',
        details: 'The DOM monitoring system has been tampered with.',
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check 7: Crypto API Integrity
 * Verifies the Web Crypto API hasn't been replaced
 */
function checkCryptoIntegrity(): SecurityWarning | null {
  try {
    // Check if crypto.subtle exists and is native
    if (!window.crypto || !window.crypto.subtle) {
      return {
        type: 'crypto_tampering',
        severity: 'critical',
        message: 'Web Crypto API is missing',
        details: 'The browser cryptography API is not available. This is required for secure operations.',
      };
    }

    // Check if getRandomValues is native
    const nativeRandom = window.crypto.getRandomValues.toString().includes('[native code]');
    if (!nativeRandom) {
      return {
        type: 'crypto_tampering',
        severity: 'critical',
        message: 'Crypto random generator has been modified',
        details: 'The cryptographic random number generator has been tampered with. This is a critical security issue.',
      };
    }

    // Check subtle crypto methods
    const subtleMethods = ['encrypt', 'decrypt', 'sign', 'verify', 'digest', 'generateKey', 'deriveBits', 'deriveKey'];
    for (const method of subtleMethods) {
      if (typeof (window.crypto.subtle as any)[method] !== 'function') {
        return {
          type: 'crypto_tampering',
          severity: 'critical',
          message: `Crypto method ${method} is missing`,
          details: 'A required cryptographic method is not available.',
        };
      }
    }

    return null;
  } catch {
    return {
      type: 'crypto_tampering',
      severity: 'critical',
      message: 'Unable to verify crypto integrity',
      details: 'Could not confirm the Web Crypto API is functioning correctly.',
    };
  }
}

/**
 * Quick check for critical issues only (faster, for frequent operations)
 */
export function quickSecurityCheck(): boolean {
  try {
    // Only check the most critical issues.
    // Coerce to boolean: missing crypto.subtle (Node 18 / some jsdom) is undefined,
    // and `undefined && x` would otherwise leak a non-boolean return.
    const cryptoOk = Boolean(
      window.crypto?.subtle &&
        window.crypto.getRandomValues.toString().includes('[native code]'),
    );
    const consoleOk = console.log.toString().includes('[native code]');

    return cryptoOk && consoleOk;
  } catch {
    return false;
  }
}

/**
 * Get security level description
 */
export function getSecurityLevel(result: SecurityScanResult): {
  level: 'safe' | 'caution' | 'warning' | 'danger';
  color: string;
  icon: string;
} {
  if (result.blockers.length > 0) {
    return { level: 'danger', color: 'red', icon: '🚫' };
  }
  if (result.warnings.length > 2) {
    return { level: 'warning', color: 'orange', icon: '⚠️' };
  }
  if (result.warnings.length > 0) {
    return { level: 'caution', color: 'yellow', icon: '⚡' };
  }
  return { level: 'safe', color: 'green', icon: '✅' };
}
