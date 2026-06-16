// 网格移动系统（design §4 AP / §5 地图 / AC-16 M2）：玩家按方向移动一格，消耗 AP，揭示周边迷雾。
// 纯函数：越界 / AP 不足 / 目标格被存活怪物占据 时拒绝移动 —— 原样返回 state，不产生事件（no-op）。
//
// M2 词条效果（AC-16）：
//   疾步(swift)   — ROGUE：移动消耗 AP 由 2 降为 1
//   背刺(backstab) — ROGUE：移动后将 floorState.backstabAvailable 置 true（下次攻击双倍）

import { revealAround } from './FogSystem';
import { AP_COST, CHAPTER2_SAND_PIT_MOVE_PENALTY, CHAPTER4_LAVA_TILE_DAMAGE, FOG_REVEAL_RADIUS, FROST_GIANT_SHATTERED_ICE_DAMAGE } from './PveConstants';
import { SHOES_FIRST_MOVE_THRESHOLD, SHOES_REVEAL_BONUS_THRESHOLD } from './EquipmentSystem';
import { relicOnMoveStep } from './RelicSystem';
import { bossSandImmune } from './BossEquipTraitEffects';
import type { ApplyResult, Coord, ExpeditionState, FloorState, PveEvent } from './PveTypes';

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

const DIRECTION_DELTA: Record<Direction, Coord> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

export function inBounds(size: number, pos: Coord): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < size && pos.y < size;
}

export function isBlockedByMonster(floor: FloorState, pos: Coord): boolean {
  return floor.monsters.some(
    (m) => m.aiState !== 'DEAD' && m.pos.x === pos.x && m.pos.y === pos.y,
  );
}

export function isBlockedByRock(floor: FloorState, pos: Coord): boolean {
  return floor.entities.some(
    (e) => e.type === 'ROCK' && !e.consumed && e.pos.x === pos.x && e.pos.y === pos.y,
  );
}

export function isBlockedByIceWall(floor: FloorState, pos: Coord): boolean {
  return floor.entities.some(
    (e) => (e.type === 'ICE_WALL' || e.type === 'FREEZE_WALL') && !e.consumed && e.pos.x === pos.x && e.pos.y === pos.y,
  );
}

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

/** 某格是否为未消耗的冰面（ICE_TILE）。 */
export function isIceTile(floor: FloorState, pos: Coord): boolean {
  return floor.entities.some(
    (e) => e.type === 'ICE_TILE' && !e.consumed && e.pos.x === pos.x && e.pos.y === pos.y,
  );
}

/**
 * 冰面滑行落点（第3章 FrostGiant 冰面，确定性、无 RNG）：
 * 玩家站在冰面上、朝 delta 方向移动时，沿方向连续滑行，停在「第一个非冰可走格」；
 * 撞墙/石块/冰墙/怪物/Boss 则停在障碍前最后一格。返回落点；若一格也走不动返回 null。
 */
