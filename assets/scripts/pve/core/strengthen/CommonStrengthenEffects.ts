import type { FloorState, Monster, RunPlayer } from '../PveTypes';

export function traitLayers(traits: readonly string[], id: string): number {
  let count = 0;
  for (const trait of traits) if (trait === id) count++;
  return count;
}

export function distinctGeneralTraitCount(traits: readonly string[]): number {
  return new Set(traits.filter((id) => id.startsWith('general_') || id.startsWith('strengthen_'))).size;
}

export function cappedGeneralTraitCount(traits: readonly string[]): number {
  const counts = new Map<string, number>();
  for (const id of traits) {
    if (!id.startsWith('general_') && !id.startsWith('strengthen_')) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let capped = 0;
  for (const count of counts.values()) if (count >= 3) capped++;
  return capped;
}

export function generalFlatAttackBonus(traits: readonly string[]): number {
  return traitLayers(traits, 'strengthen_attack_up') * 3
    + cappedGeneralTraitCount(traits) * (traits.includes('general_accumulation') ? 1 : 0);
}

export function generalDynamicMaxHpBonus(traits: readonly string[]): number {
  if (!traits.includes('general_polymath')) return 0;
  return Math.floor(distinctGeneralTraitCount(traits) / 3) * 10;
}

export function generalAnimaGainPct(traits: readonly string[]): number {
  return traitLayers(traits, 'general_anima_sense') * 0.1;
}

export function generalGoldGainPct(traits: readonly string[]): number {
  return traitLayers(traits, 'strengthen_gold_find') * 0.15;
}

export function generalChestGoldPct(traits: readonly string[]): number {
  return traitLayers(traits, 'general_chest_lore') * 0.15;
}

export interface GeneralAttackContext {
  player: RunPlayer;
  target: Monster;
  isFirstAttackThisFloor: boolean;
  setbackReady: boolean;
}

export function generalAttackBonusPct(ctx: GeneralAttackContext): number {
  const traits = ctx.player.classTraits;
  let pct = 0;
  if (ctx.isFirstAttackThisFloor && traits.includes('general_first_strike')) pct += 0.2;
  if (ctx.target.hp / ctx.target.maxHp <= 0.3 && traits.includes('general_steady_finish')) pct += 0.1;
  if (ctx.setbackReady && traits.includes('general_setback_counter')) pct += 0.15;
  return pct;
}

export function reduceGeneralIncomingDamage(player: RunPlayer, damage: number, floor?: FloorState): number {
  const traits = player.classTraits;
  let next = damage - traitLayers(traits, 'general_guard_training') * 2;
  if (player.hp / player.maxHp <= 0.35 && traits.includes('general_last_defense')) next *= 0.9;
  if (floor && traits.includes('general_cover_guard')) {
    const { x, y } = floor.player;
    const adjacentBlocker = floor.entities.some((entity) => !entity.consumed
      && (entity.type === 'ROCK' || entity.type === 'ICE_WALL' || entity.type === 'FREEZE_WALL')
      && Math.abs(entity.pos.x - x) + Math.abs(entity.pos.y - y) === 1);
    if (adjacentBlocker) next *= 0.85;
  }
  return Math.max(1, Math.round(next));
}

export function addHealingWithOverheal(
  player: RunPlayer,
  floor: FloorState,
  amount: number,
): { hp: number; anima: number; floorAnima: number } {
  const missing = Math.max(0, player.maxHp - player.hp);
  const effective = Math.min(missing, Math.max(0, amount));
  const overheal = Math.max(0, amount - effective);
  const current = floor.generalOverhealAnimaThisFloor ?? 0;
  const anima = player.classTraits.includes('general_overheal_anima')
    ? Math.min(20 - current, Math.floor(overheal * 0.5))
    : 0;
  return { hp: player.hp + effective, anima: Math.max(0, anima), floorAnima: current + Math.max(0, anima) };
}
