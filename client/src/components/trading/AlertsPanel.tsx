import { MarketAlert } from '@/types/trading.types';

interface AlertsPanelProps {
  alerts: MarketAlert[];
  onAddAlert: (alert: Partial<MarketAlert>) => void;
  onRemoveAlert: (id: string) => void;
}

export function AlertsPanel({ alerts, onAddAlert, onRemoveAlert }: AlertsPanelProps) {
  return (
    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-white mb-4">Alerts</h3>
      
      <div className="space-y-4">
        {/* Placeholder for future alert creation form */}
        <div className="bg-gray-900 border border-gray-800 rounded p-3">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Add Alert</h4>
          <div className="text-xs text-gray-400">
            <p>Configure alert conditions:</p>
            <ul className="mt-2 space-y-1">
              <li>• Price levels</li>
              <li>• Technical indicators</li>
              <li>• Volume thresholds</li>
            </ul>
          </div>
        </div>

        {alerts.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-400 mb-2">Active Alerts</h4>
            <div className="space-y-2">
              {alerts.map((alert) => {
                const timestamp = new Date(alert.time).toLocaleTimeString();
                
                return (
                  <div key={alert.id} className="bg-gray-900 border border-gray-800 rounded p-3">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          alert.direction === 'bullish' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                        }`}>
                          {alert.type}
                        </span>
                        <span className={`text-xs ${
                          alert.direction === 'bullish' ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {alert.direction.toUpperCase()}
                        </span>
                      </div>
                      <button
                        onClick={() => onRemoveAlert(alert.id)}
                        className="text-gray-500 hover:text-gray-300 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                    <p className="text-sm text-white mb-1">{alert.description}</p>
                    <div className="flex justify-between items-center text-xs text-gray-400">
                      <span>Price: ${alert.price.toFixed(2)}</span>
                      <span>{timestamp}</span>
                    </div>
                    {alert.level && (
                      <div className="mt-1 text-xs text-gray-400">
                        Divergence Level: {alert.level}/5
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
