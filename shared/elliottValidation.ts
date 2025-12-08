export interface WavePoint {
  index: number;
  label: string;
  price: number;
  time: number;
  isCorrection: boolean;
}

export interface FibRatio {
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
  detectedType?: 'zigzag' | 'flat' | 'impulse' | 'triangle' | 'diagonal';
  detectedSubtype?: 'regular_flat' | 'expanded_flat' | 'running_flat';
}

export function calculateFibRatios(points: WavePoint[], patternType: string): FibRatio[] {
  const ratios: FibRatio[] = [];
  if (points.length < 3) return ratios;

  const isImpulse = patternType === 'impulse' || patternType === 'diagonal';
  const _isCorrection = patternType === 'zigzag' || patternType === 'flat' || patternType === 'triangle';

  // Wave 2/B retracement of Wave 1/A
  const p0 = points[0], p1 = points[1], p2 = points[2];
  const wave1Range = Math.abs(p1.price - p0.price);
  if (wave1Range > 0) {
    const wave2Retrace = Math.abs(p2.price - p1.price);
    const ratio = (wave2Retrace / wave1Range) * 100;
    
    let quality: FibRatio['quality'] = 'poor';
    let idealRatio = 61.8;
    let validMin = 38.2, validMax = 78.6;
    
    if (isImpulse) {
      // Impulse wave 2: ideal 50-61.8%
      if (ratio >= 50 && ratio <= 61.8) quality = 'excellent';
      else if (ratio >= 38.2 && ratio <= 78.6) quality = 'good';
      else if (ratio >= 23.6 && ratio <= 88.6) quality = 'ok';
      else quality = 'poor';
    } else if (patternType === 'zigzag') {
      // Zigzag B: ideal 50-61.8%
      if (ratio >= 50 && ratio <= 61.8) quality = 'excellent';
      else if (ratio >= 38.2 && ratio <= 78.6) quality = 'good';
      else quality = 'ok';
    } else if (patternType === 'flat') {
      // Flat B: should be near 100%+
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

  // Wave 3/C extension
  if (points.length >= 4) {
    const p3 = points[3];
    const wave3Range = Math.abs(p3.price - p2.price);
    if (wave1Range > 0) {
      const ratio = (wave3Range / wave1Range) * 100;
      
      let quality: FibRatio['quality'] = 'poor';
      let idealRatio = 161.8;
      let validMin = 100, validMax = 261.8;
      
      if (isImpulse) {
        // Wave 3: ideal 161.8%+
        if (ratio >= 161.8 && ratio <= 261.8) quality = 'excellent';
        else if (ratio >= 138.2 && ratio <= 361.8) quality = 'good';
        else if (ratio >= 100) quality = 'ok';
        else quality = 'poor';
      } else if (patternType === 'zigzag') {
        // C wave: ideal 100-161.8%
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

  // Wave 4 retracement (impulse only)
  if (points.length >= 5 && isImpulse) {
    const p3 = points[3], p4 = points[4];
    const wave3Range = Math.abs(p3.price - p2.price);
    if (wave3Range > 0) {
      const wave4Retrace = Math.abs(p4.price - p3.price);
      const ratio = (wave4Retrace / wave3Range) * 100;
      
      let quality: FibRatio['quality'] = 'poor';
      // Wave 4: ideal 38.2%
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

  // Wave 5 extension (impulse only)
  if (points.length >= 6 && isImpulse) {
    const p3 = points[3], p4 = points[4], p5 = points[5];
    const wave3Range = Math.abs(p3.price - p2.price);
    if (wave3Range > 0) {
      const wave5Range = Math.abs(p5.price - p4.price);
      const ratio = (wave5Range / wave3Range) * 100;
      
      let quality: FibRatio['quality'] = 'poor';
      // Wave 5: typically 61.8% of W3
      if (ratio >= 61.8 && ratio <= 100) quality = 'excellent';
      else if (ratio >= 38.2 && ratio <= 161.8) quality = 'good';
      else quality = 'ok';
      
      ratios.push({
        wave: '5',
        ratio,
        idealRatio: 61.8,
        validMin: 38.2,
        validMax: 161.8,
        quality,
      });
    }
  }

  return ratios;
}

export function validatePattern(points: WavePoint[], patternType: string): {
  errors: string[];
  warnings: string[];
  detectedType?: 'zigzag' | 'flat' | 'impulse' | 'triangle' | 'diagonal';
  detectedSubtype?: 'regular_flat' | 'expanded_flat' | 'running_flat';
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  let detectedType = patternType as 'zigzag' | 'flat' | 'impulse' | 'triangle' | 'diagonal' | undefined;
  let detectedSubtype: 'regular_flat' | 'expanded_flat' | 'running_flat' | undefined;
  
  if (points.length < 3) {
    return { errors, warnings, detectedType };
  }

  const p0 = points[0], p1 = points[1], p2 = points[2];
  const wave1Range = Math.abs(p1.price - p0.price);
  const wave2Range = Math.abs(p2.price - p1.price);
  const isUptrend = p1.price > p0.price;

  if (patternType === 'impulse') {
    // Check Wave 2 doesn't retrace 100%
    if (wave2Range >= wave1Range) {
      errors.push('Wave 2 cannot retrace more than 100% of Wave 1');
    }
    
    if (points.length >= 4) {
      const p3 = points[3];
      const wave3Range = Math.abs(p3.price - p2.price);
      
      // Wave 3 should be larger than Wave 1
      if (wave3Range < wave1Range * 0.8) {
        warnings.push('Wave 3 is unusually short compared to Wave 1');
      }
    }
    
    if (points.length >= 5) {
      const p4 = points[4];
      
      // Wave 4 cannot overlap Wave 1
      if (isUptrend && p4.price < p1.price) {
        errors.push('Wave 4 cannot overlap Wave 1 territory (in uptrend)');
      } else if (!isUptrend && p4.price > p1.price) {
        errors.push('Wave 4 cannot overlap Wave 1 territory (in downtrend)');
      }
    }
    
    if (points.length >= 6) {
      const p3 = points[3], p5 = points[5];
      const wave3Range = Math.abs(p3.price - p2.price);
      const wave5Range = Math.abs(p5.price - points[4].price);
      
      // Wave 3 cannot be the shortest
      if (wave3Range < wave1Range && wave3Range < wave5Range) {
        errors.push('Wave 3 cannot be the shortest wave');
      }
    }
  } else if (patternType === 'flat') {
    // Flat: B returns near A's start, C ends near A's end
    const bRetrace = (wave2Range / wave1Range) * 100;
    
    if (bRetrace >= 100 && bRetrace <= 123.6) {
      detectedSubtype = 'expanded_flat';
    } else if (bRetrace >= 90 && bRetrace < 100) {
      detectedSubtype = 'regular_flat';
    } else if (bRetrace < 90) {
      detectedSubtype = 'running_flat';
      warnings.push('Running flat detected - B wave is weak');
    }
    
    if (bRetrace < 70) {
      warnings.push('B wave retracement is unusually shallow for a flat');
    }
  } else if (patternType === 'zigzag') {
    // Zigzag: sharp correction, B typically 50-61.8%
    const bRetrace = (wave2Range / wave1Range) * 100;
    
    if (bRetrace > 78.6) {
      warnings.push('B wave retracement is deep - consider if this is a flat instead');
    }
  } else if (patternType === 'diagonal') {
    // Diagonal: wave 4 CAN overlap wave 1
    if (points.length >= 5) {
      // Just warn if structure looks off
      if (wave2Range > wave1Range * 0.95) {
        warnings.push('Wave 2 is very deep for a diagonal');
      }
    }
  }

  return { errors, warnings, detectedType, detectedSubtype };
}

export function runValidation(points: WavePoint[], patternType: string): ValidationResult {
  const fibonacciRatios = calculateFibRatios(points, patternType);
  const { errors, warnings, detectedType, detectedSubtype } = validatePattern(points, patternType);
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    fibonacciRatios,
    detectedType,
    detectedSubtype,
  };
}
