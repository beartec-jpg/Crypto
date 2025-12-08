interface WavePoint {
  index: number;
  label: string;
  price: number;
  time: number;
  isCorrection: boolean;
}

interface FibRatio {
  wave: string;
  ratio: number;
  idealRatio: number;
  validMin: number;
  validMax: number;
  quality: 'excellent' | 'good' | 'ok' | 'valid' | 'poor';
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fibonacciRatios: FibRatio[];
  detectedType?: string;
  detectedSubtype?: string;
}

function calculateFibRatios(points: WavePoint[], patternType: string): FibRatio[] {
  const ratios: FibRatio[] = [];
  if (points.length < 3) return ratios;

  const isImpulse = patternType === 'impulse' || patternType === 'diagonal';
  const isCorrection = patternType === 'zigzag' || patternType === 'flat' || patternType === 'triangle';

  const p0 = points[0], p1 = points[1], p2 = points[2];
  const wave1Range = Math.abs(p1.price - p0.price);
  
  if (wave1Range > 0) {
    const wave2Retrace = Math.abs(p2.price - p1.price);
    const ratio = (wave2Retrace / wave1Range) * 100;
    
    let quality: FibRatio['quality'] = 'poor';
    let idealRatio = 61.8;
    let validMin = 38.2, validMax = 78.6;
    
    if (isImpulse) {
      if (ratio >= 50 && ratio <= 61.8) quality = 'excellent';
      else if (ratio >= 38.2 && ratio <= 78.6) quality = 'good';
      else if (ratio >= 23.6 && ratio <= 88.6) quality = 'ok';
      else quality = 'poor';
    } else if (patternType === 'zigzag') {
      if (ratio >= 50 && ratio <= 61.8) quality = 'excellent';
      else if (ratio >= 38.2 && ratio <= 78.6) quality = 'good';
      else quality = 'ok';
    } else if (patternType === 'flat') {
      idealRatio = 100;
      validMin = 85; validMax = 138.2;
      if (ratio >= 90 && ratio <= 110) quality = 'excellent';
      else if (ratio >= 80 && ratio <= 138.2) quality = 'good';
      else if (ratio >= 70) quality = 'ok';
      else quality = 'poor';
    }
    
    ratios.push({
      wave: isImpulse ? '2' : 'B',
      ratio,
      idealRatio,
      validMin,
      validMax,
      quality,
    });
  }

  if (points.length >= 4) {
    const p3 = points[3];
    const wave3Range = Math.abs(p3.price - p2.price);
    if (wave1Range > 0) {
      const ratio = (wave3Range / wave1Range) * 100;
      
      let quality: FibRatio['quality'] = 'poor';
      let idealRatio = 161.8;
      let validMin = 100, validMax = 261.8;
      
      if (isImpulse) {
        if (ratio >= 161.8 && ratio <= 261.8) quality = 'excellent';
        else if (ratio >= 138.2 && ratio <= 361.8) quality = 'good';
        else if (ratio >= 100) quality = 'ok';
        else quality = 'poor';
      } else if (patternType === 'zigzag') {
        if (ratio >= 100 && ratio <= 161.8) quality = 'excellent';
        else if (ratio >= 61.8 && ratio <= 200) quality = 'good';
        else quality = 'ok';
      }
      
      ratios.push({
        wave: isImpulse ? '3' : 'C',
        ratio,
        idealRatio,
        validMin,
        validMax,
        quality,
      });
    }
  }

  if (points.length >= 5 && isImpulse) {
    const p3 = points[3], p4 = points[4];
    const wave3Range = Math.abs(p3.price - p2.price);
    if (wave3Range > 0) {
      const wave4Retrace = Math.abs(p4.price - p3.price);
      const ratio = (wave4Retrace / wave3Range) * 100;
      
      let quality: FibRatio['quality'] = 'poor';
      if (ratio >= 23.6 && ratio <= 38.2) quality = 'excellent';
      else if (ratio >= 23.6 && ratio <= 50) quality = 'good';
      else if (ratio >= 14.6 && ratio <= 61.8) quality = 'ok';
      else quality = 'poor';
      
      ratios.push({
        wave: '4',
        ratio,
        idealRatio: 38.2,
        validMin: 23.6,
        validMax: 50,
        quality,
      });
    }
  }

  if (points.length >= 6 && isImpulse) {
    const p3 = points[3], p4 = points[4], p5 = points[5];
    const wave3Range = Math.abs(p3.price - p2.price);
    if (wave3Range > 0) {
      const wave5Range = Math.abs(p5.price - p4.price);
      const ratio = (wave5Range / wave3Range) * 100;
      
      let quality: FibRatio['quality'] = 'poor';
      if (ratio >= 61.8 && ratio <= 100) quality = 'excellent';
      else if (ratio >= 38.2 && ratio <= 161.8) quality = 'good';
      else if (ratio >= 23.6 && ratio <= 200) quality = 'ok';
      else quality = 'poor';
      
      ratios.push({
        wave: '5',
        ratio,
        idealRatio: 61.8,
        validMin: 38.2,
        validMax: 100,
        quality,
      });
    }
  }

  return ratios;
}

