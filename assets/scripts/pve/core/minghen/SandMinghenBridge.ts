import type { MinghenLoadoutEntry } from '../PveProgressionTypes';
import { getMinghenDefinition } from './MinghenCatalog';
import type { MinghenTriggerMemory } from './MinghenEffects';

function equippedLevel(loadout: readonly MinghenLoadoutEntry[], id: string): number {
  return loadout.find((entry) => entry.id === id)?.level ?? 0;
}

export function sandPitPenaltyReduction(loadout: readonly MinghenLoadoutEntry[]): number {
  const level = equippedLevel(loadout, 'M25');
  return level >= 1 ? 1 : 0;
}

export function shouldWaiveSandPitStep(
  loadout: readonly MinghenLoadoutEntry[],
  memory: MinghenTriggerMemory,
  turn: number,
): boolean {
  const level = equippedLevel(loadout, 'M25');
  if (level < 2) return false;
  const key = `M25_SAND_FREE:${turn}`;
  return !memory.turnKeys.includes(key);
}

export function markSandPitStepWaived(memory: MinghenTriggerMemory, turn: number): void {
  const key = `M25_SAND_FREE:${turn}`;
  if (!memory.turnKeys.includes(key)) memory.turnKeys.push(key);
}

export function sandstormDamageMultiplier(loadout: readonly MinghenLoadoutEntry[]): number {
  const level = equippedLevel(loadout, 'M26');
  if (level >= 2) return 0.5;
  if (level >= 1) return 0.7;
  return 1;
}

export function markSandstormHit(memory: MinghenTriggerMemory, turn: number, loadout: readonly MinghenLoadoutEntry[]): void {
  if (equippedLevel(loadout, 'M26') >= 3) {
    memory.states = memory.states.filter((state) => state !== 'M26_READY');
    memory.states.push('M26_READY');
  }
}

export function playerOnSandPit(
  entities: readonly { type: string; consumed?: boolean; pos: { x: number; y: number } }[],
  pos: { x: number; y: number },
): boolean {
  return entities.some((entity) => entity.type === 'SAND_PIT' && !entity.consumed
    && entity.pos.x === pos.x && entity.pos.y === pos.y);
}

export function minghenLevelValue(loadout: readonly MinghenLoadoutEntry[], id: string, index: number): number {
  const entry = loadout.find((item) => item.id === id);
  if (!entry) return 0;
  return getMinghenDefinition(id).values[entry.level][index] ?? 0;
}
