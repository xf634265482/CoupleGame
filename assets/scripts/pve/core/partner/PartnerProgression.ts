import { hasCompletedPartnerTrial } from './PartnerTrial';
import {
  PARTNER_EVOLVE_LEVEL,
  PARTNER_EVOLVE_STARDUST,
  type PartnerEvolutionStage,
  type PlayerPartnerProgress,
} from './PartnerTypes';
import { createDefaultPartners as createDefaultPartnersImpl } from './PartnerProfile';

export { createDefaultPartnersImpl as createDefaultPartners };

const MAX_PARTNER_LEVEL = 99;

export function partnerClearExp(clearedFloor: number): number {
  return 30 + Math.max(0, Math.trunc(clearedFloor));
}

/** XP needed to go from `level` → `level + 1`. */
export function xpRequiredForLevel(level: number): number {
  const lv = Math.max(1, Math.trunc(level));
  return 30 + lv * 15;
}

export function grantPartnerExp(progress: PlayerPartnerProgress, amount: number): PlayerPartnerProgress {
  if (!progress.unlocked || amount <= 0) return progress;
  let level = Math.max(1, progress.level);
  let exp = Math.max(0, progress.exp) + Math.trunc(amount);
  while (level < MAX_PARTNER_LEVEL) {
    const need = xpRequiredForLevel(level);
    if (exp < need) break;
    exp -= need;
    level += 1;
  }
  if (level >= MAX_PARTNER_LEVEL) exp = 0;
  return { ...progress, level, exp };
}

export type EvolveCheck =
  | { ok: true; toStage: 2 | 3 | 4; cost: number }
  | { ok: false; reason: string };

export function canEvolve(progress: PlayerPartnerProgress, gold: number, partnerIdForTrial?: import('./PartnerTypes').PartnerId): EvolveCheck {
  if (!progress.unlocked) return { ok: false, reason: 'PARTNER_LOCKED' };
  if (progress.evolutionStage >= 4) return { ok: false, reason: 'PARTNER_MAX_STAGE' };
  const toStage = (progress.evolutionStage + 1) as 2 | 3 | 4;
  const needLevel = PARTNER_EVOLVE_LEVEL[toStage];
  if (progress.level < needLevel) return { ok: false, reason: 'PARTNER_LEVEL_LOW' };
  const cost = PARTNER_EVOLVE_STARDUST[toStage];
  if (gold < cost) return { ok: false, reason: 'PARTNER_STARDUST_LOW' };
  if (toStage >= 3) {
    const id = partnerIdForTrial ?? 'MOBILITY';
    if (!hasCompletedPartnerTrial(id, toStage)) return { ok: false, reason: 'PARTNER_TRIAL_INCOMPLETE' };
  }
  return { ok: true, toStage, cost };
}

export function evolvePartner(
  progress: PlayerPartnerProgress,
  gold: number,
  partnerIdForTrial?: import('./PartnerTypes').PartnerId,
): { ok: true; progress: PlayerPartnerProgress; gold: number } | { ok: false; reason: string; progress: PlayerPartnerProgress; gold: number } {
  const check = canEvolve(progress, gold, partnerIdForTrial);
  if (!check.ok) return { ok: false, reason: check.reason, progress, gold };
  return {
    ok: true,
    progress: { ...progress, evolutionStage: check.toStage as PartnerEvolutionStage },
    gold: gold - check.cost,
  };
}
