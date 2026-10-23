import { describe, expect, it } from 'vitest';
import {
  buildPrimaryResponsesRequest,
  deepDiveCostUsd,
  resolveDeepDiveModelConfig,
  responsesOutputText,
  responsesToCompletion,
} from '../../../../api/_lib/deepDiveModel';

describe('deep dive model config', () => {
  it('defaults to grok-4.7 with low reasoning (no fallback model)', () => {
    expect(resolveDeepDiveModelConfig({})).toEqual({ primaryModel: 'grok-4.7', reasoningEffort: 'low' });
  });

  it('prices grok-4.7 at $2 in / $6 out per 1M tokens', () => {
    expect(deepDiveCostUsd(1_000_000, 1_000_000)).toBe(8);
    expect(deepDiveCostUsd(10_000, 3_000)).toBeCloseTo(0.038, 6);
  });

  it('honours env overrides and rejects bad effort values', () => {
    expect(resolveDeepDiveModelConfig({
      XAI_DEEP_DIVE_MODEL: 'grok-4.6', XAI_DEEP_DIVE_REASONING_EFFORT: 'MEDIUM',
    })).toEqual({ primaryModel: 'grok-4.6', reasoningEffort: 'medium' });
    expect(resolveDeepDiveModelConfig({ XAI_DEEP_DIVE_REASONING_EFFORT: 'none' }).reasoningEffort).toBe('low');
  });

  it('builds a Responses request with explicit effort', () => {
    const req = buildPrimaryResponsesRequest(resolveDeepDiveModelConfig({}), 'sys', 'user', 16000);
    expect(req).toMatchObject({ model: 'grok-4.7', reasoning: { effort: 'low' }, max_output_tokens: 16000, store: false });
    expect(req.input).toEqual([{ role: 'system', content: 'sys' }, { role: 'user', content: 'user' }]);
  });

  it('maps Responses output and usage onto the completion shape', () => {
    const resp = {
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', content: [{ type: 'output_text', text: '{"a":' }, { type: 'output_text', text: '1}' }] },
      ],
      usage: { input_tokens: 9000, output_tokens: 2500, output_tokens_details: { reasoning_tokens: 900 } },
    };
    expect(responsesOutputText(resp)).toBe('{"a":1}');
    expect(responsesToCompletion(resp)).toEqual({
      choices: [{ message: { content: '{"a":1}' } }],
      usage: { prompt_tokens: 9000, completion_tokens: 2500, reasoning_tokens: 900 },
    });
  });

  it('throws on empty output so the run fails', () => {
    expect(() => responsesToCompletion({ status: 'incomplete', output: [] })).toThrow(/empty response/);
  });
});
