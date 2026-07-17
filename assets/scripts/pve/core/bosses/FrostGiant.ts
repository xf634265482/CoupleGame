// 冰霜巨人专属机制（design §11b / 第 3 章 Boss，第 15 层）：
// - 每 FROST_GIANT_FREEZE_INTERVAL 个怪物回合的近战命中后，以玩家为中心铺一片冰面（ICE_TILE）。
//   玩家站在冰面上移动时会「滑行」（MovementSystem 处理），打断风筝。（2026-06-14）
//
// 2026-06-15 反风筝重做（叠加于上述冰面机制之上）：
// - 寒气→冻结循环：普通攻击命中玩家叠加 1 层寒气（CHILL_STACK_APPLIED），叠满
//   FROST_GIANT_CHILL_STACKS_TO_FREEZE 层时归零并冻结玩家（PLAYER_FROZEN，MOVE 完全无效），
//   同时在玩家周围生成 FREEZE_WALL；玩家主动攻击 FROST_GIANT_FREEZE_ATTACKS_TO_BREAK 次解除
//   （PLAYER_UNFROZEN，FREEZE_WALL 一并移除，consumeFreezeAttack 在 CombatSystem 中处理）。
// - 冰霜重击：每 FROST_GIANT_HEAVY_STRIKE_INTERVAL 个怪物回合（非狂暴），替换本回合普攻——
//   以 boss 自身为中心 AOE（半径 FROST_GIANT_HEAVY_STRIKE_RADIUS），击碎范围内 ICE_WALL/FREEZE_WALL
//   （生成 SHATTERED_ICE，shatterWall 共用逻辑），命中玩家则造成 boss.attack 伤害并击退
//   （落点为冰面则沿方向滑行到边缘 + 额外 FROST_GIANT_ICE_SLIDE_DAMAGE 伤害）。释放后追击 1 步。
// - 狂暴（HP 占比 ≤ FROST_GIANT_ENRAGE_HP_RATIO）：冰霜重击循环替换为「预警→冲锋」循环：
//   turn%3==0 时仅预警（CHARGE_TELEGRAPHED，本回合不攻击不移动），下回合沿预警方向冲锋
//   （CHARGE_EXECUTED）——命中路径三格宽车道内的 ICE_WALL/FREEZE_WALL 则击碎并停止；命中玩家则
//   造成 boss.attack × FROST_GIANT_CHARGE_DAMAGE_MULT 伤害并停止；均未命中则冲到路径终点，
//   在随机空格生成一个新 ICE_WALL（消耗 RNG，AC-13）。

import { monsterAttack } from '../CombatSystem';
import {
  inBounds,
  isBlockedByIceWall,
  isBlockedByMonster,
  isBlockedByRock,
  isIceTile,
  slideDestination,
} from '../MovementSystem';
import { createRng } from '../rng';
import {
  CHAPTER3_ICE_WALL_HP,
  FROST_GIANT_CHARGE_DAMAGE_MULT,
  FROST_GIANT_CHILL_STACKS_TO_FREEZE,
  FROST_GIANT_ENRAGE_HP_RATIO,
  FROST_GIANT_FREEZE_ATTACKS_TO_BREAK,
  FROST_GIANT_FREEZE_INTERVAL,
  FROST_GIANT_FREEZE_WALL_COUNT,
  FROST_GIANT_HEAVY_STRIKE_INTERVAL,
  FROST_GIANT_HEAVY_STRIKE_RADIUS,
  FROST_GIANT_ICE_DURATION,
  FROST_GIANT_ICE_RADIUS,
  FROST_GIANT_ICE_SLIDE_DAMAGE,
  FROST_GIANT_KNOCKBACK_DISTANCE,
  FROST_GIANT_SHATTERED_ICE_DURATION,
} from '../PveConstants';
import type { ApplyResult, Coord, ExpeditionState, FixedEntity, FloorState, Monster, PveEvent } from '../PveTypes';

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function withMonsterPatch(state: ExpeditionState, id: string, patch: Partial<Monster>): ExpeditionState {
  return {
    ...state,
    floorState: {
      ...state.floorState,
      monsters: state.floorState.monsters.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    },
  };
}

