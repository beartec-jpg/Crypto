/**
 * Hook for error handling in functional components
 * Provides error state management and logging utilities
 */

import { useState, useCallback } from 'react';
import { ErrorHandler, ErrorLog } from '@/lib/errorHandler';

export const useErrorHandler = () => {
  const [error, setError] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  /**
   * Handle an error - logs it and sets error state
   */
  const handleError = useCallback(
    (
      category: ErrorLog['category'], 
      message: string, 
      details?: any, 
      context?: Record<string, any>
    ) => {
      ErrorHandler.logError(category, message, details, context);
      setError(message);
      setIsError(true);
    },
    []
  );

  /**
   * Handle a warning - logs it without setting error state
   */
  const handleWarning = useCallback(
    (
      category: ErrorLog['category'], 
      message: string, 
      details?: any
    ) => {
      ErrorHandler.logWarning(category, message, details);
    },
    []
  );

  /**
   * Clear the current error state
   */
  const clearError = useCallback(() => {
    setError(null);
    setIsError(false);
  }, []);

  /**
   * Get all error logs
   */
  const getLogs = useCallback(() => {
    return ErrorHandler.getLogs();
  }, []);

  /**
   * Export error logs as a downloadable JSON file
   */
  const exportLogs = useCallback(() => {
    const logsJson = ErrorHandler.exportLogs();
    const blob = new Blob([logsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return {
    error,
    isError,
    handleError,
    handleWarning,
    clearError,
    getLogs,
    exportLogs
  };
};
