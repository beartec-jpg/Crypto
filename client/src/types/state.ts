// State-related types for CryptoSandbox component

import type {
  TrendlineData,
  HorizontalLineData,
  ChannelData,
  HorizontalChannelData,
  SlopedChannelData,
  TextLabelData,
  FibRetracementData,
  TrendFibExtensionData,
} from './drawing';

// Selection candidate type for overlapping elements
export type SelectionCandidate = {
  id: string;
  type: 'trendline' | 'horizontal' | 'channel' | 'hchannel' | 'schannel' | 'fib' | 'trendfib' | 'label';
};

// Drawing state interface (for undo/redo history)
export interface DrawingState {
  trendlines: TrendlineData[];
  horizontals: HorizontalLineData[];
  channels: ChannelData[];
  hchannels: HorizontalChannelData[];
  schannels: SlopedChannelData[];
  fibs: FibRetracementData[];
  trendfibs: TrendFibExtensionData[];
  labels: TextLabelData[];
}