function isOccupied(floor: FloorState, pos: Coord, excludeId: string): boolean {
  if (floor.player.x === pos.x && floor.player.y === pos.y) return true;
  if (floor.entities.some((e) => e.type === 'ROCK' && !e.consumed && e.pos.x === pos.x && e.pos.y === pos.y)) {
    return true;
  }
  return floor.monsters.some(
    (m) => m.id !== excludeId && m.aiState !== 'DEAD' && m.pos.x === pos.x && m.pos.y === pos.y,
  );
}

/** 朝目标贪心移动一格的候选格（按距离差更大的轴优先），用于在受阻时退而求其次换轴。 */
function stepToward(from: Coord, to: Coord): Coord[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const stepX = dx === 0 ? 0 : Math.sign(dx);
  const stepY = dy === 0 ? 0 : Math.sign(dy);
  const xMove: Coord = { x: from.x + stepX, y: from.y };
  const yMove: Coord = { x: from.x, y: from.y + stepY };

  const candidates: Coord[] = [];
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (stepX !== 0) candidates.push(xMove);
    if (stepY !== 0) candidates.push(yMove);
  } else {
    if (stepY !== 0) candidates.push(yMove);
    if (stepX !== 0) candidates.push(xMove);
  }
  return candidates;
}

/** 是否是冰面生成回合（每 FROST_GIANT_FREEZE_INTERVAL 个怪物回合）。 */
export function isFreezeAttackTurn(turn: number): boolean {
  return turn > 0 && turn % FROST_GIANT_FREEZE_INTERVAL === 0;
}

/** 是否是冰霜重击 / 狂暴冲锋循环回合（每 FROST_GIANT_HEAVY_STRIKE_INTERVAL 个怪物回合）。 */
export function isFrostCycleTurn(turn: number): boolean {
  return turn > 0 && turn % FROST_GIANT_HEAVY_STRIKE_INTERVAL === 0;
}

/**
 * 以玩家为中心、曼哈顿距离 ≤ FROST_GIANT_ICE_RADIUS 内可铺冰的格子（「+」字范围）。
 * 跳过越界、已被未消耗实体（含已有冰面/石块/冰墙/沙坑）或存活怪物占据的格子。
 * 玩家所在格不被跳过 —— 正是要让玩家下回合站在冰上才会滑行。
 */
