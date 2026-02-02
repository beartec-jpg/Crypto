import { useRef, useEffect, useState } from 'react';
import bearVideo from '@assets/grok_video_2025-11-20-03-05-08_1763607929480.mp4';
import transitionVideo from '@assets/grok_video_2025-11-20-06-10-37_1763619824022.mp4';
import bullVideo from '@assets/grok_video_2025-11-20-06-16-11_1763619952816.mp4';

/**
 * Market state representing current market trend
 */
export type MarketState = 'bearish' | 'bullish';

/**
 * Video playback phase
 */
export type VideoPhase = 'initial_bear' | 'transition' | 'final';

/**
 * Props for the VideoSequencePlayer component
 */
export interface VideoSequencePlayerProps {
  /** Current market state (bearish or bullish) */
  targetMarketState: MarketState;
  /** Whether this is the initial load */
  isInitialLoad?: boolean;
  /** Optional callback when initial bear video completes */
  onInitialComplete?: () => void;
}

/**
 * VideoSequencePlayer Component
 * 
 * Manages a 3-phase video sequence for market state visualization:
 * 1. Initial Bear: Plays on first load
 * 2. Transition: Plays when market state changes
 * 3. Final: Shows either bear or bull video based on market state
 * 
 * Features:
 * - Smooth opacity transitions between videos
 * - Hover replay functionality in final phase
 * - Auto-progression through phases
 * - Preloaded videos for smooth playback
 */
export function VideoSequencePlayer({
  targetMarketState,
  isInitialLoad = false,
  onInitialComplete,
}: VideoSequencePlayerProps) {
  const [videoPhase, setVideoPhase] = useState<VideoPhase>('initial_bear');
  
  const bearVideoRef = useRef<HTMLVideoElement>(null);
  const transitionVideoRef = useRef<HTMLVideoElement>(null);
  const bullVideoRef = useRef<HTMLVideoElement>(null);

  // Detect market status changes and trigger video sequences
  useEffect(() => {
    if (videoPhase !== 'initial_bear' && !isInitialLoad) {
      setVideoPhase('transition');
    }
  }, [targetMarketState, videoPhase, isInitialLoad]);

  // Control video playback based on phase changes
  useEffect(() => {
    const bear = bearVideoRef.current;
    const transition = transitionVideoRef.current;
    const bull = bullVideoRef.current;

    if (!bear || !transition || !bull) return;

    // Reset all videos first
    bear.pause();
    transition.pause();
    bull.pause();

    // Play the appropriate video based on phase with error handling
    if (videoPhase === 'initial_bear') {
      bear.currentTime = 0;
      bear.play().catch(err => console.log('Bear video play failed:', err));
    } else if (videoPhase === 'transition') {
      transition.currentTime = 0;
      
      // Listen for transition end to move to final phase
      const handleTransitionEnd = () => {
        setVideoPhase('final');
      };
      
      transition.addEventListener('ended', handleTransitionEnd, { once: true });
      
      if (transition.readyState >= 2) {
        transition.play().catch(err => console.log('Transition video play failed:', err));
      }
    } else if (videoPhase === 'final') {
      if (targetMarketState === 'bullish') {
        bull.currentTime = 0;
        bull.play().catch(err => console.log('Bull video play failed:', err));
      } else {
        bear.currentTime = 0;
        bear.play().catch(err => console.log('Bear video play failed:', err));
      }
    }
  }, [videoPhase, targetMarketState]);

  return (
    <div className="w-full flex justify-center relative">
      {/* Bear Video */}
      <video 
        ref={bearVideoRef}
        src={bearVideo}
        muted
        autoPlay
        playsInline
        preload="auto"
        className="h-[240px] max-w-full object-contain absolute"
        style={{
          opacity: videoPhase === 'initial_bear' || (videoPhase === 'final' && targetMarketState === 'bearish') ? 1 : 0,
          pointerEvents: videoPhase === 'initial_bear' || (videoPhase === 'final' && targetMarketState === 'bearish') ? 'auto' : 'none'
        }}
        onEnded={() => {
          if (videoPhase === 'initial_bear') {
            if (targetMarketState === 'bullish') {
              setVideoPhase('transition');
            } else {
              setVideoPhase('final');
            }
            onInitialComplete?.();
          }
        }}
        onMouseEnter={() => {
          if (videoPhase === 'final' && targetMarketState === 'bearish' && bearVideoRef.current) {
            bearVideoRef.current.currentTime = 0;
            bearVideoRef.current.play().catch(err => console.log('Bear hover replay failed:', err));
          }
        }}
      />
      
      {/* Transition Video */}
      <video 
        ref={transitionVideoRef}
        src={transitionVideo}
        muted
        playsInline
        preload="auto"
        className="h-[240px] max-w-full object-contain absolute"
        style={{
          opacity: videoPhase === 'transition' ? 1 : 0,
          pointerEvents: videoPhase === 'transition' ? 'auto' : 'none'
        }}
        onEnded={() => {
          if (videoPhase === 'transition') {
            setVideoPhase('final');
          }
        }}
      />
      
      {/* Bull Video */}
      <video 
        ref={bullVideoRef}
        src={bullVideo}
        muted
        playsInline
        preload="auto"
        className="h-[240px] max-w-full object-contain absolute"
        style={{
          opacity: videoPhase === 'final' && targetMarketState === 'bullish' ? 1 : 0,
          pointerEvents: videoPhase === 'final' && targetMarketState === 'bullish' ? 'auto' : 'none'
        }}
        onMouseEnter={() => {
          if (videoPhase === 'final' && targetMarketState === 'bullish' && bullVideoRef.current) {
            bullVideoRef.current.currentTime = 0;
            bullVideoRef.current.play().catch(err => console.log('Bull hover replay failed:', err));
          }
        }}
      />
    </div>
  );
}
