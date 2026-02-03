/**
 * ExchangeStatusPopover Component
 * 
 * Displays multi-exchange orderflow aggregation status with:
 * - Connection status for each exchange (success/failure)
 * - Trade counts and response times
 * - Retry indicators
 * - Average metrics and success rate
 * - Divergence alerts when detected
 */

interface ExchangeMetadata {
  exchange_id: string;
  exchange: string;
  success: boolean;
  trades_count?: number;
  response_time_ms?: number;
  retries?: number;
  error?: string;
}

interface MultiExchangeMetadata {
  exchanges: ExchangeMetadata[];
  avg_response_time_ms: number;
  success_rate: number;
}

interface MultiExchangeData {
  metadata?: MultiExchangeMetadata;
  divergences?: any[];
}

interface ExchangeStatusPopoverProps {
  /** Multi-exchange data including metadata and divergences */
  multiExchangeData: MultiExchangeData | null;
  /** Loading state for multi-exchange data fetching */
  multiExchangeLoading: boolean;
  /** Whether multi-exchange mode is enabled */
  useMultiExchange: boolean;
}

/**
 * ExchangeStatusPopover displays the status of multi-exchange orderflow aggregation.
 * Shows connection status, trade counts, response times, and divergence alerts.
 */
export function ExchangeStatusPopover({
  multiExchangeData,
  multiExchangeLoading,
  useMultiExchange
}: ExchangeStatusPopoverProps) {
  return (
    <>
      {multiExchangeLoading && (
        <span className="text-xs text-yellow-400">Loading...</span>
      )}
      {multiExchangeData?.metadata?.exchanges && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-400">
            🌐 Multi-Exchange
          </span>
          <details className="relative group">
            <summary className="cursor-pointer text-xs text-cyan-400 hover:text-cyan-300 list-none">
              {(multiExchangeData.metadata.exchanges || []).filter((e: ExchangeMetadata) => e.success).length}/{(multiExchangeData.metadata.exchanges || []).length} ℹ️
            </summary>
            <div className="absolute right-0 top-6 z-50 bg-slate-900 border border-slate-700 rounded-md shadow-xl p-3 min-w-[280px]">
              <div className="text-xs font-semibold text-white mb-2 border-b border-slate-700 pb-2">
                Exchange Status
              </div>
              <div className="space-y-1.5">
                {(multiExchangeData.metadata.exchanges || []).map((ex: ExchangeMetadata) => (
                  <div key={ex.exchange_id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {ex.success ? (
                        <span className="text-green-400">✓</span>
                      ) : (
                        <span className="text-red-400">✗</span>
                      )}
                      <span className={ex.success ? 'text-gray-300' : 'text-gray-500'}>
                        {ex.exchange}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {ex.success && (
                        <>
                          <span className="text-gray-400">{ex.trades_count} trades</span>
                          <span className="text-gray-500">{ex.response_time_ms}ms</span>
                          {ex.retries && ex.retries > 0 && (
                            <span className="text-yellow-400 text-[10px]">↻{ex.retries}</span>
                          )}
                        </>
                      )}
                      {!ex.success && ex.error && (
                        <span className="text-red-400 text-[10px] max-w-[120px] truncate" title={ex.error}>
                          {ex.error}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-700 text-[10px] text-gray-400">
                Avg response: {Math.round(multiExchangeData.metadata.avg_response_time_ms)}ms | 
                Success: {(multiExchangeData.metadata.success_rate * 100).toFixed(0)}%
              </div>
            </div>
          </details>
        </div>
      )}
      {useMultiExchange && multiExchangeData?.divergences && multiExchangeData.divergences.length > 0 && (
        <div className="mt-2 text-xs text-yellow-400 bg-yellow-900/20 p-2 rounded border border-yellow-700/50">
          ⚠️ {multiExchangeData.divergences.length} divergence alert{multiExchangeData.divergences.length > 1 ? 's' : ''} detected
        </div>
      )}
    </>
  );
}
