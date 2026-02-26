export interface SqueezeMomentumValue {
  time: number;
  value: number;
  sqzOn: boolean;
  sqzOff: boolean;
  color: 'cyan' | 'blue' | 'red' | 'yellow';
}

export interface SqueezeMomentumSettings {
  enabled: boolean;
  length: number;
  mult: number;
  lengthKC: number;
  multKC: number;
  showDots: boolean;
  showHistogram: boolean;
  showZeroLine: boolean;
  sqzOnColor: string;
  sqzOffColor: string;
  momentumUpIncColor: string;
  momentumUpDecColor: string;
  momentumDownIncColor: string;
  momentumDownDecColor: string;
  zeroLineColor: string;
}

export const DEFAULT_SQUEEZE_MOMENTUM_SETTINGS: SqueezeMomentumSettings = {
  enabled: false,
  length: 20,
  mult: 2.0,
  lengthKC: 20,
  multKC: 1.5,
  showDots: true,
  showHistogram: true,
  showZeroLine: true,
  sqzOnColor: '#FF6B00',
  sqzOffColor: '#22c55e',
  momentumUpIncColor: '#00FFFF',
  momentumUpDecColor: '#0080FF',
  momentumDownIncColor: '#FF0000',
  momentumDownDecColor: '#FFFF00',
  zeroLineColor: '#64748b',
};
