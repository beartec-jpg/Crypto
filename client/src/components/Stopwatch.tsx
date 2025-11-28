import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, SkipForward } from "lucide-react";

interface StopwatchProps {
  presetTime?: number; // in seconds
  onComplete?: () => void;
  onStart?: () => void;
  onStop?: () => void;
  autoStart?: boolean;
  className?: string;
}

export function Stopwatch({ 
  presetTime, 
  onComplete, 
  onStart, 
  onStop, 
  autoStart = false,
  className = "" 
}: StopwatchProps) {
  const [time, setTime] = useState(presetTime || 0);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (autoStart && presetTime && !isRunning) {
      handleStart();
    }
  }, [autoStart, presetTime]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTime((prevTime) => {
          if (presetTime) {
            // Countdown mode
            if (prevTime <= 1) {
              setIsRunning(false);
              setIsComplete(true);
              onComplete?.();
              return 0;
            }
            return prevTime - 1;
          } else {
            // Count up mode
            return prevTime + 1;
          }
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, presetTime, onComplete]);

  const handleStart = () => {
    setIsRunning(true);
    setIsComplete(false);
    onStart?.();
  };

  const handleStop = () => {
    setIsRunning(false);
    onStop?.();
  };

  const handleReset = () => {
    setIsRunning(false);
    setIsComplete(false);
    setTime(presetTime || 0);
  };

  const handleSkip = () => {
    setIsRunning(false);
    setIsComplete(true);
    setTime(0);
    onComplete?.();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getDisplayColor = () => {
    if (isComplete) return "text-green-600";
    if (isRunning) return "text-blue-600";
    return "text-gray-600";
  };

  return (
    <div className={`flex flex-col items-center space-y-4 p-4 border rounded-lg ${className}`}>
      <div className={`text-4xl font-mono font-bold ${getDisplayColor()}`}>
        {formatTime(time)}
      </div>
      
      <div className="flex space-x-2">
        {!isRunning && !isComplete && (
          <Button onClick={handleStart} className="flex items-center gap-2">
            <Play className="w-4 h-4" />
            Start
          </Button>
        )}
        
        {isRunning && (
          <Button onClick={handleStop} variant="outline" className="flex items-center gap-2">
            <Pause className="w-4 h-4" />
            Stop
          </Button>
        )}
        
        <Button onClick={handleReset} variant="outline" className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4" />
          Reset
        </Button>
        
        {presetTime && !isComplete && (
          <Button onClick={handleSkip} variant="secondary" className="flex items-center gap-2">
            <SkipForward className="w-4 h-4" />
            Skip
          </Button>
        )}
      </div>

      {isComplete && (
        <div className="text-green-600 font-semibold">
          ⏰ Timer Complete!
        </div>
      )}
    </div>
  );
}