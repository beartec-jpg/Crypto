import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IndicatorSettings } from './IndicatorSettings';
import { ChartSettings } from './ChartSettings';

interface SettingsPanelProps {
  indicators: any;
  onIndicatorToggle: (indicator: string, value: boolean) => void;
  onIndicatorPeriodChange: (indicator: string, field: string, value: number) => void;
  theme?: 'dark' | 'light';
  onThemeChange?: (theme: 'dark' | 'light') => void;
}

export function SettingsPanel({ 
  indicators, 
  onIndicatorToggle, 
  onIndicatorPeriodChange,
  theme,
  onThemeChange
}: SettingsPanelProps) {
  return (
    <div className="p-4 bg-[#1a1a1a] border border-gray-800 rounded">
      <h3 className="text-lg font-semibold text-white mb-4">Settings</h3>
      
      <Tabs defaultValue="indicators">
        <TabsList className="w-full">
          <TabsTrigger value="indicators" className="flex-1">Indicators</TabsTrigger>
          <TabsTrigger value="chart" className="flex-1">Chart</TabsTrigger>
        </TabsList>
        
        <TabsContent value="indicators" className="mt-4">
          <IndicatorSettings 
            indicators={indicators}
            onToggle={onIndicatorToggle}
            onPeriodChange={onIndicatorPeriodChange}
          />
        </TabsContent>
        
        <TabsContent value="chart" className="mt-4">
          <ChartSettings theme={theme} onThemeChange={onThemeChange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