function iceCells(floor: FloorState): Coord[] {
  const center = floor.player;
  const blocked = new Set<string>();
  for (const e of floor.entities) {
    if (!e.consumed) blocked.add(`${e.pos.x},${e.pos.y}`);
  }
  for (const m of floor.monsters) {
    if (m.aiState !== 'DEAD') blocked.add(`${m.pos.x},${m.pos.y}`);
  }
  const cells: Coord[] = [];
  for (let dy = -FROST_GIANT_ICE_RADIUS; dy <= FROST_GIANT_ICE_RADIUS; dy++) {
    for (let dx = -FROST_GIANT_ICE_RADIUS; dx <= FROST_GIANT_ICE_RADIUS; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > FROST_GIANT_ICE_RADIUS) continue;
      const x = center.x + dx;
      const y = center.y + dy;
      if (x < 0 || y < 0 || x >= floor.size || y >= floor.size) continue;
      if (blocked.has(`${x},${y}`)) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

/** center 周围（8 方向）未被玩家/存活怪物/未消耗实体占据的空格，用于 FREEZE_WALL 放置。 */
function adjacentFreeCells(floor: FloorState, center: Coord, count: number): Coord[] {
  const dirs: Coord[] = [
    { x: center.x + 1, y: center.y },
    { x: center.x - 1, y: center.y },
    { x: center.x, y: center.y + 1 },
    { x: center.x, y: center.y - 1 },
    { x: center.x + 1, y: center.y + 1 },
    { x: center.x - 1, y: center.y - 1 },
    { x: center.x + 1, y: center.y - 1 },
    { x: center.x - 1, y: center.y + 1 },
  ];
  const result: Coord[] = [];
  for (const d of dirs) {
    if (result.length >= count) break;
    if (!inBounds(floor.size, d)) continue;
    if (d.x === floor.player.x && d.y === floor.player.y) continue;
    if (floor.monsters.some((m) => m.aiState !== 'DEAD' && m.pos.x === d.x && m.pos.y === d.y)) continue;
    if (floor.entities.some((e) => !e.consumed && e.pos.x === d.x && e.pos.y === d.y)) continue;
    result.push(d);
  }
  return result;
}

/**
 * center 四周「+」字（曼哈顿=1）未被玩家/存活怪物/未消耗实体占据的格子，用于 SHATTERED_ICE 放置。
 */
function plusCells(floor: FloorState, center: Coord): Coord[] {
  const dirs: Coord[] = [
    { x: center.x + 1, y: center.y },
    { x: center.x - 1, y: center.y },
    { x: center.x, y: center.y + 1 },
    { x: center.x, y: center.y - 1 },
  ];
  const result: Coord[] = [];
  for (const d of dirs) {
    if (!inBounds(floor.size, d)) continue;
    if (d.x === floor.player.x && d.y === floor.player.y) continue;
    if (floor.monsters.some((m) => m.aiState !== 'DEAD' && m.pos.x === d.x && m.pos.y === d.y)) continue;
    if (floor.entities.some((e) => !e.consumed && e.pos.x === d.x && e.pos.y === d.y)) continue;
    result.push(d);
  }
  return result;
}

/** 地图上所有未被玩家/存活怪物/未消耗实体占据的格子，用于狂暴冲锋未命中时随机生成 ICE_WALL。 */
function allEmptyCells(floor: FloorState): Coord[] {
  const occupied = new Set<string>();
  occupied.add(`${floor.player.x},${floor.player.y}`);
  for (const m of floor.monsters) {
    if (m.aiState !== 'DEAD') occupied.add(`${m.pos.x},${m.pos.y}`);
  }
  for (const e of floor.entities) {
    if (!e.consumed) occupied.add(`${e.pos.x},${e.pos.y}`);
  }
  const result: Coord[] = [];
  for (let y = 0; y < floor.size; y++) {
    for (let x = 0; x < floor.size; x++) {
      if (!occupied.has(`${x},${y}`)) result.push({ x, y });
    }
  }
  return result;
}

/**
 * 共享「击碎冰墙/冻结墙 → 生成碎冰」逻辑（冰霜重击 / 狂暴冲锋共用）：
 * 标记目标实体 consumed=true，在其四周「+」字范围生成 SHATTERED_ICE（remaining 倒计时）。
 */
function shatterWall(floor: FloorState, wallId: string): { entities: FixedEntity[]; cells: Coord[] } {
  const wall = floor.entities.find((e) => e.id === wallId);
  if (!wall) return { entities: floor.entities, cells: [] };

  const cells = plusCells(floor, wall.pos);
  let seq = floor.entities.length;
  const shattered: FixedEntity[] = cells.map((pos) => ({
    id: `shattered_ice_${floor.floor}_${floor.turn}_${seq++}`,
    type: 'SHATTERED_ICE',
    pos,
    consumed: false,
    remaining: FROST_GIANT_SHATTERED_ICE_DURATION,
  }));

  const entities = floor.entities.map((e) => (e.id === wallId ? { ...e, consumed: true } : e));
  return { entities: [...entities, ...shattered], cells };
}

/**
 * 寒气叠层（命中玩家后调用）：叠满 FROST_GIANT_CHILL_STACKS_TO_FREEZE 层时归零并冻结玩家——
 * MOVE 完全无效，需主动攻击 FROST_GIANT_FREEZE_ATTACKS_TO_BREAK 次解除；同时在玩家周围生成
 * FROST_GIANT_FREEZE_WALL_COUNT 个 FREEZE_WALL（一并随解除移除）。
 */
function applyChillStack(state: ExpeditionState): ApplyResult {
  const floor = state.floorState;
  const stacks = (floor.playerChillStacks ?? 0) + 1;

  if (stacks < FROST_GIANT_CHILL_STACKS_TO_FREEZE) {
    return {
      state: { ...state, floorState: { ...floor, playerChillStacks: stacks } },
      events: [{ type: 'CHILL_STACK_APPLIED', stacks }],
    };
  }

  const wallCells = adjacentFreeCells(floor, floor.player, FROST_GIANT_FREEZE_WALL_COUNT);
  let seq = floor.entities.length;
  const wallEntities: FixedEntity[] = wallCells.map((pos) => ({
    id: `freeze_wall_${floor.floor}_${floor.turn}_${seq++}`,
    type: 'FREEZE_WALL',
    pos,
    consumed: false,
  }));

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        playerChillStacks: 0,
        playerFrozen: true,
        playerFreezeAttacksRemaining: FROST_GIANT_FREEZE_ATTACKS_TO_BREAK,
        entities: [...floor.entities, ...wallEntities],
      },
    },
    events: [
      { type: 'CHILL_STACK_APPLIED', stacks: 0 },
      { type: 'PLAYER_FROZEN', wallEntityIds: wallEntities.map((e) => e.id) },
    ],
  };
}

