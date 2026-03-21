import { EmaSmaModal } from '@/components/indicators';
import { OscillatorSelectorModal } from '@/components/modals/OscillatorSelectorModal';
import { SMCSettingsModal } from '@/components/modals/SMCSettingsModal';
import { DegreePicker } from '@/components/elliottWave/DegreePicker';
import { AutoFibSettingsModal } from '@/components/modals/AutoFibSettingsModal';
import { SuperTrendSettingsModal } from '@/components/modals/SuperTrendSettingsModal';
import { VWAPSettingsModal } from '@/components/modals/VWAPSettingsModal';
import { DrawingSettingsModal } from '@/components/modals/DrawingSettingsModal';
import { DrawingSelectionModal } from '@/components/drawings/DrawingSelectionModal';
import type { OscillatorModalConfig } from '@/components/modals/OscillatorSelectorModal';

interface FullscreenChartModalsProps {
  selectedDrawingId: string | null;
  settingsModalOpen: boolean;
  onCloseSettings: () => void;
  selectedDrawingForModal: any;
  onUpdateDrawing: (updates: { style: any }) => void;
  autoColorEnabled?: boolean;
  onAutoColorChange?: (enabled: boolean) => void;
  onSaveDrawingDefaults?: (payload: { tool: string; style: any }) => void;
  onResetDrawingDefaults?: (tool: string) => void;

  showSelectionModal: boolean;
  nearbyDrawings: any[];
  onSelectFromModal: (drawingId: string) => void;
  onCloseSelectionModal: () => void;

  showEmaSmaModal: boolean;
  onCloseEmaSmaModal: () => void;
  emaShow: boolean;
  emaConfigs: any;
  emaInputs: any;
  onEmaToggle: (show: boolean) => void;
  onEmaConfigsChange: (configs: any) => void;
  onEmaInputsChange: (inputs: any) => void;
  smaShow: boolean;
  smaConfigs: any;
  onSmaToggle: (show: boolean) => void;
  onSmaConfigsChange: (configs: any) => void;

  showOscillatorSelector: boolean;
  onCloseOscillatorSelector: () => void;
  selectedOscillators: Set<string>;
  onToggleOscillator: (id: string, enabled: boolean) => void;
  oscillatorConfigs: Record<string, OscillatorModalConfig>;
  onUpdateOscillatorConfig: (id: string, config: OscillatorModalConfig) => void;

  showSmcModal: boolean;
  onCloseSmcModal: () => void;
  fvgSettings: any;
  onFVGSettingsChange: (settings: any) => void;
  obSettings: any;
  onOBSettingsChange: (settings: any) => void;
  breakerSettings: any;
  onBreakerSettingsChange: (settings: any) => void;
  bosSettings: any;
  onBOSSettingsChange: (settings: any) => void;
  liquiditySettings: any;
  onLiquiditySettingsChange: (settings: any) => void;
  pdZoneSettings: any;
  onPDZoneSettingsChange: (settings: any) => void;

  showDegreePicker: boolean;
  onDegreeSelect: (degree: string, waveLabel: string, patternType: string) => void;
  onCloseDegreePicker: () => void;

  showAutoFibModal: boolean;
  onCloseAutoFibModal: () => void;
  autoFibSettings: any;
  onAutoFibSettingsChange: (settings: any) => void;

  showSuperTrendModal: boolean;
  onCloseSuperTrendModal: () => void;
  superTrendSettings: any;
  onSuperTrendSettingsChange: (...args: any[]) => void;

  showVwapModal: boolean;
  onCloseVwapModal: () => void;
  vwapState: any;
}

