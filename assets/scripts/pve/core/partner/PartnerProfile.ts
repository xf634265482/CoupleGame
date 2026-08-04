import {
  PARTNER_IDS,
  type PartnerEvolutionStage,
  type PartnerId,
  type PartnersMap,
  type PlayerPartnerProgress,
} from './PartnerTypes';
import {
  createLockedPartnersMap,
  resolvePartnerUnlockScheme,
  type PartnerUnlockScheme,
} from './PartnerUnlock';

function defaultProgress(): PlayerPartnerProgress {
  return { unlocked: false, level: 1, exp: 0, evolutionStage: 1 };
}

function unlockedProgress(): PlayerPartnerProgress {
  return { unlocked: true, level: 1, exp: 0, evolutionStage: 1 };
}

export function createDefaultPartners(): {
  partners: PartnersMap;
  equippedPartnerId: PartnerId | null;
  partnerUnlockScheme: PartnerUnlockScheme;
} {
  return {
    partners: createLockedPartnersMap(),
    equippedPartnerId: null,
    partnerUnlockScheme: 'progressive',
  };
}

function clampStage(value: unknown): PartnerEvolutionStage {
  const n = Number(value);
  if (n === 2 || n === 3 || n === 4) return n;
  return 1;
}

function normalizeOne(raw: unknown): PlayerPartnerProgress {
  const base = defaultProgress();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  return {
    unlocked: o.unlocked === true,
    level: Math.max(1, Math.min(99, Number.isFinite(Number(o.level)) ? Math.trunc(Number(o.level)) : 1)),
    exp: Math.max(0, Number.isFinite(Number(o.exp)) ? Math.trunc(Number(o.exp)) : 0),
    evolutionStage: clampStage(o.evolutionStage),
  };
}

function createLegacyAllUnlocked(): PartnersMap {
  const partners = {} as PartnersMap;
  for (const id of PARTNER_IDS) {
    partners[id] = unlockedProgress();
  }
  return partners;
}

export function normalizePartners(raw: {
  partners?: Partial<Record<string, unknown>> | null;
  equippedPartnerId?: string | null;
  partnerUnlockScheme?: PartnerUnlockScheme | string | null;
  highestClearedFloor?: number | null;
} | null | undefined): {
  partners: PartnersMap;
  equippedPartnerId: PartnerId | null;
  partnerUnlockScheme: PartnerUnlockScheme;
} {
  const scheme = resolvePartnerUnlockScheme(raw);
  const src = raw?.partners && typeof raw.partners === 'object' ? raw.partners : null;

  let partners = {} as PartnersMap;
  if (!src && scheme === 'legacy') {
    partners = createLegacyAllUnlocked();
  } else {
    const defaults = createLockedPartnersMap();
    for (const id of PARTNER_IDS) {
      partners[id] = src && src[id] !== undefined ? normalizeOne(src[id]) : defaults[id];
    }
  }

  const equipped =
    typeof raw?.equippedPartnerId === 'string'
      && (PARTNER_IDS as readonly string[]).includes(raw.equippedPartnerId)
      && partners[raw.equippedPartnerId as PartnerId].unlocked
      ? (raw.equippedPartnerId as PartnerId)
      : null;

  return { partners, equippedPartnerId: equipped, partnerUnlockScheme: scheme };
}