/**
 * 冰霜巨人行动（普通近战回合）：
 * - 普通近战攻击（monsterAttack）；命中玩家时叠加寒气（applyChillStack）。
 * - 若本回合是冰面生成回合且未致死：以玩家为中心铺 ICE_TILE（remaining=FROST_GIANT_ICE_DURATION）。
 *   仅在 boss 进入近战范围实际攻击的回合调用（MonsterAI 在 dist≤range 时才派发本函数），
 *   故冰面总是出现在 boss 贴脸处、玩家脚下。
 */
export function frostGiantAttack(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'FROST_GIANT',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  // 普通攻击
  let result = monsterAttack(state, bossId);
  if (result.state.status === 'DEAD') return result;

  // 寒气叠层：命中玩家时 +1 层，叠满触发冻结
  const hit = result.events.some((e) => e.type === 'PLAYER_DAMAGED');
  if (hit) {
    const chillResult = applyChillStack(result.state);
    result = { state: chillResult.state, events: [...result.events, ...chillResult.events] };
    if (result.state.status === 'DEAD') return result;
  }

  // 冰面回合：以玩家为中心铺冰
  if (isFreezeAttackTurn(floor.turn)) {
    const af = result.state.floorState;
    const cells = iceCells(af);
    if (cells.length === 0) return result;

    let seq = af.entities.length;
    const newEntities: FixedEntity[] = cells.map((pos) => ({
      id: `ice_${af.floor}_${af.turn}_${seq++}`,
      type: 'ICE_TILE',
      pos,
      consumed: false,
      remaining: FROST_GIANT_ICE_DURATION,
    }));

    const iceEvent: PveEvent = {
      type: 'ICE_TIDE_SPAWNED',
      tiles: cells,
      duration: FROST_GIANT_ICE_DURATION,
    };

    return {
      state: { ...result.state, floorState: { ...af, entities: [...af.entities, ...newEntities] } },
      events: [...result.events, iceEvent],
    };
  }

  return result;
}

/**
 * 冰霜重击命中后的击退：沿 boss→玩家方向击退 FROST_GIANT_KNOCKBACK_DISTANCE 格。
 * 落点越界/被怪物/石块/冰墙(含冻结墙)阻挡 → 击退失败（玩家停留原地，不 emit）。
 * 落点为冰面 → 沿方向滑行到边缘，并额外造成 FROST_GIANT_ICE_SLIDE_DAMAGE 固定伤害。
 */