export function FullscreenChartModals({
  selectedDrawingId,
  settingsModalOpen,
  onCloseSettings,
  selectedDrawingForModal,
  onUpdateDrawing,
  autoColorEnabled,
  onAutoColorChange,
  onSaveDrawingDefaults,
  onResetDrawingDefaults,
  showSelectionModal,
  nearbyDrawings,
  onSelectFromModal,
  onCloseSelectionModal,
  showEmaSmaModal,
  onCloseEmaSmaModal,
  emaShow,
  emaConfigs,
  emaInputs,
  onEmaToggle,
  onEmaConfigsChange,
  onEmaInputsChange,
  smaShow,
  smaConfigs,
  onSmaToggle,
  onSmaConfigsChange,
  showOscillatorSelector,
  onCloseOscillatorSelector,
  selectedOscillators,
  onToggleOscillator,
  oscillatorConfigs,
  onUpdateOscillatorConfig,
  showSmcModal,
  onCloseSmcModal,
  fvgSettings,
  onFVGSettingsChange,
  obSettings,
  onOBSettingsChange,
  breakerSettings,
  onBreakerSettingsChange,
  bosSettings,
  onBOSSettingsChange,
  liquiditySettings,
  onLiquiditySettingsChange,
  pdZoneSettings,
  onPDZoneSettingsChange,
  showDegreePicker,
  onDegreeSelect,
  onCloseDegreePicker,
  showAutoFibModal,
  onCloseAutoFibModal,
  autoFibSettings,
  onAutoFibSettingsChange,
  showSuperTrendModal,
  onCloseSuperTrendModal,
  superTrendSettings,
  onSuperTrendSettingsChange,
  showVwapModal,
  onCloseVwapModal,
  vwapState,
}: FullscreenChartModalsProps) {
  return (
    <>
      {selectedDrawingId && (
        <DrawingSettingsModal
          isOpen={settingsModalOpen}
          onClose={onCloseSettings}
          drawing={selectedDrawingForModal}
          onUpdate={onUpdateDrawing}
          autoColorEnabled={autoColorEnabled}
          onAutoColorChange={onAutoColorChange}
          onSaveAsDefault={onSaveDrawingDefaults}
          onResetDefault={onResetDrawingDefaults}
        />
      )}

      {showSelectionModal && (
        <DrawingSelectionModal
          open={showSelectionModal}
          drawings={nearbyDrawings}
          onSelect={onSelectFromModal}
          onClose={onCloseSelectionModal}
        />
      )}

      <EmaSmaModal
        isOpen={showEmaSmaModal}
        onClose={onCloseEmaSmaModal}
        emaShow={emaShow}
        emaConfigs={emaConfigs}
        emaInputs={emaInputs}
        onEmaToggle={onEmaToggle}
        onEmaConfigsChange={onEmaConfigsChange}
        onEmaInputsChange={onEmaInputsChange}
        smaShow={smaShow}
        smaConfigs={smaConfigs}
        onSmaToggle={onSmaToggle}
        onSmaConfigsChange={onSmaConfigsChange}
      />

      <OscillatorSelectorModal
        isOpen={showOscillatorSelector}
        onClose={onCloseOscillatorSelector}
        selectedOscillators={selectedOscillators}
        onToggleOscillator={onToggleOscillator}
        oscillatorConfigs={oscillatorConfigs}
        onUpdateOscillatorConfig={onUpdateOscillatorConfig}
      />

      <SMCSettingsModal
        isOpen={showSmcModal}
        onClose={onCloseSmcModal}
        fvgSettings={fvgSettings}
        onFVGSettingsChange={onFVGSettingsChange}
        obSettings={obSettings}
        onOBSettingsChange={onOBSettingsChange}
        breakerSettings={breakerSettings}
        onBreakerSettingsChange={onBreakerSettingsChange}
        bosSettings={bosSettings}
        onBOSSettingsChange={onBOSSettingsChange}
        liquiditySettings={liquiditySettings}
        onLiquiditySettingsChange={onLiquiditySettingsChange}
        pdZoneSettings={pdZoneSettings}
        onPDZoneSettingsChange={onPDZoneSettingsChange}
      />

      <DegreePicker
        isOpen={showDegreePicker}
        onSelect={onDegreeSelect}
        onClose={onCloseDegreePicker}
      />

      <AutoFibSettingsModal
        isOpen={showAutoFibModal}
        onClose={onCloseAutoFibModal}
        settings={autoFibSettings}
        onSettingsChange={onAutoFibSettingsChange}
      />

      <SuperTrendSettingsModal
        isOpen={showSuperTrendModal}
        onClose={onCloseSuperTrendModal}
        settings={superTrendSettings}
        onSettingsChange={onSuperTrendSettingsChange}
      />

      <VWAPSettingsModal
        isOpen={showVwapModal}
        onClose={onCloseVwapModal}
        vwap={vwapState}
      />
    </>
  );
}
