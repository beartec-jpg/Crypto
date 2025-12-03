import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { points, patternType } = req.body;
    
    if (!points || !Array.isArray(points)) {
      return res.status(400).json({ error: 'Points array required' });
    }

    const fibResults = calculateFibRetracements(points);
    const violations = findViolations(points, patternType);
    
    res.json({
      isValid: violations.length === 0,
      violations,
      fibResults,
      patternType: patternType || 'impulse'
    });

  } catch (error: any) {
    console.error('Error validating wave pattern:', error);
    res.status(500).json({ error: error.message });
  }
}

function calculateFibRetracements(points: any[]) {
  if (points.length < 2) return [];
  
  const results: any[] = [];
  
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    
    if (i >= 2) {
      const wave1Start = points[i - 2];
      const wave1End = points[i - 1];
      const wave2End = curr;
      
      const wave1Range = Math.abs(wave1End.price - wave1Start.price);
      const wave2Range = Math.abs(wave2End.price - wave1End.price);
      
      if (wave1Range > 0) {
        const retracement = (wave2Range / wave1Range) * 100;
        results.push({
          wave: i,
          retracement: retracement.toFixed(1) + '%',
          value: retracement
        });
      }
    }
  }
  
  return results;
}

function findViolations(points: any[], patternType: string) {
  const violations: string[] = [];
  
  if (points.length < 3) return violations;
  
  if (patternType === 'impulse' && points.length >= 5) {
    const wave1 = Math.abs(points[1].price - points[0].price);
    const wave3 = Math.abs(points[3].price - points[2].price);
    const wave5 = points.length > 4 ? Math.abs(points[4].price - points[3].price) : 0;
    
    if (wave3 < wave1 && wave3 < wave5 && wave3 > 0) {
      violations.push('Wave 3 cannot be the shortest wave');
    }
    
    if (points.length >= 4) {
      const wave4End = points[4]?.price;
      const wave1End = points[1]?.price;
      const isUptrend = points[1].price > points[0].price;
      
      if (isUptrend && wave4End && wave4End < wave1End) {
        violations.push('Wave 4 cannot overlap Wave 1 territory');
      } else if (!isUptrend && wave4End && wave4End > wave1End) {
        violations.push('Wave 4 cannot overlap Wave 1 territory');
      }
    }
  }
  
  return violations;
}