function applyKnockback(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find((m) => m.id === bossId);
  if (!boss) return noop(state);

  const from = floor.player;
  const dx = Math.sign(from.x - boss.pos.x);
  const dy = Math.sign(from.y - boss.pos.y);
  if (dx === 0 && dy === 0) return noop(state);

  const dest: Coord = { x: from.x + dx * FROST_GIANT_KNOCKBACK_DISTANCE, y: from.y + dy * FROST_GIANT_KNOCKBACK_DISTANCE };
  if (!inBounds(floor.size, dest)) return noop(state);
  if (isBlockedByMonster(floor, dest)) return noop(state);
  if (isBlockedByRock(floor, dest)) return noop(state);
  if (isBlockedByIceWall(floor, dest)) return noop(state);

  if (isIceTile(floor, dest)) {
    const floorWithPlayerAtDest: FloorState = { ...floor, player: dest };
    const slideEnd = slideDestination(floorWithPlayerAtDest, dest, { x: dx, y: dy }) ?? dest;

    const damage = FROST_GIANT_ICE_SLIDE_DAMAGE;
    const hp = Math.max(0, state.player.hp - damage);
    const dead = hp <= 0;
    const finalHp = hp;

    const events: PveEvent[] = [
      { type: 'KNOCKBACK', entityId: 'PLAYER', from, to: slideEnd, slid: true },
      { type: 'PLAYER_DAMAGED', damage, hp: finalHp, sourceId: bossId },
    ];
    if (dead) events.push({ type: 'PLAYER_DEAD' });

    return {
      state: {
        ...state,
        status: dead ? ('DEAD' as const) : state.status,
        player: { ...state.player, hp: finalHp },
        floorState: {
          ...floor,
          player: slideEnd,
          status: dead ? ('DEAD' as const) : floor.status,
        },
      },
      events,
    };
  }

  return {
    state: { ...state, floorState: { ...floor, player: dest } },
    events: [{ type: 'KNOCKBACK', entityId: 'PLAYER', from, to: dest, slid: false }],
  };
}

/**
 * 冰霜重击：以 boss 自身为中心、曼哈顿半径 FROST_GIANT_HEAVY_STRIKE_RADIUS 的 AOE。
 * - 范围内所有未消耗的 ICE_WALL/FREEZE_WALL 击碎（shatterWall，生成 SHATTERED_ICE）。
 * - 范围内含玩家：造成 boss.attack 伤害（不计护甲，与 GoblinChief 重击一致），存活则击退。
 */
function frostGiantHeavyStrike(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find((m) => m.id === bossId);
  if (!boss) return noop(state);

  const center = boss.pos;
  const events: PveEvent[] = [];
  let entities = floor.entities;

  for (const wall of floor.entities) {
    if ((wall.type !== 'ICE_WALL' && wall.type !== 'FREEZE_WALL') || wall.consumed) continue;
    if (manhattan(wall.pos, center) > FROST_GIANT_HEAVY_STRIKE_RADIUS) continue;
    const result = shatterWall({ ...floor, entities }, wall.id);
    entities = result.entities;
    events.push({ type: 'ICE_WALL_SHATTERED', entityId: wall.id, shatteredCells: result.cells });
  }

  events.push({ type: 'FROST_HEAVY_STRIKE_RESOLVED', bossId, center, radius: FROST_GIANT_HEAVY_STRIKE_RADIUS });

  let current: ExpeditionState = { ...state, floorState: { ...floor, entities } };

  if (manhattan(center, floor.player) <= FROST_GIANT_HEAVY_STRIKE_RADIUS) {
    const damage = boss.attack;
    const hp = Math.max(0, current.player.hp - damage);
    const dead = hp <= 0;
    const finalHp = hp;

    events.push({ type: 'PLAYER_DAMAGED', damage, hp: finalHp, sourceId: bossId });
    if (dead) events.push({ type: 'PLAYER_DEAD' });

    current = {
      ...current,
      status: dead ? ('DEAD' as const) : current.status,
      player: { ...current.player, hp: finalHp },
      floorState: {
        ...current.floorState,
        status: dead ? ('DEAD' as const) : current.floorState.status,
      },
    };

    if (!dead) {
      const kb = applyKnockback(current, bossId);
      current = kb.state;
      events.push(...kb.events);
    }
  }

  return { state: current, events };
}

/**
 * 冰霜重击 + 追击：释放冰霜重击（替换本回合普攻），未致死时再朝玩家移动 1 步（贪心，受阻则停留）。
 */