function validateImpulsePattern(points: WavePoint[]): { errors: string[], warnings: string[], detectedSubtype?: string } {
  const errors: string[] = [];
  const warnings: string[] = [];
  let detectedSubtype: string | undefined;

  if (points.length < 2) return { errors, warnings };

  const p0 = points[0];
  const p1 = points.length > 1 ? points[1] : null;
  const p2 = points.length > 2 ? points[2] : null;
  const p3 = points.length > 3 ? points[3] : null;
  const p4 = points.length > 4 ? points[4] : null;
  const p5 = points.length > 5 ? points[5] : null;

  const isUptrend = p1 && p1.price > p0.price;

  if (p2) {
    const wave1Move = Math.abs(p1!.price - p0.price);
    const wave2Retrace = Math.abs(p2.price - p1!.price);
    const retracePercent = (wave2Retrace / wave1Move) * 100;
    
    if (isUptrend && p2.price <= p0.price) {
      errors.push('Wave 2 cannot retrace below Wave 0 (100%+ retracement)');
    } else if (!isUptrend && p2.price >= p0.price) {
      errors.push('Wave 2 cannot retrace above Wave 0 (100%+ retracement)');
    }
    
    if (retracePercent > 99.9) {
      errors.push('Wave 2 retrace exceeds 99.9% - pattern invalid');
    } else if (retracePercent > 78.6) {
      warnings.push(`Wave 2 deep retracement (${retracePercent.toFixed(1)}%) - valid but unusual`);
    }
  }

  if (p3 && p1 && p2) {
    const wave1Move = Math.abs(p1.price - p0.price);
    const wave3Move = Math.abs(p3.price - p2.price);
    
    if (wave3Move < wave1Move) {
      errors.push('Wave 3 cannot be shorter than Wave 1');
    }
    
    if (isUptrend && p3.price <= p1.price) {
      errors.push('Wave 3 must extend beyond Wave 1 high');
    } else if (!isUptrend && p3.price >= p1.price) {
      errors.push('Wave 3 must extend below Wave 1 low');
    }
  }

  if (p4 && p1) {
    if (isUptrend && p4.price < p1.price) {
      errors.push('Wave 4 cannot overlap Wave 1 territory (price below W1)');
    } else if (!isUptrend && p4.price > p1.price) {
      errors.push('Wave 4 cannot overlap Wave 1 territory (price above W1)');
    }
  }

  if (p5 && p3) {
    if (isUptrend && p5.price < p3.price) {
      warnings.push('Wave 5 truncation detected (failed to exceed Wave 3)');
      detectedSubtype = 'Truncated Fifth';
    } else if (!isUptrend && p5.price > p3.price) {
      warnings.push('Wave 5 truncation detected (failed to exceed Wave 3)');
      detectedSubtype = 'Truncated Fifth';
    }
  }

  if (p3 && p5 && p1 && p2 && p4) {
    const wave1Move = Math.abs(p1.price - p0.price);
    const wave3Move = Math.abs(p3.price - p2.price);
    const wave5Move = Math.abs(p5.price - p4.price);
    
    if (wave3Move >= wave1Move && wave3Move >= wave5Move) {
      if (wave3Move > wave1Move * 1.618) {
        detectedSubtype = detectedSubtype || 'Extended Third';
      }
    } else if (wave1Move >= wave3Move && wave1Move >= wave5Move) {
      detectedSubtype = detectedSubtype || 'Extended First';
    } else if (wave5Move >= wave1Move && wave5Move >= wave3Move) {
      detectedSubtype = detectedSubtype || 'Extended Fifth';
    }
  }

  return { errors, warnings, detectedSubtype };
}

