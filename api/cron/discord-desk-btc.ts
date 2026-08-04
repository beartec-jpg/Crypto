/**
 * Pre-London desk — BTC only (isolated request).
 * Schedule: 05:45 UTC
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import deskHandler from './discord-btc-pre-london.js';

export const config = {
  maxDuration: 300,
  memory: 1024,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Force single-symbol so nothing is conflated with XRP in this invocation
  req.query = { ...req.query, symbol: 'BTCUSDT' };
  return deskHandler(req, res);
}
