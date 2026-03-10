import { MovingAverages } from '@/components/chart/MovingAverages';
import { VWAPRenderer } from '@/components/indicators/trend/VWAPRenderer';
import { FVGRenderer } from '@/components/indicators/FVGRenderer';
import { OrderBlockRenderer } from '@/components/indicators/OrderBlockRenderer';
import { BreakerRenderer } from '@/components/indicators/BreakerRenderer';
import { BOSRenderer } from '@/components/indicators/BOSRenderer';
import { LiquidityRenderer } from '@/components/indicators/LiquidityRenderer';
import { AutoFibRenderer } from '@/components/indicators/AutoFibRenderer';
import { VolumeProfileRenderer } from '@/components/indicators/VolumeProfileRenderer';
import { VolumeProfileSettingsModal } from '@/components/modals/VolumeProfileSettingsModal';
import { SuperTrendRenderer } from '@/components/indicators/SuperTrendRenderer';
import { ElderImpulseRenderer } from '@/components/indicators/ElderImpulseRenderer';
import { DivergenceRenderer } from '@/components/divergence/DivergenceRenderer';
import { DivergenceBadgePopup } from '@/components/divergence/DivergenceBadgePopup';
import { DivergenceSettingsModal } from '@/components/divergence/DivergenceSettingsModal';
import { SqueezeMomentumSettingsModal } from '@/components/modals/SqueezeMomentumSettingsModal';
import { getConditionWeights } from '@/lib/conditionWeights';

interface FullscreenChartIndicatorLayerProps {
  chart: any;
  candleSeries: any;
  candles: any[];
  calculateEMA: (prices: number[], period: number) => number[];
  emaConfigs: any;
  showEma: boolean;
  emaHTFDataCache: any;
  symbol: string;
  interval: string;
  elderImpulseEnabled: boolean;

  vwapShowSession: boolean;
  vwapShowDaily: boolean;
  vwapShowWeekly: boolean;
  vwapShowMonthly: boolean;
  vwapShowRolling: boolean;
  vwapRollingPeriod: number;

  fvgs: any[];
  fvgSettings: any;
  orderBlocks: any[];
  obSettings: any;
  breakers: any[];
  breakerSettings: any;
  structureBreaks: any[];
  swingPoints: any[];
  sessionSeparators: any[];
  bosSettings: any;
  liquidityZones: any[];
  liquiditySettings: any;
  autoFibResult: any;
  autoFibSettings: any;

  volumeProfileData: any;
  vpSettings: any;
  showVPModal: boolean;
  onCloseVPModal: () => void;
  onVPSettingsChange: (value: any) => void;

  superTrendData: any;
  superTrendSettings: any;

  divergenceScannerEnabled: boolean;
  filteredDivergencePoints: any[];
  onSelectDivergencePoint: (point: any) => void;
  selectedDivergencePoint: any | null;
  onCloseDivergencePoint: () => void;
  showDivergenceSettings: boolean;
  onCloseDivergenceSettings: () => void;
  divergenceSettings: any;
  onDivergenceSettingsChange: (value: any) => void;

  showSqueezeSettings: boolean;
  onCloseSqueezeSettings: () => void;
  squeezeSettings: any;
  onSqueezeSettingsChange: (value: any) => void;
  onResetSqueezeSettings: () => void;
}

