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
    
    const analysis = {
      pattern: patternType || 'impulse',
      confidence: 'medium',
      suggestions: [
        'Consider wave degree alignment',
        'Verify Fibonacci relationships',
        'Check for wave alternation'
      ],
      fibTargets: calculateTargets(points)
    };
    
    res.json(analysis);

  } catch (error: any) {
    console.error('Error analyzing wave pattern:', error);
    res.status(500).json({ error: error.message });
  }
}

function calculateTargets(points: any[]) {
  if (!points || points.length < 3) return [];
  
  const targets: any[] = [];
  const lastPoint = points[points.length - 1];
  const prevPoint = points[points.length - 2];
  
  if (lastPoint && prevPoint) {
    const range = Math.abs(lastPoint.price - prevPoint.price);
    const direction = lastPoint.price > prevPoint.price ? 1 : -1;
    
    targets.push({
      level: '61.8%',
      price: lastPoint.price + (range * 0.618 * direction)
    });
    targets.push({
      level: '100%',
      price: lastPoint.price + (range * 1.0 * direction)
    });
    targets.push({
      level: '161.8%',
      price: lastPoint.price + (range * 1.618 * direction)
    });
  }
  
  return targets;
}
