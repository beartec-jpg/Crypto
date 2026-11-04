import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { TECHNICAL_SCENARIO_DISCLAIMER as API_DISCLAIMER } from '../../../../api/_lib/scenarioDisclaimer';
import { TECHNICAL_SCENARIO_DISCLAIMER as UI_DISCLAIMER } from '@/components/TechnicalScenarioDisclaimer';

// Prompt/scenario wording is covered by aiScenarioFraming.test.ts (wording from #602 on main).

describe('disclaimer', () => {
  it('UI and server disclaimer text match', () => {
    expect(UI_DISCLAIMER).toBe(API_DISCLAIMER);
    expect(API_DISCLAIMER).toMatch(/not financial advice/i);
  });

  it('PNG renderers and Discord posts reference the disclaimer', () => {
    const root = path.resolve(__dirname, '../../../..');
    // Client PNG downloads use main's IMAGE_DISCLAIMER (from #602).
    expect(readFileSync(path.join(root, 'client/src/lib/downloadTradeImage.ts'), 'utf8')).toContain('drawImageDisclaimer');
    for (const f of [
      'api/_lib/renderDiscordAnalysisPng.ts',
      'api/_lib/discordWebhook.ts',
      'api/cron/discord-btc-pre-london.ts',
    ]) {
      expect(readFileSync(path.join(root, f), 'utf8')).toContain('TECHNICAL_SCENARIO_DISCLAIMER');
    }
  });
});