function validateDiagonalPattern(points: WavePoint[]): { errors: string[], warnings: string[], detectedSubtype?: string } {
  const errors: string[] = [];
  const warnings: string[] = [];
  let detectedSubtype: string | undefined;

  if (points.length < 4) return { errors, warnings };

  const p0 = points[0];
  const p1 = points[1];
  const p2 = points[2];
  const p3 = points[3];
  const p4 = points.length > 4 ? points[4] : null;
  const p5 = points.length > 5 ? points[5] : null;

  const isUptrend = p1.price > p0.price;

  if (p4 && p5) {
    const line24Slope = (p4.price - p2.price) / (p4.time - p2.time);
    const line13Slope = (p3.price - p1.price) / (p3.time - p1.time);
    
    if (Math.abs(line24Slope) < Math.abs(line13Slope)) {
      detectedSubtype = 'Contracting Diagonal';
    } else if (Math.abs(line24Slope) > Math.abs(line13Slope)) {
      detectedSubtype = 'Expanding Diagonal';
    } else {
      detectedSubtype = 'Parallel Diagonal (unusual)';
    }
  }

  return { errors, warnings, detectedSubtype };
}

function validateCorrectionPattern(points: WavePoint[], patternType: string): { errors: string[], warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (points.length < 3) return { errors, warnings };

  const p0 = points[0];
  const pA = points[1];
  const pB = points[2];
  const pC = points.length > 3 ? points[3] : null;

  const waveAMove = Math.abs(pA.price - p0.price);
  const waveBRetrace = Math.abs(pB.price - pA.price);
  const bRetracePercent = (waveBRetrace / waveAMove) * 100;

  if (patternType === 'zigzag') {
    if (bRetracePercent > 78.6) {
      warnings.push(`Wave B deep retracement (${bRetracePercent.toFixed(1)}%) - unusual for zigzag`);
    }
    
    if (pC) {
      const isDowntrend = pA.price < p0.price;
      if (isDowntrend && pC.price >= pA.price) {
        errors.push('Wave C must extend beyond Wave A in zigzag');
      } else if (!isDowntrend && pC.price <= pA.price) {
        errors.push('Wave C must extend beyond Wave A in zigzag');
      }
    }
  } else if (patternType === 'flat') {
    if (bRetracePercent < 85) {
      warnings.push(`Wave B retracement (${bRetracePercent.toFixed(1)}%) below 85% - weak flat`);
    }
    
    if (pC) {
      const waveCMove = Math.abs(pC.price - pB.price);
      const cExtension = (waveCMove / waveAMove) * 100;
      if (cExtension < 100) {
        warnings.push('Wave C shorter than Wave A - truncated flat');
      }
    }
  }

  return { errors, warnings };
}

export function validateWavePattern(points: WavePoint[], patternType: string): ValidationResult {
  if (!points || points.length < 2) {
    return {
      isValid: true,
      errors: [],
      warnings: [],
      fibonacciRatios: [],
    };
  }

  const fibonacciRatios = calculateFibRatios(points, patternType);
  let errors: string[] = [];
  let warnings: string[] = [];
  let detectedSubtype: string | undefined;

  if (patternType === 'impulse') {
    const result = validateImpulsePattern(points);
    errors = result.errors;
    warnings = result.warnings;
    detectedSubtype = result.detectedSubtype;
  } else if (patternType === 'diagonal') {
    const result = validateDiagonalPattern(points);
    errors = result.errors;
    warnings = result.warnings;
    detectedSubtype = result.detectedSubtype;
  } else if (['zigzag', 'flat', 'triangle'].includes(patternType)) {
    const result = validateCorrectionPattern(points, patternType);
    errors = result.errors;
    warnings = result.warnings;
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    fibonacciRatios,
    detectedType: patternType,
    detectedSubtype,
  };
}
