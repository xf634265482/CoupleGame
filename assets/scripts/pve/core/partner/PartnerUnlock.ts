import { PARTNER_IDS, type PartnerId, type PartnersMap, type PlayerPartnerProgress } from './PartnerTypes';

export type PartnerUnlockScheme = 'progressive' | 'legacy';

/** 通关层数门槛（不含 MOBILITY；位移仅教程发放）。 */
export const PARTNER_UNLOCK_BY_CLEAR_FLOOR: Readonly<Partial<Record<PartnerId, number>>> = {
  GUARD: 3,
  HEAL: 5,
  BREAKER: 7,
  CONTROL: 10,
  ANIMA: 17,
};

export function partnerUnlockHint(partnerId: PartnerId): string {
  if (partnerId === 'MOBILITY') return '进入新手教程解锁';
  const floor = PARTNER_UNLOCK_BY_CLEAR_FLOOR[partnerId];
  if (floor != null) return `通关第 ${floor} 层解锁`;
  return '未解锁';
}

function lockedProgress(): PlayerPartnerProgress {
  return { unlocked: false, level: 1, exp: 0, evolutionStage: 1 };
}

export function createLockedPartnersMap(): PartnersMap {
  const partners = {} as PartnersMap;
  for (const id of PARTNER_IDS) {
    partners[id] = lockedProgress();
  }
  return partners;
}

export function applyPartnerUnlocks(
  partners: PartnersMap,
  clearedFloor: number,
): { partners: PartnersMap; newlyUnlockedPartnerIds: PartnerId[] } {
  const floor = Math.max(0, Math.trunc(clearedFloor));
  const next = { ...partners } as PartnersMap;
  const newlyUnlockedPartnerIds: PartnerId[] = [];
  for (const id of PARTNER_IDS) {
    const need = PARTNER_UNLOCK_BY_CLEAR_FLOOR[id];
    if (need == null) continue;
    const cur = next[id] ?? lockedProgress();
    if (!cur.unlocked && floor >= need) {
      next[id] = { ...cur, unlocked: true };
      newlyUnlockedPartnerIds.push(id);
    } else {
      next[id] = cur;
    }
  }
  return { partners: next, newlyUnlockedPartnerIds };
}

export function grantStarterPartner(
  partners: PartnersMap,
  equippedPartnerId: PartnerId | null,
): {
  partners: PartnersMap;
  equippedPartnerId: 'MOBILITY';
  newlyUnlockedPartnerIds: PartnerId[];
} {
  const cur = partners.MOBILITY ?? lockedProgress();
  const newlyUnlockedPartnerIds: PartnerId[] = [];
  let nextMobility = cur;
  if (!cur.unlocked) {
    nextMobility = { ...cur, unlocked: true };
    newlyUnlockedPartnerIds.push('MOBILITY');
  }
  return {
    partners: { ...partners, MOBILITY: nextMobility },
    equippedPartnerId: 'MOBILITY',
    newlyUnlockedPartnerIds,
  };
}

export function resolvePartnerUnlockScheme(raw: {
  partnerUnlockScheme?: unknown;
  partners?: Partial<Record<string, unknown>> | null;
  highestClearedFloor?: unknown;
} | null | undefined): PartnerUnlockScheme {
  if (raw?.partnerUnlockScheme === 'legacy' || raw?.partnerUnlockScheme === 'progressive') {
    return raw.partnerUnlockScheme;
  }
  const src = raw?.partners && typeof raw.partners === 'object' ? raw.partners : null;
  if (src) {
    for (const id of PARTNER_IDS) {
      const entry = src[id];
      if (entry && typeof entry === 'object' && (entry as { unlocked?: unknown }).unlocked === true) {
        return 'legacy';
      }
    }
  }
  const cleared = Number(raw?.highestClearedFloor);
  if (!src && Number.isFinite(cleared) && cleared > 0) {
    return 'legacy';
  }
  return 'progressive';
}
