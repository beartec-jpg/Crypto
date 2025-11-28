import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Helmet } from 'react-helmet-async';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import videoFile from '@assets/grok_video_2025-11-13-19-48-28_1763063433278.mp4';

export default function CryptoLanding() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useCryptoAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showText, setShowText] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    // Ensure video starts paused on first frame
    if (videoRef.current) {
      const video = videoRef.current;
      video.load(); // Force load
      video.currentTime = 0.1; // Set to first frame
      video.pause();
      
      // Additional handler to ensure it stays paused
      video.addEventListener('loadeddata', () => {
        video.currentTime = 0.1;
        video.pause();
      });
    }
  }, []);

  const handleClick = () => {
    if (isPlaying || !videoRef.current) return;

    setShowText(false);
    setIsPlaying(true);

    const video = videoRef.current;
    video.play();

    // When video ends, freeze on last frame and navigate
    video.onended = () => {
      setTimeout(() => {
        // Navigate directly to indicators (open access - no auth required)
        setLocation('/cryptoindicators');
      }, 500);
    };
  };

  return (
    <>
      <Helmet>
        <title>BearTec Crypto - Professional Trading Platform with AI Analysis</title>
        <meta name="description" content="Professional cryptocurrency trading platform featuring AI-powered Grok analysis, Smart Money Concepts (SMC), institutional orderflow signals, CVD confluence, and graded trade setups (A+ to E). Real-time alerts for Bitcoin, Ethereum, and major altcoins with professional technical indicators." />
        <meta property="og:title" content="BearTec Crypto - AI-Powered Professional Trading Platform" />
        <meta property="og:description" content="Professional crypto trading with Grok AI analysis, Smart Money Concepts, institutional orderflow, CVD, and graded trade setups. Real-time alerts and professional indicators." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://beartec.uk/crypto" />
        <meta name="keywords" content="cryptocurrency trading, crypto trading platform, Bitcoin trading, Ethereum trading, Smart Money Concepts, SMC, orderflow analysis, CVD, Cumulative Volume Delta, institutional trading, Grok AI, crypto alerts, technical indicators, professional crypto analysis, trade setups, BTC, ETH, XRP, crypto signals" />
      </Helmet>
      <div 
        className="relative w-full h-screen max-h-[800px] md:max-h-[600px] overflow-hidden cursor-pointer bg-black"
        onClick={handleClick}
        data-testid="crypto-landing-container"
      >
        {/* Video full-screen background */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-contain"
        preload="auto"
        playsInline
        muted
        autoPlay={false}
        data-testid="crypto-landing-video"
        style={{ backgroundColor: 'transparent' }}
      >
        <source src={videoFile} type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* Icy text overlay */}
      {showText && (
        <>
          {/* BREAK THE SEAL - Top Left */}
          <div 
            className="absolute top-8 left-8 pointer-events-none"
            data-testid="crypto-landing-text"
          >
            <h1 
              className="text-4xl md:text-5xl lg:text-6xl font-black tracking-wider select-none"
              style={{
                fontFamily: "'Orbitron', 'Rajdhani', 'Exo 2', monospace",
                color: '#0284c7',
                WebkitTextStroke: '0.5px white',
                filter: 'drop-shadow(0 0 40px rgba(56, 189, 248, 1)) drop-shadow(0 0 80px rgba(14, 165, 233, 0.9))',
              } as React.CSSProperties}
            >
              BREAK THE SEAL
            </h1>
          </div>

          {/* TO ENTER - Centered, moved up 20px */}
          <div 
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ marginTop: '-20px' }}
          >
            <p 
              className="text-xl md:text-2xl tracking-widest"
              style={{
                color: '#bae6fd',
                textShadow: '0 0 30px rgba(186, 230, 253, 1), 0 0 60px rgba(56, 189, 248, 0.8)',
                letterSpacing: '0.3em',
                fontFamily: "'Rajdhani', 'Exo 2', monospace",
                fontWeight: 300,
              }}
            >
              TO ENTER
            </p>
          </div>
        </>
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(200%);
          }
        }

        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@300;500;700&family=Exo+2:wght@300;500;700&display=swap');
      `}</style>
    </div>
    </>
  );
}
