/**
 * Centralized error logging and handling utility
 * Provides structured error logging with categories, timestamps, and context
 */

export interface ErrorLog {
  timestamp: string;
  level: 'error' | 'warning' | 'info';
  category: 'data-fetch' | 'rendering' | 'interaction' | 'state' | 'unknown';
  message: string;
  details?: any;
  stack?: string;
  context?: Record<string, any>;
}

export class ErrorHandler {
  private static logs: ErrorLog[] = [];
  private static maxLogs = 100;
  
  /**
   * Log an error with structured data
   */
  static logError(
    category: ErrorLog['category'], 
    message: string, 
    details?: any, 
    context?: Record<string, any>
  ) {
    const error: ErrorLog = {
      timestamp: new Date().toISOString(),
      level: 'error',
      category,
      message,
      details,
      context,
      stack: new Error().stack
    };
    
    this.addLog(error);
    console.error(`[${category}] ${message}`, details);
  }
  
  /**
   * Log a warning with structured data
   */
  static logWarning(
    category: ErrorLog['category'], 
    message: string, 
    details?: any
  ) {
    const log: ErrorLog = {
      timestamp: new Date().toISOString(),
      level: 'warning',
      category,
      message,
      details
    };
    
    this.addLog(log);
    console.warn(`[${category}] ${message}`, details);
  }
  
  /**
   * Log informational message
   */
  static logInfo(message: string, context?: Record<string, any>) {
    const log: ErrorLog = {
      timestamp: new Date().toISOString(),
      level: 'info',
      category: 'unknown',
      message,
      context
    };
    
    this.addLog(log);
    console.log(message, context);
  }
  
  /**
   * Add log entry and maintain size limit
   */
  private static addLog(log: ErrorLog) {
    this.logs.push(log);
    // Keep only last N logs to prevent memory bloat
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }
  
  /**
   * Get all current logs
   */
  static getLogs(): ErrorLog[] {
    return [...this.logs];
  }
  
  /**
   * Clear all logs
   */
  static clearLogs() {
    this.logs = [];
  }
  
  /**
   * Export logs as JSON string
   */
  static exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

/**
 * Setup global error handler for WebSocket connection errors
 */
const SUPPRESSED_ERRORS = [
  'Connection interrupted while trying to subscribe',
  'WebSocket connection failed',
  'Failed to execute \'send\' on \'WebSocket\'',
];

export function setupGlobalErrorHandler() {
  window.addEventListener('unhandledrejection', (event) => {
    const errorMessage = event.reason?.message || String(event.reason);
    
    if (SUPPRESSED_ERRORS.some(msg => errorMessage.includes(msg))) {
      console.debug('🔇 Suppressed harmless WebSocket error:', errorMessage);
      event.preventDefault();
      return;
    }
    
    console.error('Unhandled rejection:', event.reason);
  });
}
