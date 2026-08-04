import type { MinghenCollectionEntry, MinghenLevel, MinghenLoadoutEntry } from '../PveProgressionTypes';
import { getMinghenDefinition } from './MinghenCatalog';

export const MINGHEN_SLOT_LIMIT = 8 as const;
export const MINGHEN_COPY_REQUIREMENTS: Record<MinghenLevel, number> = { 1: 1, 2: 2, 3: 4 };

export function validateMinghenLoadout(entries: readonly MinghenLoadoutEntry[], collection: Record<string, MinghenCollectionEntry>): MinghenLoadoutEntry[] {
  if (entries.length > MINGHEN_SLOT_LIMIT) throw new Error('MINGHEN_SLOT_LIMIT_EXCEEDED');
  const ids = new Set<string>();
  return entries.map((entry) => {
    getMinghenDefinition(entry.id);
    if (ids.has(entry.id)) throw new Error('DUPLICATE_MINGHEN_SLOT');
    ids.add(entry.id);
    const owned = collection[entry.id];
    if (!owned || owned.level < entry.level) throw new Error('MINGHEN_NOT_OWNED_AT_LEVEL');
    if (entry.level === 3 && !owned.trialCompleted) throw new Error('MINGHEN_TRIAL_REQUIRED');
    return { ...entry };
  });
}

/** Preview only: material/trial ceilings. Does not mutate granted level. */
export function highestCraftableMinghenLevel(entry: Pick<MinghenCollectionEntry, 'copies' | 'trialCompleted' | 'level'>): MinghenLevel {
  const copies = Math.max(0, Math.trunc(entry.copies));
  if (copies >= MINGHEN_COPY_REQUIREMENTS[3] && entry.trialCompleted) return 3;
  if (entry.level >= 2) return entry.level >= 3 ? 3 : 2;
  if (copies >= MINGHEN_COPY_REQUIREMENTS[2]) return 2;
  return 1;
}

export function addMinghenCopy(entry: MinghenCollectionEntry | undefined, id: string): MinghenCollectionEntry {
  getMinghenDefinition(id);
  const copies = (entry?.copies ?? 0) + 1;
  return {
    id,
    copies,
    trialCompleted: entry?.trialCompleted ?? false,
    level: entry?.level ?? 1,
  };
}

export function completeMinghenTrial(entry: MinghenCollectionEntry): MinghenCollectionEntry {
  if (entry.copies < MINGHEN_COPY_REQUIREMENTS[3]) {
    throw new Error('MINGHEN_TRIAL_COPIES_REQUIRED');
  }
  return { ...entry, trialCompleted: true, level: 3 };
}

export function canSynthesizeMinghenToII(
  profile: { minghenCollection: Record<string, MinghenCollectionEntry>; minghenLoadout: readonly { id: string }[] },
  id: string,
): boolean {
  const owned = profile.minghenCollection[id];
  if (!owned) return false;
  if (owned.level !== 1) return false;
  if (owned.copies < MINGHEN_COPY_REQUIREMENTS[2]) return false;
  if (profile.minghenLoadout.some((x) => x.id === id)) return false;
  return true;
}

export function synthesizeMinghenToII<T extends {
  minghenCollection: Record<string, MinghenCollectionEntry>;
  minghenLoadout: readonly { id: string }[];
}>(profile: T, id: string): T {
  const fail = (code: string, message: string): never => {
    const err = new Error(message) as Error & { code: string };
    err.code = code;
    throw err;
  };
  getMinghenDefinition(id);
  const owned = profile.minghenCollection[id];
  if (!owned) fail('PVE_MINGHEN_NOT_OWNED', '未持有该命痕');
  if (profile.minghenLoadout.some((x) => x.id === id)) fail('PVE_MINGHEN_EQUIPPED', '已装配命痕不能用于合成');
  if (owned.level !== 1) fail('PVE_MINGHEN_ALREADY_II', '已是II级或更高');
  if (owned.copies < MINGHEN_COPY_REQUIREMENTS[2]) fail('PVE_MINGHEN_COPIES_SHORT', '副本不足，需要至少2枚');
  return {
    ...profile,
    minghenCollection: {
      ...profile.minghenCollection,
      [id]: { ...owned, level: 2 },
    },
  };
}
