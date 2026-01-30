import { IChartApi } from 'lightweight-charts';

export interface PriceScaleOptions {
  borderVisible?: boolean;
  scaleMargins?: {
    top: number;
    bottom: number;
  };
  autoScale?: boolean;
}

interface ChartPriceScaleProps {
  chart: IChartApi | null;
  options?: PriceScaleOptions;
}

export function ChartPriceScale({ chart, options }: ChartPriceScaleProps) {
  // This is a helper component that doesn't render anything
  // It just provides a way to configure price scale options
  
  if (chart && options) {
    chart.priceScale('right').applyOptions(options);
  }
  
  return null;
}

// Default price scale configuration
export const DEFAULT_PRICE_SCALE_OPTIONS: PriceScaleOptions = {
  borderVisible: true,
  scaleMargins: {
    top: 0.1,
    bottom: 0.1,
  },
  autoScale: true,
};
