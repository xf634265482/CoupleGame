// 熔岩领主专属机制（design specs/260615-lava-lord-rework/design.md / 第 4 章 Boss，第 20 层）：
// - 阶段一「熔火君王」(HP>50%)：普攻附加灼烧（lavaLordAttack）+ 周期性「喷发预警」(lavaEruptionStep)
// - 阶段二「熔岩潮汐」(HP<=50%)：停用喷发，从 Boss 所在边整排推进永久熔岩（lavaTideStep），
//   Boss 站熔岩攻击 +1（lavaLordAttack）/ 受击减伤 20%（CombatSystem.playerAttack）
// - 灼烧终结「熔核爆裂」：playerBurnRemaining 达阈值时清空灼烧并造成真实伤害+生成熔岩（applyBurnStacks）
// - 「熔岩锁链」反风筝：玩家连续远离 Boss 过久会被拉近一格并附加灼烧（lavaChainStep，替换本回合普攻）

import { monsterAttack } from '../CombatSystem';
import {
  CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO,
  CHAPTER4_LAVA_TIDE_INTERVAL,
  CHAPTER4_LAVA_TIDE_ROW_MAX,
  LAVA_LORD_BURN_BURST_DAMAGE_PER_STACK,
  LAVA_LORD_BURN_BURST_THRESHOLD,
  LAVA_LORD_BURN_BURST_TILE_DURATION,
  LAVA_LORD_BURN_TICKS,
  LAVA_LORD_CHAIN_BURN_TICKS,
  LAVA_LORD_CHAIN_DISTANCE_THRESHOLD,
  LAVA_LORD_CHAIN_TURN_THRESHOLD,
  LAVA_LORD_ERUPTION_DURATION,
  LAVA_LORD_ERUPTION_INTERVAL,
  LAVA_LORD_LAVA_STAND_ATTACK_BONUS,
} from '../PveConstants';
import type { ApplyResult, Coord, ExpeditionState, FixedEntity, FloorState, Monster, PveEvent } from '../PveTypes';

type TideDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function inBounds(size: number, pos: Coord): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < size && pos.y < size;
}

