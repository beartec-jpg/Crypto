import { describe, it, expect } from 'vitest';
import { AI_TRADER_MODES } from '@shared/aiTraderModes';
import { AI_TRADER_MODES as API_AI_TRADER_MODES } from '../../../../api/_lib/aiTraderModes';
import {
  SCENARIO_FRAMING_PROMPT,
  withScenarioFraming,
  withScenarioFramingMessages,
} from '@shared/scenarioFraming';
import * as apiFraming from '../../../../api/_lib/scenarioFraming';

describe('AI compliance framing (technical scenarios, not advice)', () => {
  it('every trader mode prompt starts with the compliance framing', () => {
    for (const mode of [...AI_TRADER_MODES, ...API_AI_TRADER_MODES]) {
      expect(mode.systemPrompt.startsWith('COMPLIANCE RULES')).toBe(true);
    }
  });

  it('framing is idempotent and added when no system message exists', () => {
    expect(withScenarioFraming(withScenarioFraming('x'))).toBe(withScenarioFraming('x'));
    const msgs = withScenarioFramingMessages([{ role: 'user' as const, content: 'hi' }]);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toBe(SCENARIO_FRAMING_PROMPT);
  });

  it('api and shared copies stay in sync', () => {
    expect(apiFraming.SCENARIO_FRAMING_PROMPT).toBe(SCENARIO_FRAMING_PROMPT);
    expect(apiFraming.SCENARIO_DISCLAIMER_TEXT).toMatch(/Not financial advice/);
  });
});
