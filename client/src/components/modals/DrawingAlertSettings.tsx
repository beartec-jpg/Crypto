import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Bell, BellOff, TrendingUp, TrendingDown } from 'lucide-react';

interface DrawingAlertSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  drawing: {
    id: string;
    drawingType: string;
    symbol: string;
    timeframe: string;
    style?: {
      label?: string;
      alertActive?: boolean;
      alertTriggered?: boolean;
      alertsEnabled?: boolean;
      trendlineAlert?: {
        enabled: boolean;
        crossUpEnabled: boolean;
        crossDownEnabled: boolean;
        triggered?: boolean;
      };
      levelAlerts?: {
        [level: string]: {
          enabled: boolean;
          crossUpEnabled: boolean;
          crossDownEnabled: boolean;
          triggered?: boolean;
        };
      };
    };
  };
  onUpdate: (updates: { style: any }) => void;
}

/**
 * Modal for configuring drawing alerts
 * Supports all drawing types with per-level and directional alerts
 */
export function DrawingAlertSettings({
  isOpen,
  onClose,
  drawing,
  onUpdate,
}: DrawingAlertSettingsProps) {
  const [alertConfig, setAlertConfig] = useState<any>({});

  useEffect(() => {
    if (drawing) {
      // Initialize state based on drawing type
      if (drawing.drawingType === 'trendline') {
        setAlertConfig({
          enabled: drawing.style?.trendlineAlert?.enabled || false,
          crossUpEnabled: drawing.style?.trendlineAlert?.crossUpEnabled || false,
          crossDownEnabled: drawing.style?.trendlineAlert?.crossDownEnabled || false,
        });
      } else if (drawing.drawingType === 'horizontal') {
        setAlertConfig({
          enabled: drawing.style?.alertActive || drawing.style?.trendlineAlert?.enabled || false,
          crossUpEnabled: drawing.style?.trendlineAlert?.crossUpEnabled !== false,
          crossDownEnabled: drawing.style?.trendlineAlert?.crossDownEnabled !== false,
        });
      } else {
        // Level-based alerts (channel, fib, trend_fib, rectangle)
        setAlertConfig(drawing.style?.levelAlerts || {});
      }
    }
  }, [drawing]);

  const handleSave = () => {
    let updatedStyle: any = { ...drawing.style };

    if (drawing.drawingType === 'trendline') {
      updatedStyle.trendlineAlert = {
        enabled: alertConfig.enabled,
        crossUpEnabled: alertConfig.crossUpEnabled,
        crossDownEnabled: alertConfig.crossDownEnabled,
      };
    } else if (drawing.drawingType === 'horizontal') {
      // Support both old and new alert system
      updatedStyle.alertActive = alertConfig.enabled;
      updatedStyle.trendlineAlert = {
        enabled: alertConfig.enabled,
        crossUpEnabled: alertConfig.crossUpEnabled,
        crossDownEnabled: alertConfig.crossDownEnabled,
      };
    } else {
      // Level-based alerts
      updatedStyle.levelAlerts = alertConfig;
      updatedStyle.alertsEnabled = Object.values(alertConfig).some((cfg: any) => cfg.enabled);
    }

    onUpdate({ style: updatedStyle });
    onClose();
  };

  const renderTrendlineAlerts = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="alert-enabled" className="text-white flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Enable Alert
        </Label>
        <Switch
          id="alert-enabled"
          checked={alertConfig.enabled}
          onCheckedChange={(checked) =>
            setAlertConfig({ ...alertConfig, enabled: checked })
          }
        />
      </div>

      {alertConfig.enabled && (
        <div className="ml-6 space-y-3 border-l-2 border-slate-700 pl-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="cross-up"
              checked={alertConfig.crossUpEnabled}
              onCheckedChange={(checked) =>
                setAlertConfig({ ...alertConfig, crossUpEnabled: checked === true })
              }
            />
            <Label htmlFor="cross-up" className="text-white flex items-center gap-2 cursor-pointer">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Cross Up
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="cross-down"
              checked={alertConfig.crossDownEnabled}
              onCheckedChange={(checked) =>
                setAlertConfig({ ...alertConfig, crossDownEnabled: checked === true })
              }
            />
            <Label htmlFor="cross-down" className="text-white flex items-center gap-2 cursor-pointer">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Cross Down
            </Label>
          </div>
        </div>
      )}
    </div>
  );

  const renderLevelAlerts = () => {
    const levels = getLevelsForDrawingType(drawing.drawingType);
    
    return (
      <div className="space-y-4">
        <div className="text-sm text-slate-400 mb-2">
          Configure alerts for each level
        </div>

        <div className="max-h-[400px] overflow-y-auto space-y-4">
          {levels.map((level) => {
            const levelKey = level.key;
            const levelConfig = alertConfig[levelKey] || {
              enabled: false,
              crossUpEnabled: false,
              crossDownEnabled: false,
            };

            return (
              <div key={levelKey} className="border border-slate-700 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-white font-medium">{level.label}</Label>
                  <Switch
                    checked={levelConfig.enabled}
                    onCheckedChange={(checked) =>
                      setAlertConfig({
                        ...alertConfig,
                        [levelKey]: { ...levelConfig, enabled: checked },
                      })
                    }
                  />
                </div>

                {levelConfig.enabled && (
                  <div className="ml-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`${levelKey}-up`}
                        checked={levelConfig.crossUpEnabled}
                        onCheckedChange={(checked) =>
                          setAlertConfig({
                            ...alertConfig,
                            [levelKey]: { ...levelConfig, crossUpEnabled: checked === true },
                          })
                        }
                      />
                      <Label
                        htmlFor={`${levelKey}-up`}
                        className="text-sm text-white flex items-center gap-1 cursor-pointer"
                      >
                        <TrendingUp className="h-3 w-3 text-green-500" />
                        Cross Up
                      </Label>
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`${levelKey}-down`}
                        checked={levelConfig.crossDownEnabled}
                        onCheckedChange={(checked) =>
                          setAlertConfig({
                            ...alertConfig,
                            [levelKey]: { ...levelConfig, crossDownEnabled: checked === true },
                          })
                        }
                      />
                      <Label
                        htmlFor={`${levelKey}-down`}
                        className="text-sm text-white flex items-center gap-1 cursor-pointer"
                      >
                        <TrendingDown className="h-3 w-3 text-red-500" />
                        Cross Down
                      </Label>
                    </div>

                    {levelConfig.triggered && (
                      <div className="text-xs text-amber-500 flex items-center gap-1 mt-1">
                        <BellOff className="h-3 w-3" />
                        Already triggered
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const getLevelsForDrawingType = (drawingType: string) => {
    switch (drawingType) {
      case 'channel':
        return [
          { key: 'top', label: 'Top (100%)' },
          { key: '0.75', label: '75%' },
          { key: '0.5', label: '50% (Mid)' },
          { key: '0.25', label: '25%' },
          { key: 'bottom', label: 'Bottom (0%)' },
        ];
      case 'fib_retracement':
        return [
          { key: '0', label: '0.0' },
          { key: '0.236', label: '0.236' },
          { key: '0.382', label: '0.382' },
          { key: '0.5', label: '0.5' },
          { key: '0.618', label: '0.618' },
          { key: '0.786', label: '0.786' },
          { key: '1.0', label: '1.0' },
          { key: '1.272', label: '1.272' },
          { key: '1.618', label: '1.618' },
        ];
      case 'trend_fib':
        return [
          { key: '0.382', label: '0.382' },
          { key: '0.5', label: '0.5' },
          { key: '0.618', label: '0.618' },
          { key: '0.786', label: '0.786' },
          { key: '1.0', label: '1.0' },
          { key: '1.272', label: '1.272' },
          { key: '1.618', label: '1.618' },
          { key: '2.0', label: '2.0' },
          { key: '2.618', label: '2.618' },
          { key: '3.618', label: '3.618' },
          { key: '4.236', label: '4.236' },
        ];
      case 'rectangle':
        return [
          { key: 'top', label: 'Top (Resistance)' },
          { key: 'bottom', label: 'Bottom (Support)' },
        ];
      default:
        return [];
    }
  };

  if (!drawing) return null;

  const isLevelBased = ['channel', 'fib_retracement', 'trend_fib', 'rectangle'].includes(
    drawing.drawingType
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Alert Settings - {drawing.symbol}
          </DialogTitle>
          <div className="text-sm text-slate-400">
            {drawing.style?.label || drawing.drawingType} on {drawing.timeframe}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {drawing.drawingType === 'trendline' || drawing.drawingType === 'horizontal'
            ? renderTrendlineAlerts()
            : isLevelBased
            ? renderLevelAlerts()
            : (
              <div className="text-slate-400">
                Alert settings not available for this drawing type
              </div>
            )}

          <div className="flex gap-2 mt-6">
            <Button
              onClick={handleSave}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              Save
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 border-slate-600 text-white hover:bg-slate-800"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
