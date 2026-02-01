import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brain, Zap, TrendingUp, Calendar, Loader2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TradingStrategy {
  name: string;
  entryConditions: any[];
  exitConditions: any[];
}

interface StrategyGeneratorPanelProps {
  onGenerateStrategy: (type: 'scalping' | 'day-trading' | 'swing-trading') => void;
  currentStrategy?: TradingStrategy;
  candles?: any[];
  indicators?: any;
}

export function StrategyGeneratorPanel({
  onGenerateStrategy,
  currentStrategy,
  candles,
  indicators
}: StrategyGeneratorPanelProps) {
  const [strategyType, setStrategyType] = useState<'scalping' | 'day-trading' | 'swing-trading'>('day-trading');
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await onGenerateStrategy(strategyType);
      toast({
        title: 'Strategy Generated',
        description: `${strategyType} strategy created successfully`
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate strategy',
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-400" />
          Strategy Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Strategy Type Selector */}
        <div className="space-y-2">
          <Label className="text-xs text-gray-400">Strategy Type</Label>
          <Select value={strategyType} onValueChange={(val: any) => setStrategyType(val)}>
            <SelectTrigger className="bg-slate-900 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="scalping">
                <div className="flex items-center gap-2">
                  <Zap className="h-3 w-3 text-yellow-400" />
                  <span>Scalping (1-5min)</span>
                </div>
              </SelectItem>
              <SelectItem value="day-trading">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3 w-3 text-blue-400" />
                  <span>Day Trading (15m-1h)</span>
                </div>
              </SelectItem>
              <SelectItem value="swing-trading">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3 w-3 text-green-400" />
                  <span>Swing Trading (4h-1d)</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Current Strategy Summary */}
        {currentStrategy && (
          <div className="bg-slate-900 p-3 rounded border border-slate-700">
            <div className="text-xs text-gray-400 mb-1">Current Strategy</div>
            <div className="text-sm text-white font-medium">{currentStrategy.name}</div>
            <div className="text-xs text-gray-400 mt-1">
              Entry: {currentStrategy.entryConditions.length} conditions
              • Exit: {currentStrategy.exitConditions.length} conditions
            </div>
          </div>
        )}

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full bg-purple-600 hover:bg-purple-700"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Strategy
            </>
          )}
        </Button>

        {/* Strategy Templates */}
        <div className="space-y-2">
          <div className="text-xs text-gray-400">Quick Templates</div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onGenerateStrategy('scalping')}
              className="text-xs"
            >
              RSI Scalp
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onGenerateStrategy('day-trading')}
              className="text-xs"
            >
              MACD Trend
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onGenerateStrategy('swing-trading')}
              className="text-xs"
            >
              EMA Cross
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onGenerateStrategy('day-trading')}
              className="text-xs"
            >
              SMC Setup
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
