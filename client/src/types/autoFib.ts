/**
 * Auto-Fibonacci Detection type definitions.
 */

export type LabelPosition = 'left' | 'right' | 'off';

/** Per-set Fibonacci configuration (Primary or Secondary). */
export interface FibSetConfig {
  enabled: boolean;
  showRetracements: boolean;    // 0-100%
  showExtensions: boolean;      // >100%, <0%
  levels: {
    '-61.8': boolean;
    '-27.2': boolean;
    '0': boolean;
    '23.6': boolean;
    '38.2': boolean;
    '50': boolean;
    '61.8': boolean;
    '78.6': boolean;
    '100': boolean;
    '127.2': boolean;
    '161.8': boolean;
    '200': boolean;
    '261.8': boolean;
  };
  color: string;
  showLabels: boolean;
  labelPosition: LabelPosition;
  extendRight: boolean;
}

export interface AutoFibSettings {
  enabled: boolean;
  swingLookback: number;
  primary: FibSetConfig;
  secondary: FibSetConfig;
  enableConfluence: boolean;
  confluenceThreshold: number;  // % proximity (e.g., 0.5 = 0.5%)
}

// --- Output types from detection hook ---

export interface FibLevelData {
  level: string;       // e.g., "61.8"
  percentage: string;  // e.g., "61.8%"
  price: number;
  isExtension: boolean;
  isGolden: boolean;
}

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
}

export interface FibSetResult {
  start: SwingPoint;
  end: SwingPoint;
  levels: FibLevelData[];
  color: string;
  showLabels: boolean;
  labelPosition: LabelPosition;
  extendRight: boolean;
}

export interface ConfluenceZone {
  price: number;
  primaryLevel: string;
  secondaryLevel: string;
  strength: number;
}

export interface AutoFibResult {
  primary: FibSetResult | null;
  secondary: FibSetResult | null;
  confluence: ConfluenceZone[];
}

const DEFAULT_FIB_SET_LEVELS: FibSetConfig['levels'] = {
  '-61.8': false,
  '-27.2': false,
  '0': false,
  '23.6': true,
  '38.2': true,
  '50': true,
  '61.8': true,
  '78.6': true,
  '100': true,
  '127.2': false,
  '161.8': false,
  '200': false,
  '261.8': false,
};

export const DEFAULT_AUTO_FIB_SETTINGS: AutoFibSettings = {
  enabled: false,
  swingLookback: 20,
  primary: {
    enabled: true,
    showRetracements: true,
    showExtensions: false,
    levels: { ...DEFAULT_FIB_SET_LEVELS },
    color: '#00D9FF',
    showLabels: true,
    labelPosition: 'left',
    extendRight: true,
  },
  secondary: {
    enabled: true,
    showRetracements: true,
    showExtensions: false,
    levels: { ...DEFAULT_FIB_SET_LEVELS },
    color: '#FF8C00',
    showLabels: true,
    labelPosition: 'right',
    extendRight: true,
  },
  enableConfluence: true,
  confluenceThreshold: 0.5,
};
