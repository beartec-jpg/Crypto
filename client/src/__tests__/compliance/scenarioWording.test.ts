import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { AI_TRADER_MODES as API_MODES, SCENARIO_LANGUAGE_RULES } from '../../../../api/_lib/aiTraderModes';
import { AI_TRADER_MODES as SHARED_MODES } from '../../../../shared/aiTraderModes';
import { TECHNICAL_SCENARIO_DISCLAIMER as API_DISCLAIMER } from '../../../../api/_lib/scenarioDisclaimer';
import { TECHNICAL_SCENARIO_DISCLAIMER as UI_DISCLAIMER } from '@/components/TechnicalScenarioDisclaimer';

// Phrases that must never appear as instructions to the model / in persona text.
const BANNED = [
  /you should/i, /buy now/i, /sell now/i, /enter now/i, /hot pick/i, /guaranteed/i,
  /% of (your )?(account|portfolio)/i, /\belite\b/i, /\byour (stop|entry|account|portfolio)\b/i,
];

function stripRules(text: string): string {
  // The language rules quote banned phrases in order to forbid them.
  return text.split(SCENARIO_LANGUAGE_RULES).join('');
}

describe('AI trader mode prompt wording', () => {
  for (const modes of [API_MODES, SHARED_MODES]) {
    for (const mode of modes) {
      it(`${mode.id} prompt has no directive/personal/hype language and includes the rules`, () => {
        expect(mode.systemPrompt).toContain(SCENARIO_LANGUAGE_RULES);
        const body = stripRules(mode.systemPrompt);
        for (const re of BANNED) expect(body).not.toMatch(re);
        expect(body).not.toMatch(/\btrader\b/i);
      });
    }
  }

  it('api and shared copies stay in sync', () => {
    expect(API_MODES.map((m) => m.systemPrompt)).toEqual(SHARED_MODES.map((m) => m.systemPrompt));
  });

  it('language rules forbid the key phrases', () => {
    for (const p of ['buy', 'sell', 'you should', 'enter now', 'position sizing', 'hot picks', 'performance claims']) {
      expect(SCENARIO_LANGUAGE_RULES.toLowerCase()).toContain(p);
    }
  });
});

describe('disclaimer', () => {
  it('UI and server disclaimer text match', () => {
    expect(UI_DISCLAIMER).toBe(API_DISCLAIMER);
    expect(API_DISCLAIMER).toMatch(/not financial advice/i);
  });

  it('PNG renderers and Discord posts reference the disclaimer', () => {
    const root = path.resolve(__dirname, '../../../..');
    for (const f of [
      'client/src/lib/downloadTradeImage.ts',
      'api/_lib/renderDiscordAnalysisPng.ts',
      'api/_lib/discordWebhook.ts',
      'api/cron/discord-btc-pre-london.ts',
    ]) {
      expect(readFileSync(path.join(root, f), 'utf8')).toContain('TECHNICAL_SCENARIO_DISCLAIMER');
    }
  });
});