function frostGiantHeavyStrikeAndChase(state: ExpeditionState, bossId: string): ApplyResult {
  let current = withMonsterPatch(state, bossId, { aiState: 'CHASE' });
  const strike = frostGiantHeavyStrike(current, bossId);
  current = strike.state;
  const events = [...strike.events];

  if (current.status === 'DEAD') return { state: current, events };

  const floor = current.floorState;
  const boss = floor.monsters.find((m) => m.id === bossId);
  if (!boss || boss.aiState === 'DEAD') return { state: current, events };

  for (const to of stepToward(boss.pos, floor.player)) {
    if (!inBounds(floor.size, to)) continue;
    if (isOccupied(floor, to, bossId)) continue;
    events.push({ type: 'MOVE', entityId: bossId, from: boss.pos, to, apLeft: floor.ap });
    current = withMonsterPatch(current, bossId, { pos: to });
    break;
  }

  return { state: current, events };
}

/** 冲锋方向：boss→玩家的主导轴方向（dx/dy 取绝对值更大者的符号）；若重合则默认朝右。 */
function chargeDirection(boss: Coord, player: Coord): Coord {
  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  if (dx === 0 && dy === 0) return { x: 1, y: 0 };
  if (Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx), y: 0 };
  return { x: 0, y: Math.sign(dy) };
}

/**
 * 冲锋中心线路径：从 from 沿 dir 方向逐格延伸，直到越界/石块/存活怪物（不含 ICE_WALL/FREEZE_WALL/玩家——
 * 这些由 laneCells 在执行时逐格判定）。
 */
function chargePath(floor: FloorState, from: Coord, dir: Coord, excludeId: string): Coord[] {
  const path: Coord[] = [];
  let cur = from;
  while (true) {
    const next: Coord = { x: cur.x + dir.x, y: cur.y + dir.y };
    if (!inBounds(floor.size, next)) break;
    if (isBlockedByRock(floor, next)) break;
    if (floor.monsters.some((m) => m.id !== excludeId && m.aiState !== 'DEAD' && m.pos.x === next.x && m.pos.y === next.y)) break;
    path.push(next);
    cur = next;
  }
  return path;
}

/** 三格宽冲锋车道：center + 垂直方向 ±1（仅保留地图内的格子）。 */
function laneCells(center: Coord, dir: Coord, size: number): Coord[] {
  const perp: Coord = dir.x !== 0 ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const cells: Coord[] = [
    center,
    { x: center.x + perp.x, y: center.y + perp.y },
    { x: center.x - perp.x, y: center.y - perp.y },
  ];
  return cells.filter((c) => inBounds(size, c));
}

/**
 * 狂暴冲锋预警：本回合不攻击不移动，记录冲锋方向与路径，emit CHARGE_TELEGRAPHED。
 */
function telegraphFrostGiantCharge(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find((m) => m.id === bossId);
  if (!boss) return noop(state);

  const dir = chargeDirection(boss.pos, floor.player);
  const path = chargePath(floor, boss.pos, dir, bossId);

  const next = withMonsterPatch(state, bossId, { aiState: 'CHASE', frostChargeDir: dir });
  return {
    state: next,
    events: [{ type: 'CHARGE_TELEGRAPHED', bossId, dir, path }],
  };
}

/**
 * 狂暴冲锋执行：沿上回合预警方向逐格推进；三格宽车道内首先遇到 ICE_WALL/FREEZE_WALL 则击碎并停止，
 * 遇到玩家则造成 boss.attack × FROST_GIANT_CHARGE_DAMAGE_MULT 伤害并停止；
 * 均未命中则冲到路径终点，在随机空格生成一个新 ICE_WALL（消耗 RNG，AC-13）。
 */
