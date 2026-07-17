import type { Coord, ExpeditionState, PveEvent } from '../PveTypes';
import type { MinghenLoadoutEntry } from '../PveProgressionTypes';
import type { Rng } from '../rng';
import { markSandstormHit, sandstormDamageMultiplier } from '../minghen/SandMinghenBridge';
import type { MinghenTriggerMemory } from '../minghen/MinghenEffects';

function randomDistinctCells(rng: Rng, size: number, count: number): Coord[] {
  const seen = new Set<string>();
  const result: Coord[] = [];
  const maxAttempts = count * 20;
  for (let i = 0; i < maxAttempts && result.length < count; i += 1) {
    const x = rng.int(0, size - 1);
    const y = rng.int(0, size - 1);
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ x, y });
  }
  return result;
}

export function applyLightSandstorm(
  state: ExpeditionState,
  rng: Rng,
  options: { cellCount: number; damage: number },
  minghen?: { loadout: readonly MinghenLoadoutEntry[]; memory: MinghenTriggerMemory },
): { state: ExpeditionState; events: PveEvent[]; memory?: MinghenTriggerMemory } {
  const floor = state.floorState;
  const sandstormCells = randomDistinctCells(rng, floor.size, options.cellCount);
  const events: PveEvent[] = [{ type: 'SANDSTORM_SPAWNED', tiles: sandstormCells }];
  let player = state.player;
  let status = state.status;
  let floorStatus = floor.status;
  const memory = minghen?.memory;
  const hitPlayer = sandstormCells.some((cell) => cell.x === floor.player.x && cell.y === floor.player.y);
  if (hitPlayer) {
    const mult = minghen ? sandstormDamageMultiplier(minghen.loadout) : 1;
    const damage = Math.max(0, Math.round(options.damage * mult));
    const hp = Math.max(0, player.hp - damage);
    player = { ...player, hp };
    events.push({ type: 'SANDSTORM_HIT', damage, hp });
    if (memory && minghen) markSandstormHit(memory, floor.turn, minghen.loadout);
    if (hp <= 0) {
      events.push({ type: 'PLAYER_DEAD' });
      status = 'DEAD';
      floorStatus = 'DEAD';
    }
  }
  return {
    state: {
      ...state,
      status,
      player,
      floorState: {
        ...floor,
        status: floorStatus,
        rngState: rng.state(),
      },
    },
    events,
    memory,
  };
}
