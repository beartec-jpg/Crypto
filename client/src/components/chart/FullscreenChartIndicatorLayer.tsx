import { MovingAverages } from '@/components/chart/MovingAverages';
import { VWAPRenderer } from '@/components/indicators/trend/VWAPRenderer';
import { FVGRenderer } from '@/components/indicators/FVGRenderer';
import { OrderBlockRenderer } from '@/components/indicators/OrderBlockRenderer';
import { BreakerRenderer } from '@/components/indicators/BreakerRenderer';
import { BOSRenderer } from '@/components/indicators/BOSRenderer';
import { LiquidityRenderer } from '@/components/indicators/LiquidityRenderer';
import { PDZoneRenderer } from '@/components/indicators/PDZoneRenderer';
import { AutoFibRenderer } from '@/components/indicators/AutoFibRenderer';
import { VolumeProfileRenderer } from '@/components/indicators/VolumeProfileRenderer';
import { VolumeProfileSettingsModal } from '@/components/modals/VolumeProfileSettingsModal';
import { LiquidityHeatmapRenderer } from '@/components/indicators/LiquidityHeatmapRenderer';
import { LiquidityHeatmapSettingsModal } from '@/components/modals/LiquidityHeatmapSettingsModal';
import { LiquidityHeatmapDebugPanel } from '@/components/debug/LiquidityHeatmapDebugPanel';
import { SuperTrendRenderer } from '@/components/indicators/SuperTrendRenderer';
import { ElderImpulseRenderer } from '@/components/indicators/ElderImpulseRenderer';
import { HighLowRenderer } from '@/components/indicators/HighLowRenderer';
import { VolumeEmaOverlay } from '@/components/indicators/volume/VolumeEmaOverlay';
import { VolumeEmaSettingsModal } from '@/components/modals/VolumeEmaSettingsModal';
import { AutoTrendlineRenderer } from '@/components/indicators/AutoTrendlineRenderer';
import { AutoTrendlineSettingsModal } from '@/components/modals/AutoTrendlineSettingsModal';
import { DivergenceRenderer } from '@/components/divergence/DivergenceRenderer';
import type { AutoTrendlineResult, AutoTrendlineSettings, AutoTrendlineTierId, AutoTrendlineTierSettings } from '@/types/autoTrendline';
import type { VolumeEmaSettings } from '@/types/volumeEma';
import { DivergenceBadgePopup } from '@/components/divergence/DivergenceBadgePopup';
import { DivergenceSettingsModal } from '@/components/divergence/DivergenceSettingsModal';
import { getConditionWeights } from '@/lib/conditionWeights';
import type { LiquidityHeatmapDebugInfo } from '@/hooks/useLiquidityHeatmapData';
import type { PredictedLiquidityPoint, LiquidationZone } from '@/hooks/useLiquidityPivotAnalysis';

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
  pdZones: any[];
  pdZoneSettings: any;
  autoFibResult: any;
  autoFibSettings: any;

  volumeProfileData: any;
  vpSettings: any;
  showVPModal: boolean;
  onCloseVPModal: () => void;
  onVPSettingsChange: (value: any) => void;

  liquidityHeatmapData: any;
  lhSettings: any;
  lhEffectiveRange: any;
  showLHModal: boolean;
  onCloseLHModal: () => void;
  onLHSettingsChange: (value: any) => void;
  lhIsLoading: boolean;
  lhError: string | null;
  lhDebugInfo: LiquidityHeatmapDebugInfo;

  liquidityPivotAnalysis: {
    points: PredictedLiquidityPoint[];
    zones: LiquidationZone[];
    directionBias: 'long' | 'short' | 'neutral';
    confidence: number;
  };

  superTrendData: any;
  superTrendSettings: any;

  highLowEnabled: boolean;
  /** Increments when the live chart instance is ready so High/Low can bind. */
  chartEpoch?: number;
  volumeEmaEnabled: boolean;
  volumeEmaSettings: VolumeEmaSettings;
  showVolumeEmaModal: boolean;
  onCloseVolumeEmaModal: () => void;
  onVolumeEmaSettingsChange: (updates: Partial<VolumeEmaSettings>) => void;
  onVolumeEmaReset?: () => void;
  autoTrendlineSettings: AutoTrendlineSettings;
  autoTrendlineResult: AutoTrendlineResult;
  showAutoTrendlineModal: boolean;
  onCloseAutoTrendlineModal: () => void;
  onAutoTrendlineSettingsChange: (updates: Partial<AutoTrendlineSettings>) => void;
  onAutoTrendlineTierChange: (tier: AutoTrendlineTierId, updates: Partial<AutoTrendlineTierSettings>) => void;
  onAutoTrendlineReset?: () => void;
  divergenceScannerEnabled: boolean;
  filteredDivergencePoints: any[];
  onSelectDivergencePoint: (point: any) => void;
  selectedDivergencePoint: any | null;
  onCloseDivergencePoint: () => void;
  showDivergenceSettings: boolean;
  onCloseDivergenceSettings: () => void;
  divergenceSettings: any;
  onDivergenceSettingsChange: (value: any) => void;
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
  pdZones,
  pdZoneSettings,
  autoFibResult,
  autoFibSettings,
  volumeProfileData,
  vpSettings,
  showVPModal,
  onCloseVPModal,
  onVPSettingsChange,
  liquidityHeatmapData,
  lhSettings,
  lhEffectiveRange,
  showLHModal,
  onCloseLHModal,
  onLHSettingsChange,
  lhIsLoading,
  lhError,
  lhDebugInfo,
  liquidityPivotAnalysis,
  superTrendData,
  superTrendSettings,
  highLowEnabled,
  chartEpoch = 0,
  volumeEmaEnabled,
  volumeEmaSettings,
  showVolumeEmaModal,
  onCloseVolumeEmaModal,
  onVolumeEmaSettingsChange,
  onVolumeEmaReset,
  autoTrendlineSettings,
  autoTrendlineResult,
  showAutoTrendlineModal,
  onCloseAutoTrendlineModal,
  onAutoTrendlineSettingsChange,
  onAutoTrendlineTierChange,
  onAutoTrendlineReset,
  divergenceScannerEnabled,
  filteredDivergencePoints,
  onSelectDivergencePoint,
  selectedDivergencePoint,
  onCloseDivergencePoint,
  showDivergenceSettings,
  onCloseDivergenceSettings,
  divergenceSettings,
  onDivergenceSettingsChange,
}: FullscreenChartIndicatorLayerProps) {
  // Determine sidebar positioning logic
  // If both enabled and assigned to same side, share (entwine).
  // Default split is VP left and LIQ right.
  const vpEnabled = Boolean(vpSettings?.enabled);
  const lhEnabled = Boolean(lhSettings?.enabled);
  const vpPosition: 'left' | 'right' = vpSettings?.position === 'right' ? 'right' : 'left';
  const lhPosition: 'left' | 'right' = lhSettings?.position === 'left' ? 'left' : 'right';

  const shouldShareSidebar = vpEnabled && lhEnabled && vpPosition === lhPosition;
  
  let vpRenderSide: 'left' | 'right' = 'right';
  let lhRenderSide: 'left' | 'right' = 'right';
  
  if (shouldShareSidebar) {
    // Share sidebar - alternate rendering (entwine)
    vpRenderSide = vpPosition;
    lhRenderSide = lhPosition;
  } else {
    vpRenderSide = vpPosition;
    lhRenderSide = lhPosition;
  }

  const sharedSidebarWidth = typeof vpSettings?.width === 'number' ? vpSettings.width : 22;

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
        stackSection={shouldShareSidebar ? 'top' : 'full'}
      />

      <LiquidityHeatmapRenderer
        chart={chart}
        candleSeries={candleSeries}
        data={liquidityHeatmapData}
        settings={lhSettings}
        effectiveRange={lhEffectiveRange}
        stackSection={shouldShareSidebar ? 'bottom' : 'full'}
        profileSide={lhRenderSide}
        profileWidthPercent={sharedSidebarWidth}
        liquidityPivotAnalysis={liquidityPivotAnalysis}
      />

      {lhSettings?.enabled && lhSettings?.showDebugPanel && (
        <LiquidityHeatmapDebugPanel
          data={liquidityHeatmapData}
          isLoading={lhIsLoading}
          error={lhError}
          effectiveRange={lhEffectiveRange}
          settings={lhSettings}
          symbol={symbol}
          debugInfo={lhDebugInfo}
          liquidityPivotAnalysis={liquidityPivotAnalysis}
        />
      )}

      <SuperTrendRenderer
        chart={chart}
        candleSeries={candleSeries}
        data={superTrendData}
        settings={superTrendSettings}
      />

      <HighLowRenderer
        key={`high-low-${chartEpoch}`}
        chart={chart}
        candleSeries={candleSeries}
        candles={candles}
        enabled={highLowEnabled}
      />

      <VolumeEmaOverlay
        chart={chart}
        candles={candles}
        show={volumeEmaEnabled}
        settings={volumeEmaSettings}
      />

      <AutoTrendlineRenderer
        chart={chart}
        candleSeries={candleSeries}
        result={autoTrendlineResult}
        settings={autoTrendlineSettings}
        lastIndex={Math.max(0, (candles?.length ?? 1) - 1)}
        lastTime={
          candles?.length
            ? (candles[candles.length - 1] as { time?: number })?.time ?? null
            : null
        }
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

      <LiquidityHeatmapSettingsModal
        isOpen={showLHModal}
        onClose={onCloseLHModal}
        settings={lhSettings}
        onSettingsChange={onLHSettingsChange}
        effectiveRange={lhEffectiveRange}
      />

      <DivergenceSettingsModal
        isOpen={showDivergenceSettings}
        onClose={onCloseDivergenceSettings}
        settings={divergenceSettings}
        onSettingsChange={onDivergenceSettingsChange}
      />

      <AutoTrendlineSettingsModal
        isOpen={showAutoTrendlineModal}
        onClose={onCloseAutoTrendlineModal}
        settings={autoTrendlineSettings}
        onSettingsChange={onAutoTrendlineSettingsChange}
        onTierChange={onAutoTrendlineTierChange}
        onReset={onAutoTrendlineReset}
      />

      <VolumeEmaSettingsModal
        isOpen={showVolumeEmaModal}
        onClose={onCloseVolumeEmaModal}
        settings={volumeEmaSettings}
        onSettingsChange={onVolumeEmaSettingsChange}
        onReset={onVolumeEmaReset}
      />
    </>
  );
}