function executeFrostGiantCharge(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find((m) => m.id === bossId);
  if (!boss || !boss.frostChargeDir) return noop(state);

  const dir = boss.frostChargeDir;
  const path = chargePath(floor, boss.pos, dir, bossId);
  let current = withMonsterPatch(state, bossId, { frostChargeDir: undefined });

  for (const cell of path) {
    const lane = laneCells(cell, dir, floor.size);

    const wall = current.floorState.entities.find(
      (e) => (e.type === 'ICE_WALL' || e.type === 'FREEZE_WALL') && !e.consumed
        && lane.some((c) => c.x === e.pos.x && c.y === e.pos.y),
    );
    if (wall) {
      const result = shatterWall(current.floorState, wall.id);
      current = withMonsterPatch(
        { ...current, floorState: { ...current.floorState, entities: result.entities } },
        bossId,
        { pos: cell, aiState: 'CHASE' },
      );
      return {
        state: current,
        events: [
          { type: 'ICE_WALL_SHATTERED', entityId: wall.id, shatteredCells: result.cells },
          { type: 'CHARGE_EXECUTED', bossId, from: boss.pos, to: cell, result: 'WALL_SHATTERED' },
        ],
      };
    }

    const playerHere = lane.some((c) => c.x === floor.player.x && c.y === floor.player.y);
    if (playerHere) {
      current = withMonsterPatch(current, bossId, { pos: cell, aiState: 'CHASE' });

      const damage = Math.round(boss.attack * FROST_GIANT_CHARGE_DAMAGE_MULT);
      const hp = Math.max(0, current.player.hp - damage);
      const dead = hp <= 0;
      const finalHp = hp;

      const events: PveEvent[] = [
        { type: 'CHARGE_EXECUTED', bossId, from: boss.pos, to: cell, result: 'PLAYER_HIT' },
        { type: 'PLAYER_DAMAGED', damage, hp: finalHp, sourceId: bossId },
      ];
      if (dead) events.push({ type: 'PLAYER_DEAD' });

      current = {
        ...current,
        status: dead ? ('DEAD' as const) : current.status,
        player: { ...current.player, hp: finalHp },
        floorState: {
          ...current.floorState,
          status: dead ? ('DEAD' as const) : current.floorState.status,
        },
      };

      return { state: current, events };
    }
  }

  // 均未命中：冲到路径终点（路径为空则原地），随机空格生成一个新 ICE_WALL
  const dest = path.length > 0 ? path[path.length - 1] : boss.pos;
  current = withMonsterPatch(current, bossId, { pos: dest, aiState: 'CHASE' });

  const rng = createRng(current.floorState.rngState);
  const emptyCells = allEmptyCells(current.floorState);

  if (emptyCells.length > 0) {
    const pos = rng.pick(emptyCells);
    const wallId = `ice_wall_${current.floorState.floor}_${current.floorState.turn}_${current.floorState.entities.length}`;
    const newWall: FixedEntity = { id: wallId, type: 'ICE_WALL', pos, consumed: false, hp: CHAPTER3_ICE_WALL_HP };
    current = {
      ...current,
      floorState: { ...current.floorState, entities: [...current.floorState.entities, newWall], rngState: rng.state() },
    };
    return {
      state: current,
      events: [
        { type: 'CHARGE_EXECUTED', bossId, from: boss.pos, to: dest, result: 'ICE_WALL_SPAWNED' },
        { type: 'ICE_WALL_SPAWNED', entityId: wallId, pos },
      ],
    };
  }

  current = { ...current, floorState: { ...current.floorState, rngState: rng.state() } };
  return {
    state: current,
    events: [{ type: 'CHARGE_EXECUTED', bossId, from: boss.pos, to: dest, result: 'NONE' }],
  };
}

/**
 * 冰霜巨人完整行动接管（由 MonsterAI.stepBoss 调用）：
 * - 狂暴且上回合已预警（frostChargeDir 已设置）→ 执行冲锋，替换本回合全部行动。
 * - 冰霜重击/狂暴预警循环回合（isFrostCycleTurn）→ 狂暴时预警，否则冰霜重击+追击。
 * - 其余回合返回 null，交还 MonsterAI 走正常追击/普攻（frostGiantAttack）流程。
 */
export function stepFrostGiant(state: ExpeditionState, boss: Monster): ApplyResult | null {
  const floor = state.floorState;
  const enraged = boss.hp / boss.maxHp <= FROST_GIANT_ENRAGE_HP_RATIO;

  if (enraged && boss.frostChargeDir) {
    return executeFrostGiantCharge(state, boss.id);
  }
  if (isFrostCycleTurn(floor.turn)) {
    if (enraged) return telegraphFrostGiantCharge(state, boss.id);
    return frostGiantHeavyStrikeAndChase(state, boss.id);
  }
  return null;
}
