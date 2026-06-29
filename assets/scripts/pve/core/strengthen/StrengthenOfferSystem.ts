import { createRng } from '../rng';
import type { StrengthenDef } from './StrengthenCatalog';

export interface StrengthenOfferInput {
  rngState: number;
  pool: readonly StrengthenDef[];
  owned: readonly string[];
  recentOffers?: readonly string[];
  count?: number;
}

export interface StrengthenOfferResult {
  choices: string[];
  nextRngState: number;
}

function ownedCount(owned: readonly string[], id: string): number {
  let count = 0;
  for (const entry of owned) if (entry === id) count++;
  return count;
}

function prerequisitesMet(def: StrengthenDef, owned: ReadonlySet<string>): boolean {
  if (def.requiresAny?.length && !def.requiresAny.some((id) => owned.has(id))) return false;
  if (def.requiresAll?.length && !def.requiresAll.every((id) => owned.has(id))) return false;
  return true;
}

function coreGateMet(def: StrengthenDef, pool: readonly StrengthenDef[], owned: ReadonlySet<string>): boolean {
  if (def.kind !== 'core') return true;
  let distinct = 0;
  for (const candidate of pool) {
    if ((candidate.kind === 'stable' || candidate.kind === 'condition') && owned.has(candidate.id)) distinct++;
  }
  return distinct >= 3;
}

function weightedTake<T extends { weight: number }>(items: T[], random: number): T {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return items[items.length - 1];
  let cursor = random * total;
  for (const item of items) {
    cursor -= Math.max(0, item.weight);
    if (cursor < 0) return item;
  }
  return items[items.length - 1];
}

function isSpecial(def: StrengthenDef): boolean {
  return def.kind === 'anomaly' || def.kind === 'core' || def.kind === 'route';
}

export function rollStrengthenOffers(input: StrengthenOfferInput): StrengthenOfferResult {
  const desired = input.count ?? 3;
  const ownedSet = new Set(input.owned);
  const eligible = input.pool.filter((def) =>
    ownedCount(input.owned, def.id) < def.stack
    && prerequisitesMet(def, ownedSet)
    && coreGateMet(def, input.pool, ownedSet),
  );

  const recent = new Set(input.recentOffers ?? []);
  const withoutRecent = eligible.filter((def) => !recent.has(def.id));
  const candidates = withoutRecent.length >= desired && eligible.length >= 6 ? withoutRecent : eligible;
  const rng = createRng(input.rngState);
  const selected: StrengthenDef[] = [];
  let specialSelected = false;

  const takeFrom = (source: StrengthenDef[]) => {
    const allowed = specialSelected ? source.filter((def) => !isSpecial(def)) : source;
    if (allowed.length === 0) return false;
    const picked = weightedTake(allowed, rng.next());
    selected.push(picked);
    if (isSpecial(picked)) specialSelected = true;
    const index = source.findIndex((def) => def.id === picked.id);
    if (index >= 0) source.splice(index, 1);
    return true;
  };

  const remaining = candidates.slice();
  const unowned = remaining.filter((def) => !ownedSet.has(def.id));
  if (unowned.length > 0) {
    const picked = weightedTake(unowned, rng.next());
    selected.push(picked);
    specialSelected = isSpecial(picked);
    const index = remaining.findIndex((def) => def.id === picked.id);
    if (index >= 0) remaining.splice(index, 1);
  }

  while (selected.length < desired && takeFrom(remaining)) {
    // Weighted draws consume one deterministic RNG value each.
  }

  return { choices: selected.map((def) => def.id), nextRngState: rng.state() };
}