/** 网格内未被玩家/存活怪物/未消耗实体占据的空格。 */
function emptyCells(floor: FloorState, excludeId: string): Coord[] {
  const occupied = new Set<string>();
  occupied.add(`${floor.player.x},${floor.player.y}`);
  for (const m of floor.monsters) {
    if (m.id !== excludeId && m.aiState !== 'DEAD') occupied.add(`${m.pos.x},${m.pos.y}`);
  }
  for (const e of floor.entities) {
    if (!e.consumed) occupied.add(`${e.pos.x},${e.pos.y}`);
  }
  const cells: Coord[] = [];
  for (let y = 0; y < floor.size; y++) {
    for (let x = 0; x < floor.size; x++) {
      if (!occupied.has(`${x},${y}`)) cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * 灼烧叠加 + 熔核爆裂检查：playerBurnRemaining 达 LAVA_LORD_BURN_BURST_THRESHOLD 时
 * 清空灼烧、造成 total × LAVA_LORD_BURN_BURST_DAMAGE_PER_STACK 真实伤害（可致死），
 * 并在玩家周围"+"字 4 格生成 LAVA_TILE（跳过被占用格，存续 LAVA_LORD_BURN_BURST_TILE_DURATION 回合）。
 * totalRemaining 始终返回叠加后（爆裂前）的层数，供调用方在 BURN_APPLIED/LAVA_CHAIN_PULL 中展示。
 */
function applyBurnStacks(
  state: ExpeditionState,
  bossId: string,
  addTicks: number,
): { state: ExpeditionState; totalRemaining: number; events: PveEvent[] } {
  const floor = state.floorState;
  const total = (floor.playerBurnRemaining ?? 0) + addTicks;

  if (total < LAVA_LORD_BURN_BURST_THRESHOLD) {
    return {
      state: { ...state, floorState: { ...floor, playerBurnRemaining: total } },
      totalRemaining: total,
      events: [],
    };
  }

  const damage = total * LAVA_LORD_BURN_BURST_DAMAGE_PER_STACK;
  const hp = Math.max(0, state.player.hp - damage);
  const dead = hp <= 0;

  const center = floor.player;
  const candidates: Coord[] = [
    { x: center.x + 1, y: center.y },
    { x: center.x - 1, y: center.y },
    { x: center.x, y: center.y + 1 },
    { x: center.x, y: center.y - 1 },
  ];
  const free = new Set(emptyCells(floor, bossId).map((c) => `${c.x},${c.y}`));
  const targets = candidates.filter((c) => inBounds(floor.size, c) && free.has(`${c.x},${c.y}`));
  let seq = floor.entities.length;
  const newEntities: FixedEntity[] = targets.map((pos) => ({
    id: `lava_burst_${floor.floor}_${seq++}`,
    type: 'LAVA_TILE',
    pos,
    consumed: false,
    remaining: LAVA_LORD_BURN_BURST_TILE_DURATION,
  }));

  const events: PveEvent[] = [{ type: 'BURN_BURST', damage, hp, tiles: targets }];
  if (dead) events.push({ type: 'PLAYER_DEAD' });

  return {
    state: {
      ...state,
      status: dead ? 'DEAD' : state.status,
      player: { ...state.player, hp },
      floorState: {
        ...floor,
        status: dead ? 'DEAD' : floor.status,
        playerBurnRemaining: 0,
        entities: [...floor.entities, ...newEntities],
      },
    },
    totalRemaining: total,
    events,
  };
}

/**
 * 熔岩领主行动：普通攻击 + 站熔岩攻击加成 + 附加灼烧 tick（emit BURN_APPLIED）+ 熔核爆裂检查。
 * - 站在 LAVA_TILE 上时，本次攻击力临时 +LAVA_LORD_LAVA_STAND_ATTACK_BONUS（结算后恢复）。
 * - 命中后 playerBurnRemaining += LAVA_LORD_BURN_TICKS；达到阈值触发熔核爆裂（applyBurnStacks）。
 */
export function lavaLordAttack(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'LAVA_LORD',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  const onLava = floor.entities.some(
    (e) => e.type === 'LAVA_TILE' && !e.consumed && e.pos.x === boss.pos.x && e.pos.y === boss.pos.y,
  );

  let attackState = state;
  if (onLava) {
    attackState = {
      ...state,
      floorState: {
        ...floor,
        monsters: floor.monsters.map((m) =>
          m.id === bossId ? { ...m, attack: m.attack + LAVA_LORD_LAVA_STAND_ATTACK_BONUS } : m,
        ),
      },
    };
  }

  const attackResult = monsterAttack(attackState, bossId);

  let resultState = attackResult.state;
  if (onLava) {
    resultState = {
      ...resultState,
      floorState: {
        ...resultState.floorState,
        monsters: resultState.floorState.monsters.map((m) =>
          m.id === bossId ? { ...m, attack: boss.attack } : m,
        ),
      },
    };
  }
  if (resultState.status === 'DEAD') return { state: resultState, events: attackResult.events };

  const didHit = attackResult.events.some((e) => e.type === 'PLAYER_DAMAGED');
  if (!didHit) return { state: resultState, events: attackResult.events };

  const burn = applyBurnStacks(resultState, bossId, LAVA_LORD_BURN_TICKS);
  const burnEvent: PveEvent = { type: 'BURN_APPLIED', bossId, totalRemaining: burn.totalRemaining };

  return {
    state: burn.state,
    events: [...attackResult.events, burnEvent, ...burn.events],
  };
}

/**
 * 阶段一「喷发预警」前置步（MonsterAI 在 LAVA_LORD 正常行动前调用，类比 fateProphecyStep）：
 * - 阶段二期间停用：已挂起的标记直接清空，不结算。
 * - 否则若存在待结算标记 lavaEruptionMark → 在 cells 上生成 LAVA_TILE（跳过被占格，
 *   存续 LAVA_LORD_ERUPTION_DURATION 回合），emit ERUPTION_RESOLVED，清空标记。
 * - 否则若 turn % LAVA_LORD_ERUPTION_INTERVAL === 0 → 以玩家当前格为中心标记 4×4 区域
 *   （裁剪出图边界），emit ERUPTION_TELEGRAPHED；本回合普攻照常进行。
 */
export function lavaEruptionStep(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'LAVA_LORD',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  if (floor.lavaLordPhase2) {
    if (!floor.lavaEruptionMark) return noop(state);
    return {
      state: { ...state, floorState: { ...floor, lavaEruptionMark: undefined } },
      events: [],
    };
  }

  if (floor.lavaEruptionMark) {
    const free = new Set(emptyCells(floor, bossId).map((c) => `${c.x},${c.y}`));
    const targets = floor.lavaEruptionMark.cells.filter((c) => free.has(`${c.x},${c.y}`));
    let seq = floor.entities.length;
    const newEntities: FixedEntity[] = targets.map((pos) => ({
      id: `lava_erupt_${floor.floor}_${seq++}`,
      type: 'LAVA_TILE',
      pos,
      consumed: false,
      remaining: LAVA_LORD_ERUPTION_DURATION,
    }));
    return {
      state: {
        ...state,
        floorState: {
          ...floor,
          entities: [...floor.entities, ...newEntities],
          lavaEruptionMark: undefined,
        },
      },
      events: [{ type: 'ERUPTION_RESOLVED', tiles: targets, duration: LAVA_LORD_ERUPTION_DURATION }],
    };
  }

  if (floor.turn > 0 && floor.turn % LAVA_LORD_ERUPTION_INTERVAL === 0) {
    const cells: Coord[] = [];
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -1; dx <= 2; dx++) {
        const cell: Coord = { x: floor.player.x + dx, y: floor.player.y + dy };
        if (inBounds(floor.size, cell)) cells.push(cell);
      }
    }
    return {
      state: { ...state, floorState: { ...floor, lavaEruptionMark: { cells } } },
      events: [{ type: 'ERUPTION_TELEGRAPHED', cells }],
    };
  }

  return noop(state);
}

/**
 * 熔岩锁链（反风筝）前置步：每 Boss 回合开始统计玩家与 Boss 的曼哈顿距离，
 * - 距离 >1 → lavaLordChainCounter += 1；<=1 → 归零。
 * - 满足 counter >= LAVA_LORD_CHAIN_TURN_THRESHOLD 或 距离 >= LAVA_LORD_CHAIN_DISTANCE_THRESHOLD
 *   即触发：沿 boss→player 方向拉近玩家 1 格（落点越界/被占据则跳过位移，仅加灼烧），
 *   附加 LAVA_LORD_CHAIN_BURN_TICKS 层灼烧（可能连锁触发熔核爆裂），emit LAVA_CHAIN_PULL，counter 归零。
 * 调用方需检查返回事件中是否包含 LAVA_CHAIN_PULL：若有，本回合替换普攻（跳过潮汐推进与普攻）。
 */
export function lavaChainStep(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'LAVA_LORD',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  const dist = manhattan(floor.player, boss.pos);
  const prevCounter = floor.lavaLordChainCounter ?? 0;
  const counter = dist > 1 ? prevCounter + 1 : 0;
  const shouldTrigger =
    counter >= LAVA_LORD_CHAIN_TURN_THRESHOLD || dist >= LAVA_LORD_CHAIN_DISTANCE_THRESHOLD;

  if (!shouldTrigger) {
    if (counter === prevCounter) return noop(state);
    return {
      state: { ...state, floorState: { ...floor, lavaLordChainCounter: counter } },
      events: [],
    };
  }

  const from: Coord = { ...floor.player };
  const dx = Math.sign(boss.pos.x - floor.player.x);
  const dy = Math.sign(boss.pos.y - floor.player.y);
  const dest: Coord = { x: from.x + dx, y: from.y + dy };
  const occupied = new Set(
    [
      ...floor.monsters.filter((m) => m.aiState !== 'DEAD').map((m) => `${m.pos.x},${m.pos.y}`),
      ...floor.entities.filter((e) => !e.consumed && e.type !== 'LAVA_TILE').map((e) => `${e.pos.x},${e.pos.y}`),
    ],
  );
  const canMove = inBounds(floor.size, dest) && !occupied.has(`${dest.x},${dest.y}`);
  const to: Coord = canMove ? dest : from;

  let next: ExpeditionState = {
    ...state,
    floorState: { ...floor, player: to, lavaLordChainCounter: 0 },
  };

  const burn = applyBurnStacks(next, bossId, LAVA_LORD_CHAIN_BURN_TICKS);
  next = burn.state;

  const events: PveEvent[] = [
    { type: 'LAVA_CHAIN_PULL', from, to, burnTotal: burn.totalRemaining },
    ...burn.events,
  ];

  return { state: next, events };
}

/** 阶段二定向熔岩潮汐推进方向：取 Boss 当前位置到地图四边的最近一边，同距优先级 UP>DOWN>LEFT>RIGHT。 */
function determineTideDirection(boss: Monster, size: number): TideDirection {
  const candidates: { dir: TideDirection; dist: number }[] = [
    { dir: 'UP', dist: boss.pos.y },
    { dir: 'DOWN', dist: size - 1 - boss.pos.y },
    { dir: 'LEFT', dist: boss.pos.x },
    { dir: 'RIGHT', dist: size - 1 - boss.pos.x },
  ];
  const minDist = Math.min(...candidates.map((c) => c.dist));
  return candidates.find((c) => c.dist === minDist)!.dir;
}

/** 沿 direction 方向第 rowIndex（1-based）排的整条格子（10 格）。 */
function tideRowCells(size: number, direction: TideDirection, rowIndex: number): Coord[] {
  const cells: Coord[] = [];
  if (direction === 'UP') {
    const y = rowIndex - 1;
    for (let x = 0; x < size; x++) cells.push({ x, y });
  } else if (direction === 'DOWN') {
    const y = size - rowIndex;
    for (let x = 0; x < size; x++) cells.push({ x, y });
  } else if (direction === 'LEFT') {
    const x = rowIndex - 1;
    for (let y = 0; y < size; y++) cells.push({ x, y });
  } else {
    const x = size - rowIndex;
    for (let y = 0; y < size; y++) cells.push({ x, y });
  }
  return cells;
}

/**
 * 阶段二「定向熔岩潮汐」（HP ≤ CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO 进入，不可逆）：
 * - 首次进入：取 determineTideDirection 方向，立即在该边整排（10格）生成永久 LAVA_TILE
 *   （不带 remaining，跳过被占格），emit LAVA_TIDE_ROW_SPAWNED{rowIndex:1}。
 * - 此后每 CHAPTER4_LAVA_TIDE_INTERVAL 回合：若 rowsAdvanced < CHAPTER4_LAVA_TIDE_ROW_MAX，
 *   沿同方向再推进一排（rowIndex+1），否则不再推进（已生成格子永久保留）。
 * 由 MonsterAI 在 LAVA_LORD 每回合行动前调用（lavaEruptionStep/lavaChainStep 之后）。
 */
export function lavaTideStep(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'LAVA_LORD',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  if (boss.hp / boss.maxHp > CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO) return noop(state);

  const wasPhase2 = floor.lavaLordPhase2 ?? false;

  if (!wasPhase2) {
    const direction = determineTideDirection(boss, floor.size);
    const cells = tideRowCells(floor.size, direction, 1);
    const free = new Set(emptyCells(floor, bossId).map((c) => `${c.x},${c.y}`));
    const targets = cells.filter((c) => free.has(`${c.x},${c.y}`));
    let seq = floor.entities.length;
    const newEntities: FixedEntity[] = targets.map((pos) => ({
      id: `lava_tide_${floor.floor}_${seq++}`,
      type: 'LAVA_TILE',
      pos,
      consumed: false,
    }));
    return {
      state: {
        ...state,
        floorState: {
          ...floor,
          entities: [...floor.entities, ...newEntities],
          lavaLordPhase2: true,
          lavaTideDirection: direction,
          lavaTideRowsAdvanced: 1,
          lavaTideCounter: 0,
        },
      },
      events: [{ type: 'LAVA_TIDE_ROW_SPAWNED', tiles: targets, direction, rowIndex: 1 }],
    };
  }

  const rowsAdvanced = floor.lavaTideRowsAdvanced ?? 1;
  if (rowsAdvanced >= CHAPTER4_LAVA_TIDE_ROW_MAX) return noop(state);

  const counter = (floor.lavaTideCounter ?? 0) + 1;
  if (counter < CHAPTER4_LAVA_TIDE_INTERVAL) {
    return {
      state: { ...state, floorState: { ...floor, lavaTideCounter: counter } },
      events: [],
    };
  }

  const direction = floor.lavaTideDirection!;
  const nextRowIndex = rowsAdvanced + 1;
  const cells = tideRowCells(floor.size, direction, nextRowIndex);
  const free = new Set(emptyCells(floor, bossId).map((c) => `${c.x},${c.y}`));
  const targets = cells.filter((c) => free.has(`${c.x},${c.y}`));
  let seq = floor.entities.length;
  const newEntities: FixedEntity[] = targets.map((pos) => ({
    id: `lava_tide_${floor.floor}_${seq++}`,
    type: 'LAVA_TILE',
    pos,
    consumed: false,
  }));

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        entities: [...floor.entities, ...newEntities],
        lavaTideRowsAdvanced: nextRowIndex,
        lavaTideCounter: 0,
      },
    },
    events: [{ type: 'LAVA_TIDE_ROW_SPAWNED', tiles: targets, direction, rowIndex: nextRowIndex }],
  };
}
