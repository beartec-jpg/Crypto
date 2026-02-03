import { useState, useEffect, useCallback } from 'react';

interface CVDSettings {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  level1: number;
  level1Input: string;
  setLevel1: (level: number) => void;
  setLevel1Input: (input: string) => void;
  level2: number;
  level2Input: string;
  setLevel2: (level: number) => void;
  setLevel2Input: (input: string) => void;
  level3: number;
  level3Input: string;
  setLevel3: (level: number) => void;
  setLevel3Input: (input: string) => void;
  resetToDefaults: () => void;
}

export function useCVDSettings(): CVDSettings {
  const [enabled, setEnabled] = useState(false);
  const [level1, setLevel1] = useState(175);
  const [level1Input, setLevel1Input] = useState('175');
  const [level2, setLevel2] = useState(250);
  const [level2Input, setLevel2Input] = useState('250');
  const [level3, setLevel3] = useState(400);
  const [level3Input, setLevel3Input] = useState('400');

  // Debounce logic for level1 input
  useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = parseInt(level1Input);
      if (!isNaN(parsed) && parsed > 0) setLevel1(parsed);
    }, 300);
    return () => clearTimeout(timer);
  }, [level1Input]);

  // Debounce logic for level2 input
  useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = parseInt(level2Input);
      if (!isNaN(parsed) && parsed > 0) setLevel2(parsed);
    }, 300);
    return () => clearTimeout(timer);
  }, [level2Input]);

  // Debounce logic for level3 input
  useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = parseInt(level3Input);
      if (!isNaN(parsed) && parsed > 0) setLevel3(parsed);
    }, 300);
    return () => clearTimeout(timer);
  }, [level3Input]);

  const resetToDefaults = useCallback(() => {
    setEnabled(false);
    setLevel1(175);
    setLevel1Input('175');
    setLevel2(250);
    setLevel2Input('250');
    setLevel3(400);
    setLevel3Input('400');
  }, []);

  return {
    enabled,
    setEnabled,
    level1,
    level1Input,
    setLevel1,
    setLevel1Input,
    level2,
    level2Input,
    setLevel2,
    setLevel2Input,
    level3,
    level3Input,
    setLevel3,
    setLevel3Input,
    resetToDefaults,
  };
}
