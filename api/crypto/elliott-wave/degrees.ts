import type { VercelRequest, VercelResponse } from '@vercel/node';

const WAVE_DEGREES = [
  { id: 'supercycle', label: 'Supercycle', motive: ['(I)', '(II)', '(III)', '(IV)', '(V)'], corrective: ['(A)', '(B)', '(C)', '(D)', '(E)'] },
  { id: 'cycle', label: 'Cycle', motive: ['I', 'II', 'III', 'IV', 'V'], corrective: ['A', 'B', 'C', 'D', 'E'] },
  { id: 'primary', label: 'Primary', motive: ['①', '②', '③', '④', '⑤'], corrective: ['Ⓐ', 'Ⓑ', 'Ⓒ', 'Ⓓ', 'Ⓔ'] },
  { id: 'intermediate', label: 'Intermediate', motive: ['(1)', '(2)', '(3)', '(4)', '(5)'], corrective: ['(a)', '(b)', '(c)', '(d)', '(e)'] },
  { id: 'minor', label: 'Minor', motive: ['1', '2', '3', '4', '5'], corrective: ['a', 'b', 'c', 'd', 'e'] },
  { id: 'minute', label: 'Minute', motive: ['i', 'ii', 'iii', 'iv', 'v'], corrective: ['a\'', 'b\'', 'c\'', 'd\'', 'e\''] },
  { id: 'minuette', label: 'Minuette', motive: ['(i)', '(ii)', '(iii)', '(iv)', '(v)'], corrective: ['(a\')', '(b\')', '(c\')', '(d\')', '(e\')'] },
];

const CORRECTION_LABELS = {
  zigzag: ['A', 'B', 'C'],
  flat: ['A', 'B', 'C'],
  triangle: ['A', 'B', 'C', 'D', 'E'],
  combo: ['W', 'X', 'Y'],
  triple: ['W', 'X', 'Y', 'X', 'Z'],
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    res.json({ degrees: WAVE_DEGREES, correctionLabels: CORRECTION_LABELS });
  } catch (error: any) {
    console.error('Error fetching wave degrees:', error);
    res.status(500).json({ error: error.message });
  }
}
