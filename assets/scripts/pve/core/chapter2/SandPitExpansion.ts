import type { Coord, ExpeditionState, FixedEntity } from '../PveTypes';

function occupiedCells(state: ExpeditionState): Set<string> {
  const blocked = new Set<string>();
  blocked.add(`${state.floorState.player.x},${state.floorState.player.y}`);
  for (const entity of state.floorState.entities) {
    if (!entity.consumed) blocked.add(`${entity.pos.x},${entity.pos.y}`);
  }
  for (const monster of state.floorState.monsters) {
    if (monster.hp > 0 && monster.aiState !== 'DEAD') {
      blocked.add(`${monster.pos.x},${monster.pos.y}`);
    }
  }
  return blocked;
}

export function expandSandPits(
  state: ExpeditionState,
  count: number,
  prefix = 'F13',
): ExpeditionState {
  if (count <= 0) return state;
  const blocked = occupiedCells(state);
  const candidates: Coord[] = [];
  for (let y = 0; y < state.floorState.size; y += 1) {
    for (let x = 0; x < state.floorState.size; x += 1) {
      const key = `${x},${y}`;
      if (!blocked.has(key)) candidates.push({ x, y });
    }
  }
  const existingPits = state.floorState.entities.filter((entity) => entity.type === 'SAND_PIT').length;
  const newPits: FixedEntity[] = [];
  for (let i = 0; i < count && candidates.length > 0; i += 1) {
    const idx = (existingPits + i) % candidates.length;
    const pos = candidates[idx]!;
    blocked.add(`${pos.x},${pos.y}`);
    newPits.push({
      id: `${prefix}_pit_dyn_${existingPits + i}`,
      type: 'SAND_PIT',
      pos: { ...pos },
      consumed: false,
    });
  }
  if (newPits.length === 0) return state;
  return {
    ...state,
    floorState: {
      ...state.floorState,
      entities: [...state.floorState.entities, ...newPits],
    },
  };
}
