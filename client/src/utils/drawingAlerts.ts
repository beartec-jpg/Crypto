/**
 * Utility functions for drawing alerts
 */

interface DrawingStyle {
  alertActive?: boolean;
  alertTriggered?: boolean;
  alertsEnabled?: boolean;
  trendlineAlert?: {
    enabled: boolean;
    triggered?: boolean;
  };
  levelAlerts?: {
    [level: string]: {
      enabled: boolean;
      triggered?: boolean;
    };
  };
}

/**
 * Check if a drawing has any alerts enabled
 */
export function hasAlertsEnabled(drawingType: string, style?: DrawingStyle): boolean {
  if (!style) return false;

  // Legacy horizontal line alerts
  if (drawingType === 'horizontal' && style.alertActive) {
    return true;
  }

  // New trendline/horizontal alerts
  if ((drawingType === 'trendline' || drawingType === 'horizontal') && style.trendlineAlert?.enabled) {
    return true;
  }

  // Level-based alerts (channel, fib, trend_fib, rectangle)
  if (style.levelAlerts) {
    return Object.values(style.levelAlerts).some(alert => alert.enabled);
  }

  return false;
}

/**
 * Check if a drawing has any triggered alerts
 */
export function hasTriggeredAlerts(drawingType: string, style?: DrawingStyle): boolean {
  if (!style) return false;

  // Legacy horizontal line alerts
  if (drawingType === 'horizontal' && style.alertTriggered) {
    return true;
  }

  // New trendline/horizontal alerts
  if ((drawingType === 'trendline' || drawingType === 'horizontal') && style.trendlineAlert?.triggered) {
    return true;
  }

  // Level-based alerts
  if (style.levelAlerts) {
    return Object.values(style.levelAlerts).some(alert => alert.triggered);
  }

  return false;
}

/**
 * Get alert prefix for drawing label
 */
export function getAlertPrefix(drawingType: string, style?: DrawingStyle): string {
  const hasEnabled = hasAlertsEnabled(drawingType, style);
  const hasTriggered = hasTriggeredAlerts(drawingType, style);

  if (hasTriggered) {
    return '🔴 '; // Red circle for triggered
  } else if (hasEnabled) {
    return '🔔 '; // Bell for active
  }

  return '';
}
