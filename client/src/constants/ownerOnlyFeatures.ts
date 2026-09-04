import type { TradingSystemId } from '@/types/tradingSystems';

/**
 * Unfinished chart tools / systems stay in the codebase but are hidden
 * from every account except the owner email.
 */
export const OWNER_ONLY_EMAIL = 'beartec@beartec.uk';

export const OWNER_ONLY_TRADING_SYSTEM_IDS = [
  'momentum-scalper',
  'mean-reversion',
  'breakout-momentum',
  'smart-money',
  'volume-profile',
] as const satisfies readonly TradingSystemId[];

export const OWNER_ONLY_OSCILLATOR_IDS = ['smartMoney'] as const;

export function isOwnerOnlyEmail(email: string | undefined | null): boolean {
  return email === OWNER_ONLY_EMAIL;
}

export function isOwnerOnlyTradingSystem(systemId: string | null | undefined): boolean {
  return OWNER_ONLY_TRADING_SYSTEM_IDS.includes(systemId as (typeof OWNER_ONLY_TRADING_SYSTEM_IDS)[number]);
}
