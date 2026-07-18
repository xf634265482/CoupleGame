import {
  PARTNER_IDS,
  type PartnerEvolutionStage,
  type PartnerId,
  type PartnersMap,
  type PlayerPartnerProgress,
} from './PartnerTypes';

function defaultProgress(): PlayerPartnerProgress {
  return { unlocked: true, level: 1, exp: 0, evolutionStage: 1 };
}

export function createDefaultPartners(): { partners: PartnersMap; equippedPartnerId: PartnerId } {
  const partners = {} as PartnersMap;
  for (const id of PARTNER_IDS) {
    partners[id] = defaultProgress();
  }
  return { partners, equippedPartnerId: 'MOBILITY' };
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
    unlocked: o.unlocked !== false,
    level: Math.max(1, Math.min(99, Number.isFinite(Number(o.level)) ? Math.trunc(Number(o.level)) : 1)),
    exp: Math.max(0, Number.isFinite(Number(o.exp)) ? Math.trunc(Number(o.exp)) : 0),
    evolutionStage: clampStage(o.evolutionStage),
  };
}

export function normalizePartners(raw: {
  partners?: Partial<Record<string, unknown>> | null;
  equippedPartnerId?: string | null;
} | null | undefined): { partners: PartnersMap; equippedPartnerId: PartnerId } {
  const defaults = createDefaultPartners();
  const src = raw?.partners && typeof raw.partners === 'object' ? raw.partners : {};
  const partners = {} as PartnersMap;
  for (const id of PARTNER_IDS) {
    partners[id] = src[id] !== undefined ? normalizeOne(src[id]) : defaults.partners[id];
  }
  const equipped =
    typeof raw?.equippedPartnerId === 'string' && (PARTNER_IDS as readonly string[]).includes(raw.equippedPartnerId)
      && partners[raw.equippedPartnerId as PartnerId].unlocked
      ? (raw.equippedPartnerId as PartnerId)
      : 'MOBILITY';
  return { partners, equippedPartnerId: equipped };
}
