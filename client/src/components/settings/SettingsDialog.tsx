import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IndicatorSettings } from './IndicatorSettings';
import { ChartSettings } from './ChartSettings';
import { APISettings } from './APISettings';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicators: any;
  onUpdateIndicator: (indicator: string, updates: any) => void;
  chartTheme: 'dark' | 'light';
  onThemeChange?: (theme: 'dark' | 'light') => void;
  apiKeys?: {
    binance: string;
    coinbase: string;
    xai: string;
  };
  onUpdateApiKey?: (provider: string, key: string) => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  indicators,
  onUpdateIndicator,
  chartTheme,
  onThemeChange,
  apiKeys = { binance: '', coinbase: '', xai: '' },
  onUpdateApiKey,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-[#0e0e0e] border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">Settings</DialogTitle>
          <DialogDescription className="text-gray-400">
            Configure your chart indicators, appearance, and API keys
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="indicators" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-[#1a1a1a]">
            <TabsTrigger value="indicators">Indicators</TabsTrigger>
            <TabsTrigger value="chart">Chart</TabsTrigger>
            <TabsTrigger value="api">API Keys</TabsTrigger>
          </TabsList>

          <TabsContent value="indicators" className="mt-4">
            <IndicatorSettings 
              indicators={indicators}
              onToggle={(indicator, value) => onUpdateIndicator(indicator, { show: value })}
              onPeriodChange={(indicator, field, value) => onUpdateIndicator(indicator, { [field]: value })}
            />
          </TabsContent>

          <TabsContent value="chart" className="mt-4">
            <ChartSettings 
              theme={chartTheme}
              onThemeChange={onThemeChange}
            />
          </TabsContent>

          <TabsContent value="api" className="mt-4">
            <APISettings 
              apiKeys={apiKeys}
              onUpdateApiKey={onUpdateApiKey}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