export function slideDestination(floor: FloorState, from: Coord, delta: Coord): Coord | null {
  let cur = from;
  while (true) {
    const next: Coord = { x: cur.x + delta.x, y: cur.y + delta.y };
    if (!inBounds(floor.size, next)) break;
    if (isBlockedByMonster(floor, next)) break;
    if (isBlockedByRock(floor, next)) break;
    if (isBlockedByIceWall(floor, next)) break;
    cur = next;
    if (!isIceTile(floor, cur)) break; // 落在非冰格即停（第一个非冰可走格）
  }
  return cur.x === from.x && cur.y === from.y ? null : cur;
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

  // 冰霜巨人冻结（第3章）：MOVE 完全无效（no-op），需主动攻击解除。
  if (floor.playerFrozen) return noop(state);

  // 冰面滑行：玩家站在冰面上时，移动沿方向连续滑行到边缘（落点已保证可走）；
  // 否则普通走一格（从非冰格踏上冰面也只算普通一步，下回合站在冰上才会滑）。
  const onIce = isIceTile(floor, from);
  let to: Coord;
  if (onIce) {
    const dest = slideDestination(floor, from, DIRECTION_DELTA[dir]);
    if (dest === null) return noop(state);
    to = dest;
  } else {
    to = targetOf(from, dir);
    if (!inBounds(floor.size, to)) return noop(state);
  }

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
  // Boss 装备 trait: boss_sand_immune（流沙护腿）→ 沙坑 AP 惩罚归零
  const sandPitPenalty = sandPitEntity && !bossSandImmune(state.player.equipment) ? CHAPTER2_SAND_PIT_MOVE_PENALTY : 0;
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

  // 冰霜巨人碎冰（第3章）：踩入未消耗的 SHATTERED_ICE 立即消耗并造成固定伤害。
  const shatteredIce = floor.entities.find(
    (e) => e.type === 'SHATTERED_ICE' && !e.consumed && e.pos.x === to.x && e.pos.y === to.y,
  );
  const shatteredHp = shatteredIce ? Math.max(0, state.player.hp - FROST_GIANT_SHATTERED_ICE_DAMAGE) : state.player.hp;
  const shatteredDead = shatteredIce ? shatteredHp <= 0 : false;

  // 熔岩领主 LAVA_TILE（第4章）：踩入立即扣血，地块不消失（与 SHATTERED_ICE 不同）。
  const lavaTile = !shatteredDead
    ? floor.entities.find((e) => e.type === 'LAVA_TILE' && !e.consumed && e.pos.x === to.x && e.pos.y === to.y)
    : undefined;
  const lavaHp = lavaTile ? Math.max(0, shatteredHp - CHAPTER4_LAVA_TILE_DAMAGE) : shatteredHp;
  const lavaDead = lavaTile ? lavaHp <= 0 : shatteredDead;
  const finalHp = lavaHp;
  const finalDead = lavaDead;

  const nextAp = floor.ap - cost;
  const nextFloor: FloorState = {
    ...floor,
    player: to,
    ap: nextAp,
    revealed: revealedNext,
    status: finalDead ? ('DEAD' as const) : floor.status,
    entities: shatteredIce
      ? floor.entities.map((e) => (e.id === shatteredIce.id ? { ...e, consumed: true } : e))
      : floor.entities,
    // ROGUE 背刺 / 觉醒·影袭：移动后标记，playerAttack 命中时生效并消耗
    ...(traits.includes('backstab') || traits.includes('awakened_shadow_strike') ? { backstabAvailable: true } : {}),
    // RARE+ 靴子首步免费：本回合首步已用完
    ...(firstMoveFree ? { shoesFirstMoveDone: true } : {}),
    // 命运守卫行为镜像：累计本回合移动步数（endTurn 时供 recordPlayerActionForMirror 读取）
    playerStepsThisTurn: (floor.playerStepsThisTurn ?? 0) + 1,
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
  if (shatteredIce) {
    events.push({ type: 'PLAYER_DAMAGED', damage: FROST_GIANT_SHATTERED_ICE_DAMAGE, hp: shatteredHp, sourceId: shatteredIce.id });
    if (shatteredDead) events.push({ type: 'PLAYER_DEAD' });
  }
  if (lavaTile) {
    events.push({ type: 'LAVA_TILE_DAMAGED', entityId: lavaTile.id, damage: CHAPTER4_LAVA_TILE_DAMAGE });
    if (lavaDead) events.push({ type: 'PLAYER_DEAD' });
  }

  // 遗物：永冻之核 — 每移动 3 步标记下次普攻冰冻
  // 滑行整体仅算一步（沿用现有 AP 模型：滑行收 1 次移动费），与玩家直观一致。
  const relicMove = relicOnMoveStep(state.player);
  events.push(...relicMove.events);

  return {
    state: {
      ...state,
      status: finalDead ? ('DEAD' as const) : state.status,
      player: { ...relicMove.nextPlayer, hp: finalHp },
      floorState: nextFloor,
    },
    events,
  };
}
