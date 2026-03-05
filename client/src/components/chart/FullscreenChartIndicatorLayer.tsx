import { MovingAverages } from '@/components/chart/MovingAverages';
import { VWAPRenderer } from '@/components/indicators/trend/VWAPRenderer';
import { FVGRenderer } from '@/components/indicators/FVGRenderer';
import { OrderBlockRenderer } from '@/components/indicators/OrderBlockRenderer';
import { BreakerBlockRenderer } from '@/components/indicators/BreakerBlockRenderer';
import { BOSRenderer } from '@/components/indicators/BOSRenderer';
import { LiquidityRenderer } from '@/components/indicators/LiquidityRenderer';
import { PDZoneRenderer } from '@/components/indicators/PDZoneRenderer';
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
  breakerBlocks: any[];
  bbSettings: any;
  structureBreaks: any[];
  swingPoints: any[];
  sessionSeparators: any[];
  bosSettings: any;
  liquidityZones: any[];
  liquiditySettings: any;
  pdZones: any[];
  pdZoneSettings: any;
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
  /** When true, all indicators except FVG are hidden */
  fvgOnlyMode?: boolean;
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
  breakerBlocks,
  bbSettings,
  structureBreaks,
  swingPoints,
  sessionSeparators,
  bosSettings,
  liquidityZones,
  liquiditySettings,
  pdZones,
  pdZoneSettings,
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
  fvgOnlyMode = false,
}: FullscreenChartIndicatorLayerProps) {
  return (
    <>
      <MovingAverages
        chart={chart}
        maConfigs={emaConfigs}
        show={!fvgOnlyMode && showEma}
        candles={candles}
        calculateEMA={calculateEMA}
        emaHTFDataCache={emaHTFDataCache}
        symbol={symbol}
        interval={interval}
      />

      <ElderImpulseRenderer
        chart={chart}
        candles={candles}
        show={!fvgOnlyMode && elderImpulseEnabled}
      />

      <VWAPRenderer
        chart={chart}
        candles={candles}
        showSession={!fvgOnlyMode && vwapShowSession}
        showDaily={!fvgOnlyMode && vwapShowDaily}
        showWeekly={!fvgOnlyMode && vwapShowWeekly}
        showMonthly={!fvgOnlyMode && vwapShowMonthly}
        showRolling={!fvgOnlyMode && vwapShowRolling}
        rollingPeriod={vwapRollingPeriod}
      />

      <FVGRenderer
        chart={chart}
        candleSeries={candleSeries}
        fvgs={fvgs}
        settings={fvgSettings}
      />

      {!fvgOnlyMode && (
        <>
          <OrderBlockRenderer
            chart={chart}
            candleSeries={candleSeries}
            orderBlocks={orderBlocks}
            settings={obSettings}
          />

          <BreakerBlockRenderer
            chart={chart}
            candleSeries={candleSeries}
            breakerBlocks={breakerBlocks}
            settings={bbSettings}
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

          <PDZoneRenderer
            chart={chart}
            candleSeries={candleSeries}
            zones={pdZones}
            settings={pdZoneSettings}
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
        </>
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
