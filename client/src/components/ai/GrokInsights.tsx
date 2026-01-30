interface GrokInsightsProps {
  insights: any;
}

export function GrokInsights({ insights }: GrokInsightsProps) {
  return (
    <div className="mt-4 space-y-3 text-sm">
      {insights.marketBias && (
        <div>
          <span className="text-gray-400">Market Bias: </span>
          <span className="text-white">{insights.marketBias}</span>
        </div>
      )}

      {insights.keyLevels && insights.keyLevels.length > 0 && (
        <div>
          <div className="text-gray-400 mb-1">Key Levels:</div>
          <ul className="list-disc list-inside space-y-1">
            {insights.keyLevels.map((level: string, index: number) => (
              <li key={index} className="text-white">{level}</li>
            ))}
          </ul>
        </div>
      )}

      {insights.summary && (
        <div>
          <span className="text-gray-400">Summary: </span>
          <span className="text-white">{insights.summary}</span>
        </div>
      )}
    </div>
  );
}
