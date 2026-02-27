import { MovingAverages } from '@/components/chart/MovingAverages';
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

  fvgs: any[];
  fvgSettings: any;
  orderBlocks: any[];
  obSettings: any;
  breakerBlocks: any[];
  bbSettings: any;
  structureBreaks: any[];
  swingPoints: any[];
  bosSettings: any;
  liquidityZones: any[];
  liquiditySettings: any;
  pdZones: any[];
  pdZoneSettings: any;
  autoFibZones: any[];
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
  fvgs,
  fvgSettings,
  orderBlocks,
  obSettings,
  breakerBlocks,
  bbSettings,
  structureBreaks,
  swingPoints,
  bosSettings,
  liquidityZones,
  liquiditySettings,
  pdZones,
  pdZoneSettings,
  autoFibZones,
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
        zones={autoFibZones}
        settings={autoFibSettings}
      />

      <VolumeProfileRenderer
        chart={chart}
        candleSeries={candleSeries}
        data={volumeProfileData}
        settings={vpSettings}
      />

      <VolumeProfileSettingsModal
        isOpen={showVPModal}
        onClose={onCloseVPModal}
        settings={vpSettings}
        onSettingsChange={onVPSettingsChange}
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
