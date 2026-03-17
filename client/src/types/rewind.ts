export interface RewindSettings {
  enabled: boolean;
  playbackSpeed: number;   // 1 | 2 | 5 | 10
  autoPlay: boolean;
  showControls: boolean;
}

export const DEFAULT_REWIND_SETTINGS: RewindSettings = {
  enabled: false,
  playbackSpeed: 1,
  autoPlay: false,
  showControls: true,
};

export const PLAYBACK_SPEEDS = [1, 2, 5, 10] as const;
