import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Settings, TrendingUp, TrendingDown } from 'lucide-react';
import type { MarketAlert } from '@/types/trading.types';

interface MarketAlertsPanelProps {
  alerts: MarketAlert[];
  filterMode: 'all' | 'active';
  onFilterModeChange: (mode: 'all' | 'active') => void;
  onSettingsClick: () => void;
  activeIndicators: Set<string>;
  alertTypeToIndicator: Record<string, string | string[]>;
}

/**
 * Market Alerts Panel - displays detected market alerts from indicators
 * Extracted from CryptoIndicators.tsx for Phase 4G-11
 */
export function MarketAlertsPanel({
  alerts,
  filterMode,
  onFilterModeChange,
  onSettingsClick,
  activeIndicators,
  alertTypeToIndicator
}: MarketAlertsPanelProps) {
  const [minimized, setMinimized] = useState(true);

  // Filter market alerts based on filterMode and active indicators
  const filteredAlerts = useMemo(() => {
    if (filterMode === 'all') {
      return alerts;
    }
    
    // Filter to only show alerts from active indicators
    return alerts.filter(alert => {
      const indicatorKey = alertTypeToIndicator[alert.type];
      
      // Safety fallback: If alert type not in mapping, show it by default and log warning
      if (!indicatorKey) {
        console.warn(`⚠️ Unmapped alert type in filter: "${alert.type}". Showing alert by default. Please add to alertTypeToIndicator mapping.`);
        return true;
      }
      
      // If alert can come from multiple indicators (array), show if ANY are active
      if (Array.isArray(indicatorKey)) {
        return indicatorKey.some(key => activeIndicators.has(key));
      }
      
      // Single indicator - check if it's active
      return activeIndicators.has(indicatorKey);
    });
  }, [alerts, filterMode, activeIndicators, alertTypeToIndicator]);

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader 
        className="pb-2 cursor-pointer"
        onClick={() => setMinimized(!minimized)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <span className={`transition-transform duration-200 ${minimized ? '' : 'rotate-90'}`}>▶</span>
              <span className="text-lg">🔔</span>
              Market Alerts
              {minimized && filteredAlerts.length > 0 && (
                <span className="text-xs bg-blue-600 px-2 py-0.5 rounded-full">{filteredAlerts.length}</span>
              )}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onSettingsClick(); }}
              className="text-gray-400 hover:text-white h-8 px-2"
              data-testid="button-market-alerts-settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1 bg-slate-700 rounded-md p-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onFilterModeChange('all')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                filterMode === 'all' 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
              data-testid="button-alert-filter-all"
            >
              All
            </button>
            <button
              onClick={() => onFilterModeChange('active')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                filterMode === 'active' 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
              data-testid="button-alert-filter-active"
            >
              Active Only
            </button>
          </div>
        </div>
      </CardHeader>
      {!minimized && (
        <CardContent className="space-y-2">
          {filteredAlerts.length === 0 ? (
            <div className="text-gray-400 text-sm text-center py-4">
              {filterMode === 'active' && alerts.length > 0 ? (
                <>
                  <p className="font-semibold">No alerts from active indicators</p>
                  <p className="text-xs mt-1">Enable more indicators or switch to "All" to see all alerts</p>
                </>
              ) : (
                'No alerts yet'
              )}
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto">
              {filteredAlerts.slice(0, 10).map((alert) => (
                <div 
                  key={alert.id}
                  className="bg-slate-900 p-2 rounded border border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {alert.type === 'Liquidity Sweep' && (
                        <span className="text-yellow-400 text-xs font-semibold">💧 SWEEP</span>
                      )}
                      {alert.type === 'BOS' && (
                        <span className="text-green-400 text-xs font-semibold">📈 BOS</span>
                      )}
                      {alert.type === 'CHoCH' && (
                        <span className="text-orange-400 text-xs font-semibold">🔄 CHoCH</span>
                      )}
                      {alert.type === 'FVG' && (
                        <span className="text-purple-400 text-xs font-semibold">⬜ FVG</span>
                      )}
                      {alert.type === 'VWAP Bounce' && (
                        <span className="text-cyan-400 text-xs font-semibold">📊 VWAP BOUNCE</span>
                      )}
                      {alert.type === 'VWAP Cross' && (
                        <span className="text-blue-400 text-xs font-semibold">↗️ VWAP X</span>
                      )}
                      {alert.direction === 'bullish' ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(alert.time * 1000).toLocaleString('en-GB', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric',
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>
                  <div className="text-xs text-gray-300 mt-1">
                    {alert.description}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
