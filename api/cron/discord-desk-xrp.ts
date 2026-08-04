/**
 * Pre-London desk — XRP only (isolated request, 5 min after BTC).
 * Schedule: 05:50 UTC
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import deskHandler from './discord-btc-pre-london.js';

export const config = {
  maxDuration: 300,
  memory: 1024,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Force single-symbol so nothing is conflated with BTC in this invocation
  req.query = { ...req.query, symbol: 'XRPUSDT' };
  return deskHandler(req, res);
}
