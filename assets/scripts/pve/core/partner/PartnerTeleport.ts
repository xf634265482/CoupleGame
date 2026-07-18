import { revealAround } from '../FogSystem';
import {
  CHAPTER4_LAVA_TILE_DAMAGE,
  FOG_REVEAL_RADIUS,
  FROST_GIANT_SHATTERED_ICE_DAMAGE,
} from '../PveConstants';
import {
  inBounds,
  isBlockedByIceWall,
  isBlockedByMonster,
  isBlockedByRock,
} from '../MovementSystem';
import type { Coord, ExpeditionState, FloorState, PveEvent } from '../PveTypes';

function chebyshev(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function isDangerousLanding(floor: FloorState, pos: Coord): boolean {
  const warning = floor.minghenFloorTags?.attackWarningCells
    ?? floor.minghenFloorTags?.objectiveZoneCells;
  if (warning?.some((c) => c.x === pos.x && c.y === pos.y)) return true;
  return floor.entities.some(
    (e) => !e.consumed
      && e.pos.x === pos.x
      && e.pos.y === pos.y
      && (e.type === 'SAND_PIT' || e.type === 'LAVA_TILE' || e.type === 'SHATTERED_ICE' || e.type === 'ICE_TILE'),
  );
}

export function canTeleportTo(floor: FloorState, to: Coord): boolean {
  if (!inBounds(floor.size, to)) return false;
  if (floor.player.x === to.x && floor.player.y === to.y) return false;
  if (isBlockedByMonster(floor, to)) return false;
  if (isBlockedByRock(floor, to)) return false;
  if (isBlockedByIceWall(floor, to)) return false;
  return true;
}

export function listTeleportCells(floor: FloorState, from: Coord, range: number): Coord[] {
  const cells: Coord[] = [];
  const r = Math.max(0, Math.trunc(range));
  for (let y = from.y - r; y <= from.y + r; y++) {
    for (let x = from.x - r; x <= from.x + r; x++) {
      const to = { x, y };
      if (chebyshev(from, to) < 1 || chebyshev(from, to) > r) continue;
      if (!canTeleportTo(floor, to)) continue;
      cells.push(to);
    }
  }
  return cells;
}

/**
 * 无路径瞬移：不耗 AP、不经中间格、不触发中间地形；落点进入效果由调用方/后续规则处理。
 * 此处仅更新坐标并揭示视野；落点危险地形伤害在 executor 觉醒护盾之外由 Movement 同类逻辑可选触发。
 */
export function applyTeleport(
  state: ExpeditionState,
  to: Coord,
): { ok: true; state: ExpeditionState; events: PveEvent[] } | { ok: false; reason: string } {
  const floor = state.floorState;
  const from = floor.player;
  if (!canTeleportTo(floor, to)) return { ok: false, reason: 'PARTNER_TELEPORT_INVALID' };

  const revealedNext = floor.revealed.map((row) => row.slice());
  const newlyRevealed = revealAround(revealedNext, to, FOG_REVEAL_RADIUS);

  // 落点进入效果：碎冰 / 熔岩（与移动一致，但不走中间格）
  let hp = state.player.hp;
  let entities = floor.entities;
  const shatteredIce = floor.entities.find(
    (e) => e.type === 'SHATTERED_ICE' && !e.consumed && e.pos.x === to.x && e.pos.y === to.y,
  );
  if (shatteredIce) {
    hp = Math.max(0, hp - FROST_GIANT_SHATTERED_ICE_DAMAGE);
    entities = entities.map((e) => (e.id === shatteredIce.id ? { ...e, consumed: true } : e));
  }
  const lavaTile = floor.entities.find(
    (e) => e.type === 'LAVA_TILE' && !e.consumed && e.pos.x === to.x && e.pos.y === to.y,
  );
  if (lavaTile) hp = Math.max(0, hp - CHAPTER4_LAVA_TILE_DAMAGE);

  const events: PveEvent[] = [{ type: 'PLAYER_TELEPORT', from, to }];
  if (newlyRevealed.length > 0) events.push({ type: 'REVEAL', cells: newlyRevealed });

  const nextFloor: FloorState = {
    ...floor,
    player: to,
    revealed: revealedNext,
    entities,
    status: hp <= 0 ? 'DEAD' : floor.status,
  };
  return {
    ok: true,
    state: {
      ...state,
      player: { ...state.player, hp },
      floorState: nextFloor,
      status: hp <= 0 ? 'DEAD' : state.status,
    },
    events,
  };
}
