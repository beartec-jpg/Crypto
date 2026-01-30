interface CVDTableItem {
  time: string;
  date?: string;
  timestamp: number;
  delta: number;
  cumDelta: number;
  isBull: boolean;
  volume: number;
  exchanges?: number;
  bullishExchanges?: number;
  bearishExchanges?: number;
  confidence?: number;
  divergence?: boolean;
  highValueDivergence?: boolean;
  volumeMultiple?: number;
}

interface CVDTableProps {
  data: CVDTableItem[];
  useMultiExchange?: boolean;
  cvdSpikeLevel1?: number;
  cvdSpikeLevel2?: number;
  cvdSpikeLevel3?: number;
  tableLimit?: number;
}

export function CVDTable({ 
  data, 
  useMultiExchange = false,
  cvdSpikeLevel1 = 175,
  cvdSpikeLevel2 = 250,
  cvdSpikeLevel3 = 400,
  tableLimit = 20
}: CVDTableProps) {
  if (data.length === 0) {
    return (
      <div className="text-center text-gray-500 py-4">
        No data yet
      </div>
    );
  }

  const currentBar = data[data.length - 1];
  const limitedHistory = data.slice(0, -1).reverse().slice(0, tableLimit - 1);
  
  // Calculate averages
  const bullishBars = data.filter(h => h.delta > 0);
  const bearishBars = data.filter(h => h.delta < 0);
  const avgBullishDelta = bullishBars.length > 0 
    ? bullishBars.reduce((sum, h) => sum + h.delta, 0) / bullishBars.length 
    : 0;
  const avgBearishDelta = bearishBars.length > 0 
    ? bearishBars.reduce((sum, h) => sum + h.delta, 0) / bearishBars.length 
    : 0;
  
  const level1Mult = cvdSpikeLevel1 / 100;
  const level2Mult = cvdSpikeLevel2 / 100;
  const level3Mult = cvdSpikeLevel3 / 100;

  const renderSpikeIndicator = (item: CVDTableItem) => {
    const isBullishSpike = item.delta > 0 && item.delta >= avgBullishDelta * level1Mult;
    const isBearishSpike = item.delta < 0 && item.delta <= avgBearishDelta * level1Mult;
    const hasDivergence = useMultiExchange && item.divergence;
    const bullishExchanges = item.bullishExchanges || 0;
    const bearishExchanges = item.bearishExchanges || 0;
    
    if (isBullishSpike) {
      const multiple = avgBullishDelta > 0 ? item.delta / avgBullishDelta : 0;
      const triangleCount = multiple >= level3Mult ? 3 : multiple >= level2Mult ? 2 : 1;
      const colorClass = bullishExchanges >= 5 ? 'text-green-400' : 
                         bullishExchanges >= 3 ? 'text-blue-400' : 'text-gray-400';
      return (
        <span 
          className={`${colorClass} text-xs font-bold`} 
          title={`${multiple.toFixed(1)}x avg | ${bullishExchanges}/6 exchanges bullish`}
        >
          {'▲'.repeat(triangleCount)}
        </span>
      );
    }
    
    if (isBearishSpike) {
      const multiple = avgBearishDelta !== 0 ? Math.abs(item.delta / avgBearishDelta) : 0;
      const triangleCount = multiple >= level3Mult ? 3 : multiple >= level2Mult ? 2 : 1;
      const colorClass = bearishExchanges >= 5 ? 'text-red-400' : 
                         bearishExchanges >= 3 ? 'text-yellow-400' : 'text-gray-400';
      return (
        <span 
          className={`${colorClass} text-xs font-bold`} 
          title={`${multiple.toFixed(1)}x avg | ${bearishExchanges}/6 exchanges bearish`}
        >
          {'▼'.repeat(triangleCount)}
        </span>
      );
    }
    
    if (item.highValueDivergence) {
      return (
        <span 
          className="text-orange-400 text-xs" 
          title={`High-value divergence (${item.volumeMultiple?.toFixed(1)}x volume)`}
        >
          🔥
        </span>
      );
    }
    
    if (hasDivergence) {
      return (
        <span className="text-yellow-400 text-xs" title="CVD/Delta divergence">
          ⚠️
        </span>
      );
    }
    
    return null;
  };

  const renderTableRow = (item: CVDTableItem, isLive: boolean = false) => {
    const hasDivergence = useMultiExchange && item.divergence;
    const cellBg = hasDivergence 
      ? 'bg-yellow-900/20' 
      : item.isBull ? 'bg-green-900/20' : 'bg-red-900/20';
    
    const rowClassName = isLive 
      ? 'bg-blue-900/30 border-b-2 border-blue-500 animate-pulse' 
      : `border-b border-slate-700/50 ${cellBg}`;

    return (
      <tr key={isLive ? 'live' : item.timestamp} className={rowClassName}>
        <td className={isLive ? "text-blue-300 py-1 px-1 font-mono text-[10px] font-bold" : "text-gray-300 py-1 px-1 font-mono text-[10px]"}>
          {isLive ? '🔴 LIVE' : item.time}
        </td>
        <td className={`text-right py-1 px-1 font-mono ${isLive ? 'font-bold' : 'font-semibold'} ${item.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {item.delta > 0 ? '+' : ''}{(item.delta / 1000).toFixed(1)}k
        </td>
        <td className={`text-right py-1 px-1 font-mono ${isLive ? 'font-bold' : 'font-semibold'} ${item.cumDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {(item.cumDelta / 1000).toFixed(1)}k
        </td>
        {useMultiExchange && (
          <>
            <td className={`text-center py-1 px-1 ${isLive ? 'text-gray-300 font-semibold' : 'text-gray-300'}`}>
              {item.exchanges || 0}
            </td>
            <td className="text-center py-1 px-1 font-mono text-[10px]">
              <span className="text-green-400">{item.bullishExchanges || 0}</span>
              <span className="text-gray-500">/</span>
              <span className="text-red-400">{item.bearishExchanges || 0}</span>
            </td>
            <td className="text-center py-1 px-1">
              <span className={`text-[10px] ${isLive ? 'font-bold' : 'font-semibold'} ${
                (item.confidence || 0) >= 0.8 ? 'text-green-400' :
                (item.confidence || 0) >= 0.6 ? 'text-yellow-400' :
                'text-red-400'
              }`} title={`${((item.confidence || 0) * 100).toFixed(0)}% confidence`}>
                {((item.confidence || 0) * 100).toFixed(0)}%
              </span>
            </td>
          </>
        )}
        <td className="text-center py-1 px-1">
          {renderSpikeIndicator(item)}
        </td>
      </tr>
    );
  };

  return (
    <div className="overflow-auto max-h-96">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-800 border-b border-slate-600 z-10">
          <tr>
            <th className="text-left py-1 px-1 font-semibold text-gray-400">Time</th>
            <th className="text-right py-1 px-1 font-semibold text-gray-400">Δ</th>
            <th className="text-right py-1 px-1 font-semibold text-gray-400">CVD</th>
            {useMultiExchange && (
              <>
                <th className="text-center py-1 px-1 font-semibold text-gray-400">Ex</th>
                <th className="text-center py-1 px-1 font-semibold text-gray-400">B/S</th>
                <th className="text-center py-1 px-1 font-semibold text-gray-400">Conf</th>
              </>
            )}
            <th className="text-center py-1 px-1 font-semibold text-gray-400">Alert</th>
          </tr>
        </thead>
        <tbody>
          {renderTableRow(currentBar, true)}
          {limitedHistory.map(item => renderTableRow(item, false))}
        </tbody>
        <tfoot className="sticky bottom-0 bg-slate-800 border-t border-slate-600">
          <tr>
            <td className="text-gray-400 py-1 px-1 text-[10px]">Avg</td>
            <td className="text-right py-1 px-1 font-mono">
              <div className="flex flex-col text-[10px]">
                <span className="text-green-400">
                  {bullishBars.length > 0
                    ? (avgBullishDelta / 1000).toFixed(1) + 'k'
                    : '-'}
                </span>
                <span className="text-red-400">
                  {bearishBars.length > 0
                    ? (avgBearishDelta / 1000).toFixed(1) + 'k'
                    : '-'}
                </span>
              </div>
            </td>
            <td colSpan={useMultiExchange ? 5 : 2}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
