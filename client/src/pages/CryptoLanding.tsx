import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Helmet } from 'react-helmet-async';
import videoFile from '@assets/grok_video_2025-11-13-19-48-28_1763063433278.mp4';
import { useAuth, useClerk } from '@clerk/clerk-react';

const isDevelopment = typeof window !== 'undefined' && 
  (window.location.hostname.includes('replit') || 
   window.location.hostname.includes('localhost') ||
   window.location.hostname.includes('127.0.0.1'));

// Production component that uses Clerk hooks
function ProdLanding() {
  const [, setLocation] = useLocation();
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showText, setShowText] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const isSignedInRef = useRef(isSignedIn);
  const openSignInRef = useRef(openSignIn);

  useEffect(() => {
    isSignedInRef.current = isSignedIn;
  }, [isSignedIn]);

  useEffect(() => {
    openSignInRef.current = openSignIn;
  }, [openSignIn]);

  useEffect(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      video.load();
      video.currentTime = 0.1;
      video.pause();
      
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

    video.onended = () => {
      setTimeout(() => {
        setLocation('/cryptoindicators');
      }, 500);
    };
  };

  return (
    <LandingUI 
      videoRef={videoRef} 
      showText={showText} 
      handleClick={handleClick} 
    />
  );
}

// Development component without Clerk hooks
function DevLanding() {
  const [, setLocation] = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showText, setShowText] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      video.load();
      video.currentTime = 0.1;
      video.pause();
      
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

    video.onended = () => {
      setTimeout(() => {
        setLocation('/cryptoindicators');
      }, 500);
    };
  };

  return (
    <LandingUI 
      videoRef={videoRef} 
      showText={showText} 
      handleClick={handleClick} 
    />
  );
}

// Shared UI component
function LandingUI({ videoRef, showText, handleClick }: {
  videoRef: React.RefObject<HTMLVideoElement>;
  showText: boolean;
  handleClick: () => void;
}) {
  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <Helmet>
        <title>BearTec Crypto | Professional Trading Tools</title>
        <meta name="description" content="Advanced cryptocurrency trading platform with Elliott Wave analysis, AI insights, and professional charting tools." />
        <meta property="og:title" content="BearTec Crypto | Professional Trading Tools" />
        <meta property="og:description" content="Advanced cryptocurrency trading platform with Elliott Wave analysis, AI insights, and professional charting tools." />
        <meta property="og:type" content="website" />
      </Helmet>

      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover cursor-pointer"
        onClick={handleClick}
        muted
        playsInline
        preload="auto"
      >
        <source src={videoFile} type="video/mp4" />
      </video>

      {showText && (
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.4) 100%)'
          }}
        >
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 text-center px-4 drop-shadow-lg">
            BearTec Crypto
          </h1>
          <p className="text-xl md:text-2xl text-gray-200 text-center px-4 drop-shadow-md animate-pulse">
            Tap to Enter
          </p>
        </div>
      )}
    </div>
  );
}

// Main export - conditionally renders Dev or Prod component
export default function CryptoLanding() {
  if (isDevelopment) {
    return <DevLanding />;
  }
  return <ProdLanding />;
}
