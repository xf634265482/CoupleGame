import type { Coord, ExpeditionState } from '../PveTypes';

function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** 第 10 层哨卫全灭后：围猎怪仇恨半径收缩，非邻接怪退回 IDLE。 */
export function dissolveHuntPressure(
  state: ExpeditionState,
  options: { keepIds?: readonly string[] } = {},
): ExpeditionState {
  const keepIds = new Set(options.keepIds ?? []);
  const { player } = state.floorState;
  const monsters = state.floorState.monsters.map((monster) => {
    if (keepIds.has(monster.id)) return monster;
    if (monster.hp <= 0 || monster.aiState === 'DEAD') return monster;
    if (monster.variantId === 'DUNE_SENTINEL') return monster;
    const adjacent = manhattan(monster.pos, player) <= 1;
    return {
      ...monster,
      aggroRadius: 1,
      aiState: adjacent ? monster.aiState : 'IDLE' as const,
    };
  });
  return {
    ...state,
    floorState: {
      ...state.floorState,
      monsters,
      duneSentinelAlertIds: undefined,
    },
  };
}
