import type { MinghenLoadoutEntry } from '../PveProgressionTypes';
import { getMinghenDefinition } from './MinghenCatalog';
import type { MinghenTriggerMemory } from './MinghenEffects';

function equippedLevel(loadout: readonly MinghenLoadoutEntry[], id: string): number {
  return loadout.find((entry) => entry.id === id)?.level ?? 0;
}

/** M25: reduce extra move-cost terrain penalty by 1 (min extra 0). */
export function extraMoveCostTerrainPenaltyReduction(loadout: readonly MinghenLoadoutEntry[]): number {
  return equippedLevel(loadout, 'M25') >= 1 ? 1 : 0;
}

export function shouldWaiveExtraMoveCostTerrainStep(
  loadout: readonly MinghenLoadoutEntry[],
  memory: MinghenTriggerMemory,
  turn: number,
): boolean {
  if (equippedLevel(loadout, 'M25') < 2) return false;
  const key = `M25_SAND_FREE:${turn}`;
  return !memory.turnKeys.includes(key);
}

export function markExtraMoveCostTerrainStepWaived(memory: MinghenTriggerMemory, turn: number): void {
  const key = `M25_SAND_FREE:${turn}`;
  if (!memory.turnKeys.includes(key)) memory.turnKeys.push(key);
}

/** M26: environment damage multiplier (1 / 0.7 / 0.5). */
export function environmentDamageMultiplier(loadout: readonly MinghenLoadoutEntry[]): number {
  const level = equippedLevel(loadout, 'M26');
  if (level >= 2) return 0.5;
  if (level >= 1) return 0.7;
  return 1;
}

export function markEnvironmentDamageHit(
  memory: MinghenTriggerMemory,
  loadout: readonly MinghenLoadoutEntry[],
): void {
  if (equippedLevel(loadout, 'M26') >= 3) {
    memory.states = memory.states.filter((state) => state !== 'M26_READY');
    memory.states.push('M26_READY');
  }
}

/** @deprecated Prefer extraMoveCostTerrainPenaltyReduction */
export function sandPitPenaltyReduction(loadout: readonly MinghenLoadoutEntry[]): number {
  return extraMoveCostTerrainPenaltyReduction(loadout);
}

/** @deprecated Prefer shouldWaiveExtraMoveCostTerrainStep */
export function shouldWaiveSandPitStep(
  loadout: readonly MinghenLoadoutEntry[],
  memory: MinghenTriggerMemory,
  turn: number,
): boolean {
  return shouldWaiveExtraMoveCostTerrainStep(loadout, memory, turn);
}

/** @deprecated Prefer markExtraMoveCostTerrainStepWaived */
export function markSandPitStepWaived(memory: MinghenTriggerMemory, turn: number): void {
  markExtraMoveCostTerrainStepWaived(memory, turn);
}

/** @deprecated Prefer environmentDamageMultiplier */
export function sandstormDamageMultiplier(loadout: readonly MinghenLoadoutEntry[]): number {
  return environmentDamageMultiplier(loadout);
}

/** @deprecated Prefer markEnvironmentDamageHit */
export function markSandstormHit(
  memory: MinghenTriggerMemory,
  _turn: number,
  loadout: readonly MinghenLoadoutEntry[],
): void {
  markEnvironmentDamageHit(memory, loadout);
}

export function playerOnSandPit(
  entities: readonly { type: string; consumed?: boolean; pos: { x: number; y: number } }[],
  pos: { x: number; y: number },
): boolean {
  return entities.some((entity) => entity.type === 'SAND_PIT' && !entity.consumed
    && entity.pos.x === pos.x && entity.pos.y === pos.y);
}

export function playerOnExtraMoveCostTerrain(
  entities: readonly { type: string; consumed?: boolean; pos: { x: number; y: number } }[],
  pos: { x: number; y: number },
): boolean {
  return playerOnSandPit(entities, pos);
}

export function minghenLevelValue(loadout: readonly MinghenLoadoutEntry[], id: string, index: number): number {
  const entry = loadout.find((item) => item.id === id);
  if (!entry) return 0;
  return getMinghenDefinition(id).values[entry.level][index] ?? 0;
}
