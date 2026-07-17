import type { ExpeditionState, FloorState, PveEvent } from './PveTypes';
import { isRevealed, reveal } from './FogSystem';

export const INTERACTION_EXPOSE_TURNS = 2;
export const DUNE_SENTINEL_ATTACK_BONUS = 5;

export type ExposureSource = 'INTERACTION' | 'GOBLIN_SENTINEL' | 'DUNE_SENTINEL';

function uniqueIds(ids: readonly string[] | undefined, id: string): string[] {
  const list = ids ? [...ids] : [];
  if (!list.includes(id)) list.push(id);
  return list;
}

export function isPlayerExposed(floor: FloorState): boolean {
  return (floor.playerExposedTurns ?? 0) > 0
    || (floor.goblinSentinelAlertIds?.length ?? 0) > 0
    || (floor.duneSentinelAlertIds?.length ?? 0) > 0;
}

export function hasDuneSentinelAttackAura(floor: FloorState): boolean {
  return floor.monsters.some((m) => m.aiState !== 'DEAD' && m.variantId === 'DUNE_SENTINEL');
}

export function applyInteractionExposure(state: ExpeditionState, events: PveEvent[]): ExpeditionState {
  events.push({ type: 'PLAYER_EXPOSED', source: 'INTERACTION', turns: INTERACTION_EXPOSE_TURNS });
  return {
    ...state,
    floorState: {
      ...state.floorState,
      playerExposedTurns: INTERACTION_EXPOSE_TURNS,
    },
  };
}

export function applyMonsterAlert(
  state: ExpeditionState,
  monsterId: string,
  source: Extract<ExposureSource, 'GOBLIN_SENTINEL' | 'DUNE_SENTINEL'>,
  events: PveEvent[],
): ExpeditionState {
  const floor = state.floorState;
  const ids = source === 'GOBLIN_SENTINEL' ? floor.goblinSentinelAlertIds : floor.duneSentinelAlertIds;
  if ((ids ?? []).includes(monsterId)) return state;
  const monster = floor.monsters.find((m) => m.id === monsterId);
  let nextFloor = floor;
  if (monster && !isRevealed(floor.revealed, monster.pos)) {
    const revealResult = reveal(floor.revealed, monster.pos, 0);
    if (revealResult.cells.length > 0) {
      events.push({ type: 'REVEAL', cells: revealResult.cells });
      nextFloor = {
        ...nextFloor,
        revealed: revealResult.revealed,
      };
    }
  }
  events.push({ type: 'PLAYER_EXPOSED', source, monsterId, permanent: true });
  return {
    ...state,
    floorState: {
      ...nextFloor,
      goblinSentinelAlertIds: source === 'GOBLIN_SENTINEL'
        ? uniqueIds(nextFloor.goblinSentinelAlertIds, monsterId)
        : nextFloor.goblinSentinelAlertIds,
      duneSentinelAlertIds: source === 'DUNE_SENTINEL'
        ? uniqueIds(nextFloor.duneSentinelAlertIds, monsterId)
        : nextFloor.duneSentinelAlertIds,
    },
  };
}

export function clearMonsterAlert(state: ExpeditionState, monsterId: string, events: PveEvent[]): ExpeditionState {
  const floor = state.floorState;
  const nextGoblin = (floor.goblinSentinelAlertIds ?? []).filter((id) => id !== monsterId);
  const nextDune = (floor.duneSentinelAlertIds ?? []).filter((id) => id !== monsterId);
  const goblinChanged = nextGoblin.length !== (floor.goblinSentinelAlertIds?.length ?? 0);
  const duneChanged = nextDune.length !== (floor.duneSentinelAlertIds?.length ?? 0);
  if (!goblinChanged && !duneChanged) return state;
  if (goblinChanged && nextGoblin.length === 0) events.push({ type: 'PLAYER_EXPOSURE_ENDED', source: 'GOBLIN_SENTINEL' });
  if (duneChanged && nextDune.length === 0) events.push({ type: 'PLAYER_EXPOSURE_ENDED', source: 'DUNE_SENTINEL' });
  return {
    ...state,
    floorState: {
      ...floor,
      goblinSentinelAlertIds: nextGoblin.length > 0 ? nextGoblin : undefined,
      duneSentinelAlertIds: nextDune.length > 0 ? nextDune : undefined,
    },
  };
}

export function tickInteractionExposure(state: ExpeditionState, events: PveEvent[]): ExpeditionState {
  const turns = state.floorState.playerExposedTurns ?? 0;
  if (turns <= 0) return state;
  const nextTurns = turns - 1;
  if (nextTurns <= 0) {
    events.push({ type: 'PLAYER_EXPOSURE_ENDED', source: 'INTERACTION' });
  }
  return {
    ...state,
    floorState: {
      ...state.floorState,
      playerExposedTurns: nextTurns > 0 ? nextTurns : undefined,
    },
  };
}
