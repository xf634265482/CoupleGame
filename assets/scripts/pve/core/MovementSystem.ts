// 网格移动系统（design §4 AP / §5 地图 / AC-16 M2）：玩家按方向移动一格，消耗 AP，揭示周边迷雾。
// 纯函数：越界 / AP 不足 / 目标格被存活怪物占据 时拒绝移动 —— 原样返回 state，不产生事件（no-op）。
//
// M2 词条效果（AC-16）：
//   疾步(swift)   — ROGUE：移动消耗 AP 由 2 降为 1
//   背刺(backstab) — ROGUE：移动后将 floorState.backstabAvailable 置 true（下次攻击双倍）

import { revealAround } from './FogSystem';
import { AP_COST, CHAPTER2_SAND_PIT_MOVE_PENALTY, FOG_REVEAL_RADIUS } from './PveConstants';
import { SHOES_FIRST_MOVE_THRESHOLD, SHOES_REVEAL_BONUS_THRESHOLD } from './EquipmentSystem';
import type { ApplyResult, Coord, ExpeditionState, FloorState, PveEvent } from './PveTypes';

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

const DIRECTION_DELTA: Record<Direction, Coord> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

function inBounds(size: number, pos: Coord): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < size && pos.y < size;
}

function isBlockedByMonster(floor: FloorState, pos: Coord): boolean {
  return floor.monsters.some(
    (m) => m.aiState !== 'DEAD' && m.pos.x === pos.x && m.pos.y === pos.y,
  );
}

function isBlockedByRock(floor: FloorState, pos: Coord): boolean {
  return floor.entities.some(
    (e) => e.type === 'ROCK' && !e.consumed && e.pos.x === pos.x && e.pos.y === pos.y,
  );
}

function isBlockedByIceWall(floor: FloorState, pos: Coord): boolean {
  return floor.entities.some(
    (e) => e.type === 'ICE_WALL' && !e.consumed && e.pos.x === pos.x && e.pos.y === pos.y,
  );
}

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

/** 计算方向 dir 对应的目标格坐标（不做越界裁剪）。 */
export function targetOf(from: Coord, dir: Direction): Coord {
  const delta = DIRECTION_DELTA[dir];
  return { x: from.x + delta.x, y: from.y + delta.y };
}

/**
 * 玩家向 dir 方向移动一格：
 * - 校验目标格在地图内、AP 足够、目标格未被存活怪物占据，否则原样返回（no-op，不消耗 AP）。
 * - 成功则更新玩家位置、扣减 AP（swift 词条时为 1，否则 AP_COST.MOVE=2）、揭示新视野，
 *   产生 MOVE 事件（及有新揭示格时的 REVEAL 事件）。
 * - backstab 词条：移动成功后将 floorState.backstabAvailable 置 true。
 */
export function applyMove(state: ExpeditionState, dir: Direction): ApplyResult {
  const floor = state.floorState;
  const from = floor.player;
  const to = targetOf(from, dir);

  if (!inBounds(floor.size, to)) return noop(state);

  const traits = state.player.classTraits;
  const shoes = state.player.equipment.SHOES;
  const shoesBaseStat = shoes?.baseStat ?? 0;

  // RARE+(baseStat≥3)：每回合首次移动免费（0 AP）
  const firstMoveFree = shoesBaseStat >= SHOES_FIRST_MOVE_THRESHOLD && !(floor.shoesFirstMoveDone ?? false);
  const shoesReduction = shoesBaseStat;
  const baseCost = traits.includes('swift') ? 1 : AP_COST.MOVE; // ROGUE 疾步优先
  // 冰霜/AOE 减速：移动AP+1（>0时叠加）
  const slowPenalty = (floor.playerMoveApPenaltyRounds ?? 0) > 0 ? 1 : 0;
  // 第2章 Boss 房沙坑：踩入格是沙坑时移动 AP+CHAPTER2_SAND_PIT_MOVE_PENALTY（首步免费时不收）
  const sandPitEntity = floor.entities.find(
    (e) => e.type === 'SAND_PIT' && !e.consumed && e.pos.x === to.x && e.pos.y === to.y,
  );
  const sandPitPenalty = sandPitEntity ? CHAPTER2_SAND_PIT_MOVE_PENALTY : 0;
  const cost = firstMoveFree
    ? 0
    : Math.max(1, baseCost + slowPenalty + sandPitPenalty - shoesReduction); // SHOES 减免，最低 1 AP

  if (floor.ap < cost) return noop(state);
  if (isBlockedByMonster(floor, to)) return noop(state);
  if (isBlockedByRock(floor, to)) return noop(state);
  if (isBlockedByIceWall(floor, to)) return noop(state);

  // FINE+(baseStat≥2)：揭示半径 +1
  const revealRadius = FOG_REVEAL_RADIUS + (shoesBaseStat >= SHOES_REVEAL_BONUS_THRESHOLD ? 1 : 0);
  const revealedNext = floor.revealed.map((row) => row.slice());
  const newlyRevealed = revealAround(revealedNext, to, revealRadius);

  const nextAp = floor.ap - cost;
  const nextFloor: FloorState = {
    ...floor,
    player: to,
    ap: nextAp,
    revealed: revealedNext,
    // ROGUE 背刺 / 觉醒·影袭：移动后标记，playerAttack 命中时生效并消耗
    ...(traits.includes('backstab') || traits.includes('awakened_shadow_strike') ? { backstabAvailable: true } : {}),
    // RARE+ 靴子首步免费：本回合首步已用完
    ...(firstMoveFree ? { shoesFirstMoveDone: true } : {}),
  };

  const events: PveEvent[] = [
    { type: 'MOVE', entityId: 'PLAYER', from, to, apLeft: nextAp },
  ];
  if (newlyRevealed.length > 0) {
    events.push({ type: 'REVEAL', cells: newlyRevealed });
  }
  if (sandPitEntity) {
    events.push({ type: 'SAND_PIT_STEPPED', entityId: sandPitEntity.id });
  }

  return {
    state: { ...state, floorState: nextFloor },
    events,
  };
}
