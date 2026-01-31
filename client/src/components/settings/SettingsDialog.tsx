import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { IndicatorSettings } from './IndicatorSettings';
import { ChartSettings } from './ChartSettings';
import { SMCSettings } from './SMCSettings';
import { APISettings } from './APISettings';

interface IndicatorConfig {
  show: boolean;
  period?: number;
  fast?: number;
  slow?: number;
  signal?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  swingLength?: number;
  volumeThreshold?: number;
  showHighValueOnly?: boolean;
  showMitigated?: boolean;
}

interface IndicatorState {
  rsi?: IndicatorConfig;
  macd?: IndicatorConfig;
  stochastic?: IndicatorConfig;
  obv?: IndicatorConfig;
  mfi?: IndicatorConfig;
  williamsR?: IndicatorConfig;
  cci?: IndicatorConfig;
  adx?: IndicatorConfig;
  bollingerBands?: IndicatorConfig;
  atr?: IndicatorConfig;
  fvg?: IndicatorConfig;
  bos?: IndicatorConfig;
  choch?: IndicatorConfig;
  orderBlocks?: IndicatorConfig;
  ema?: IndicatorConfig & { fastPeriod: number; slowPeriod: number };
  sma?: IndicatorConfig & { period: number };
}

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  indicators: IndicatorState;
  onUpdateIndicator: (indicator: string, updates: any) => void;
  chartTheme?: 'light' | 'dark';
  onThemeChange?: (theme: 'light' | 'dark') => void;
  apiKeys?: {
    binance?: string;
    coinbase?: string;
    xai?: string;
  };
  onUpdateApiKey?: (provider: string, key: string) => void;
}

export function SettingsDialog({
  isOpen,
  onClose,
  indicators,
  onUpdateIndicator,
  chartTheme = 'dark',
  onThemeChange,
  apiKeys = {},
  onUpdateApiKey
}: SettingsDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chart Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="indicators" className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="indicators">Indicators</TabsTrigger>
            <TabsTrigger value="chart">Chart</TabsTrigger>
            <TabsTrigger value="smc">SMC</TabsTrigger>
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

          <TabsContent value="smc" className="mt-4">
            <SMCSettings 
              isPaidTier={true}
              indicators={indicators as any}
              handleSMCToolToggle={() => {}}
              cvdSpikeEnabled={false}
              setCvdSpikeEnabled={() => {}}
              cvdSpikeLevel1Input=""
              setCvdSpikeLevel1Input={() => {}}
              cvdSpikeLevel1={0}
              setCvdSpikeLevel1={() => {}}
              cvdSpikeLevel2Input=""
              setCvdSpikeLevel2Input={() => {}}
              cvdSpikeLevel2={0}
              setCvdSpikeLevel2={() => {}}
              cvdSpikeLevel3Input=""
              setCvdSpikeLevel3Input={() => {}}
              cvdSpikeLevel3={0}
              setCvdSpikeLevel3={() => {}}
              fvgVolumeThreshold={indicators.fvg?.volumeThreshold || 1.5}
              setFvgVolumeThreshold={(value) => onUpdateIndicator('fvg', { volumeThreshold: value })}
              chartBosSwingLengthInput={String(indicators.bos?.swingLength || 5)}
              setChartBosSwingLengthInput={() => {}}
              chartBosSwingLength={indicators.bos?.swingLength || 5}
              setChartBosSwingLength={(value) => onUpdateIndicator('bos', { swingLength: value })}
              chartChochSwingLengthInput={String(indicators.choch?.swingLength || 20)}
              setChartChochSwingLengthInput={() => {}}
              chartChochSwingLength={indicators.choch?.swingLength || 20}
              setChartChochSwingLength={(value) => onUpdateIndicator('choch', { swingLength: value })}
              stratLiquidityGrab={false}
              setStratLiquidityGrab={() => {}}
              chartLiquiditySweepSwingLengthInput=""
              setChartLiquiditySweepSwingLengthInput={() => {}}
              chartLiquiditySweepSwingLength={0}
              setChartLiquiditySweepSwingLength={() => {}}
              interval="1h"
              saveToTimeframe={() => {}}
              makeTimeframeDefault={() => {}}
            />
          </TabsContent>

          <TabsContent value="api" className="mt-4">
            {onUpdateApiKey && (
              <APISettings 
                apiKeys={apiKeys}
                onUpdateApiKey={onUpdateApiKey}
              />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
