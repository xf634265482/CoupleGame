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

export function highestCraftableMinghenLevel(entry: Pick<MinghenCollectionEntry, 'copies' | 'trialCompleted'>): MinghenLevel {
  const copies = Math.max(0, Math.trunc(entry.copies));
  if (copies >= MINGHEN_COPY_REQUIREMENTS[3] && entry.trialCompleted) return 3;
  if (copies >= MINGHEN_COPY_REQUIREMENTS[2]) return 2;
  return 1;
}

export function addMinghenCopy(entry: MinghenCollectionEntry | undefined, id: string): MinghenCollectionEntry {
  getMinghenDefinition(id);
  const copies = (entry?.copies ?? 0) + 1;
  const next = { id, copies, trialCompleted: entry?.trialCompleted ?? false, level: 1 as MinghenLevel };
  next.level = highestCraftableMinghenLevel(next);
  return next;
}

export function completeMinghenTrial(entry: MinghenCollectionEntry): MinghenCollectionEntry {
  const next = { ...entry, trialCompleted: true };
  return { ...next, level: highestCraftableMinghenLevel(next) };
}
