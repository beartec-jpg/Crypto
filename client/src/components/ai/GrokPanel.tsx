import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GrokInsights } from './GrokInsights';

interface GrokPanelProps {
  onRequestAnalysis: () => void;
  isLoading: boolean;
  insights: any | null;
}

export function GrokPanel({ onRequestAnalysis, isLoading, insights }: GrokPanelProps) {
  return (
    <div className="rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-900/20 to-blue-900/20 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">Grok AI Analysis</h3>
        </div>
      </div>

      <Button
        onClick={onRequestAnalysis}
        disabled={isLoading}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
      >
        {isLoading ? 'Analyzing...' : 'Get AI Insights'}
      </Button>

      {insights && <GrokInsights insights={insights} />}
    </div>
  );
}