export function FullscreenChartIndicatorLayer({
  chart,
  candleSeries,
  candles,
  calculateEMA,
  emaConfigs,
  showEma,
  emaHTFDataCache,
  symbol,
  interval,
  elderImpulseEnabled,
  vwapShowSession,
  vwapShowDaily,
  vwapShowWeekly,
  vwapShowMonthly,
  vwapShowRolling,
  vwapRollingPeriod,
  fvgs,
  fvgSettings,
  orderBlocks,
  obSettings,
  breakers,
  breakerSettings,
  structureBreaks,
  swingPoints,
  sessionSeparators,
  bosSettings,
  liquidityZones,
  liquiditySettings,
  autoFibResult,
  autoFibSettings,
  volumeProfileData,
  vpSettings,
  showVPModal,
  onCloseVPModal,
  onVPSettingsChange,
  superTrendData,
  superTrendSettings,
  divergenceScannerEnabled,
  filteredDivergencePoints,
  onSelectDivergencePoint,
  selectedDivergencePoint,
  onCloseDivergencePoint,
  showDivergenceSettings,
  onCloseDivergenceSettings,
  divergenceSettings,
  onDivergenceSettingsChange,
  showSqueezeSettings,
  onCloseSqueezeSettings,
  squeezeSettings,
  onSqueezeSettingsChange,
  onResetSqueezeSettings,
}: FullscreenChartIndicatorLayerProps) {
  return (
    <>
      <MovingAverages
        chart={chart}
        maConfigs={emaConfigs}
        show={showEma}
        candles={candles}
        calculateEMA={calculateEMA}
        emaHTFDataCache={emaHTFDataCache}
        symbol={symbol}
        interval={interval}
      />

      <ElderImpulseRenderer
        chart={chart}
        candles={candles}
        show={elderImpulseEnabled}
      />

      <VWAPRenderer
        chart={chart}
        candles={candles}
        showSession={vwapShowSession}
        showDaily={vwapShowDaily}
        showWeekly={vwapShowWeekly}
        showMonthly={vwapShowMonthly}
        showRolling={vwapShowRolling}
        rollingPeriod={vwapRollingPeriod}
      />

      <FVGRenderer
        chart={chart}
        candleSeries={candleSeries}
        fvgs={fvgs}
        settings={fvgSettings}
      />

      <OrderBlockRenderer
        chart={chart}
        candleSeries={candleSeries}
        orderBlocks={orderBlocks}
        settings={obSettings}
      />

      <BreakerRenderer
        chart={chart}
        candleSeries={candleSeries}
        breakers={breakers}
        settings={breakerSettings}
      />

      <BOSRenderer
        chart={chart}
        candleSeries={candleSeries}
        structureBreaks={structureBreaks}
        swingPoints={swingPoints}
        sessionSeparators={sessionSeparators}
        settings={bosSettings}
      />

      <LiquidityRenderer
        chart={chart}
        candleSeries={candleSeries}
        zones={liquidityZones}
        settings={liquiditySettings}
      />

      <AutoFibRenderer
        chart={chart}
        candleSeries={candleSeries}
        result={autoFibResult}
        settings={autoFibSettings}
        weight={getConditionWeights('smart-money').autoFibConfluence ?? 0}
      />

      <VolumeProfileRenderer
        chart={chart}
        candleSeries={candleSeries}
        data={volumeProfileData}
        settings={vpSettings}
      />

      <SuperTrendRenderer
        chart={chart}
        candleSeries={candleSeries}
        data={superTrendData}
        settings={superTrendSettings}
      />

      {divergenceScannerEnabled && (
        <DivergenceRenderer
          chart={chart}
          candleSeries={candleSeries}
          divergencePoints={filteredDivergencePoints}
          onBadgeClick={onSelectDivergencePoint}
          settings={divergenceSettings}
        />
      )}

      {selectedDivergencePoint && (
        <DivergenceBadgePopup
          point={selectedDivergencePoint}
          onClose={onCloseDivergencePoint}
        />
      )}

      <VolumeProfileSettingsModal
        isOpen={showVPModal}
        onClose={onCloseVPModal}
        settings={vpSettings}
        onSettingsChange={onVPSettingsChange}
      />

      <DivergenceSettingsModal
        isOpen={showDivergenceSettings}
        onClose={onCloseDivergenceSettings}
        settings={divergenceSettings}
        onSettingsChange={onDivergenceSettingsChange}
      />

      <SqueezeMomentumSettingsModal
        isOpen={showSqueezeSettings}
        onClose={onCloseSqueezeSettings}
        settings={squeezeSettings}
        onSettingsChange={onSqueezeSettingsChange}
        onReset={onResetSqueezeSettings}
      />
    </>
  );
}
