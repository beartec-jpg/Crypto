import type { VercelRequest, VercelResponse } from '@vercel/node';

// Wave degrees with format matching frontend expectations
const WAVE_DEGREES = [
  { name: 'Grand Supercycle', color: '#FF0000', labels: ['(I)', '(II)', '(III)', '(IV)', '(V)'] },
  { name: 'Supercycle', color: '#FF6B00', labels: ['(I)', '(II)', '(III)', '(IV)', '(V)'] },
  { name: 'Cycle', color: '#FFD700', labels: ['I', 'II', 'III', 'IV', 'V'] },
  { name: 'Primary', color: '#00FF00', labels: ['1', '2', '3', '4', '5'] },
  { name: 'Intermediate', color: '#00BFFF', labels: ['(1)', '(2)', '(3)', '(4)', '(5)'] },
  { name: 'Minor', color: '#0000FF', labels: ['1', '2', '3', '4', '5'] },
  { name: 'Minute', color: '#8B00FF', labels: ['i', 'ii', 'iii', 'iv', 'v'] },
  { name: 'Minuette', color: '#FF1493', labels: ['(i)', '(ii)', '(iii)', '(iv)', '(v)'] },
  { name: 'Subminuette', color: '#808080', labels: ['i', 'ii', 'iii', 'iv', 'v'] },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    res.json({ degrees: WAVE_DEGREES });
  } catch (error: any) {
    console.error('Error fetching wave degrees:', error);
    res.status(500).json({ error: error.message });
  }
}
