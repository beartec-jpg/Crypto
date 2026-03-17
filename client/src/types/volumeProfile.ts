import type { SidebarPosition } from './liquidityHeatmap';

export interface VolumeProfileRow {
  price: number;       // Price level
  volume: number;      // Total volume at this price
  buyVolume: number;   // Aggressive buy volume
  sellVolume: number;  // Aggressive sell volume
  delta: number;       // buyVolume - sellVolume
}

export interface VolumeProfileData {
  rows: VolumeProfileRow[];
  poc: number;         // Point of Control (price with max volume)
  vahPrice: number;    // Value Area High
  valPrice: number;    // Value Area Low
  totalVolume: number;
}

export interface VolumeProfileSettings {
  enabled: boolean;

  // Calculation
  rowCount: number;         // Number of rows (default: 24)
  valueAreaPercent: number; // VA % (default: 70)

  // Display
  position: SidebarPosition; // Sidebar position: 'left' | 'right' | 'auto' (auto entwines with predictive liquidation) - default: 'auto'
  width: number;            // Width % (default: 15)
  showPOC: boolean;         // Highlight POC line (default: true)
  showValueArea: boolean;   // Show VA high/low (default: true)
  showDelta: boolean;       // Color by delta (default: false)

  // Colors
  volumeColor: string;      // Default: 'rgba(59, 130, 246, 0.5)'
  pocColor: string;         // Default: '#FFD700' (gold)
  vahColor: string;         // Default: '#3b82f6'
  valColor: string;         // Default: '#3b82f6'
  buyColor: string;         // Default: '#22c55e' (green)
  sellColor: string;        // Default: '#ef4444' (red)

  // Behavior
  updateOnPan: boolean;     // Recalculate on pan/zoom (default: true)
  showLabels: boolean;      // Show price labels (default: true)
}

export const DEFAULT_VOLUME_PROFILE_SETTINGS: VolumeProfileSettings = {
  enabled: false,
  rowCount: 24,
  valueAreaPercent: 70,
  position: 'auto',
  width: 15,
  showPOC: true,
  showValueArea: true,
  showDelta: false,
  volumeColor: 'rgba(59, 130, 246, 0.5)',
  pocColor: '#FFD700',
  vahColor: '#3b82f6',
  valColor: '#3b82f6',
  buyColor: '#22c55e',
  sellColor: '#ef4444',
  updateOnPan: true,
  showLabels: true,
};
