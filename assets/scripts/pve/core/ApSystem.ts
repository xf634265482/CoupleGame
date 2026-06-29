import { AP_BASE, AP_COST, DICE_MAX, DICE_MIN } from './PveConstants';
import type { Rng } from './rng';

export type ApAction = keyof typeof AP_COST;
export type ApCostOverrides = Partial<Record<ApAction, number>>;

export function rollAp(rng: Rng, apBase = AP_BASE): { dice: number; ap: number } {
  const dice = rng.int(DICE_MIN, DICE_MAX);
  return { dice, ap: apBase + dice };
}

export function costOf(action: ApAction, overrides?: ApCostOverrides): number {
  return overrides?.[action] ?? AP_COST[action];
}

export function canAfford(ap: number, action: ApAction, overrides?: ApCostOverrides): boolean {
  return ap >= costOf(action, overrides);
}

export function spend(ap: number, action: ApAction, overrides?: ApCostOverrides): number {
  const cost = costOf(action, overrides);
  if (ap < cost) {
    throw new Error(`ApSystem.spend: insufficient AP for ${action} (have ${ap}, need ${cost})`);
  }
  return ap - cost;
}

export function isExhausted(ap: number): boolean {
  const minCost = Math.min(...Object.values(AP_COST));
  return ap < minCost;
}
