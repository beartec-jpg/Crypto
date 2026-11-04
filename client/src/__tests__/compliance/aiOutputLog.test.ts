import { describe, it, expect, vi } from 'vitest';
import {
  AI_OUTPUT_LOG_INSERT_SQL,
  AI_PROMPT_VERSION,
  buildAiOutputLogParams,
  logAiOutput,
  logAiOutputBounded,
  AI_OUTPUT_LOG_RETENTION_DAYS,
  pruneAiOutputLog,
} from '../../../../api/_lib/aiOutputLog';

const entry = {
  userId: 'u1',
  symbol: 'BTCUSDT',
  timeframe: '4h/15m',
  mode: 'smc',
  analysisType: 'deep',
  channel: 'web' as const,
  output: { bestTrades: [{ direction: 'LONG', entry: 1 }] },
};

describe('aiOutputLog writer', () => {
  it('writes one insert with all fields and default prompt version', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    await expect(logAiOutput({ query }, entry)).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toBe(AI_OUTPUT_LOG_INSERT_SQL);
    expect(params).toEqual([
      'u1', 'BTCUSDT', '4h/15m', 'smc', 'deep', AI_PROMPT_VERSION, 'web', false,
      JSON.stringify(entry.output), JSON.stringify(entry.output),
    ]);
  });

  it('never throws when the DB rejects or throws synchronously', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(logAiOutput({ query: () => Promise.reject(new Error('down')) }, entry)).resolves.toBe(false);
    await expect(logAiOutput({ query: () => { throw new Error('boom'); } }, entry)).resolves.toBe(false);
    await expect(logAiOutput(null, entry)).resolves.toBe(false);
    warn.mockRestore();
  });

  it('bounded variant resolves even if the DB hangs', async () => {
    const hang = { query: () => new Promise(() => {}) };
    await expect(logAiOutputBounded(hang, entry, 20)).resolves.toBe(false);
  });

  it('handles string output and circular JSON safely', () => {
    expect(buildAiOutputLogParams({ ...entry, output: 'plain' })[9]).toBe('plain');
    const circ: any = {}; circ.self = circ;
    expect(() => buildAiOutputLogParams({ ...entry, output: circ })).not.toThrow();
  });

  it('retains AI output rows for 1 year (365 days) by default', async () => {
    expect(AI_OUTPUT_LOG_RETENTION_DAYS).toBe(365);
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    await pruneAiOutputLog({ query });
    const call = query.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM ai_output_log'));
    expect(call?.[1]).toEqual([365]);
  });
});
