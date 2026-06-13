// 怪物 AI（design §6 AC-18）：
// - 普通怪：发现玩家→CHASE→攻击；离开仇恨范围→恢复 IDLE。
// - 灵气怪：发现玩家→FLEE（逃跑），优先增大与玩家距离。
// - 精英怪：PATROL（巡逻随机走）→发现玩家→CHASE（不再返回 PATROL）→攻击。
// - Boss：专属机制（GoblinChief 等）。
// 纯函数：stepMonsters 依次驱动场上存活怪行动一次，玩家阵亡则提前终止。

import {
  GOBLIN_CHIEF_ENRAGE_HP,
  HEAVY_STRIKE_RANGE,
  goblinChiefAttack,
  goblinChiefHorn,
  goblinChiefMaxMoveSteps,
  isHeavyStrikeTurn,
  isHornTurn,
} from './bosses/GoblinChief';
import { VARIANT_SPIRIT_RAT } from './Chapter1Monsters';
import { shoesStealthReduction } from './EquipmentSystem';
import { fateGuardianAttack } from './bosses/FateGuardian';
import { frostGiantAttack } from './bosses/FrostGiant';
import { lavaLordAttack, lavaTideStep } from './bosses/LavaLord';
import { isBurrowTurn, sandwormBurrow, sandwormQueenAttack } from './bosses/SandwormQueen';
import { monsterAttack } from './CombatSystem';
import type { ApplyResult, Coord, ExpeditionState, FloorState, Monster, PveEvent } from './PveTypes';

function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function inBounds(size: number, pos: Coord): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < size && pos.y < size;
}

function isOccupied(floor: FloorState, pos: Coord, excludeId: string): boolean {
  if (floor.player.x === pos.x && floor.player.y === pos.y) return true;
  // 石块障碍：ROCK 类型未消耗的实体阻断移动（含怪物和玩家）
  if (floor.entities.some((e) => e.type === 'ROCK' && !e.consumed && e.pos.x === pos.x && e.pos.y === pos.y)) {
    return true;
  }
  return floor.monsters.some(
    (m) => m.id !== excludeId && m.aiState !== 'DEAD' && m.pos.x === pos.x && m.pos.y === pos.y,
  );
}

/**
 * 确定性巡逻方向索引（不消耗楼层 RNG，用怪物 id + 回合数散列）。
 * 保证 AC-13：相同 id + 相同 turn → 相同结果。
 */
function patrolDirIndex(monsterId: string, turn: number): number {
  let h = turn * 1234567;
  for (let i = 0; i < monsterId.length; i++) {
    h = Math.imul(h ^ monsterId.charCodeAt(i), 0x9e3779b9);
  }
  return Math.abs(h) % 4;
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

/**
 * 远离威胁的候选格（全部 4 个方向按逃跑后与威胁距离降序排列）。
 * 返回全部方向而非仅 1-2 个贪心方向，确保灵气怪被墙/怪物部分封堵时仍能找到最优逃跑路线。
 * 调用方遍历列表取第一个可行格；仅当全部方向均不可行时怪物才原地停留。
 */
function stepAwayFrom(from: Coord, threat: Coord): Coord[] {
  const dirs: Coord[] = [
    { x: from.x + 1, y: from.y },
    { x: from.x - 1, y: from.y },
    { x: from.x, y: from.y + 1 },
    { x: from.x, y: from.y - 1 },
  ];
  // 按移动后与威胁的曼哈顿距离从大到小排序 → 第一个可行格始终是最优逃跑方向
  return dirs.sort((a, b) => manhattan(b, threat) - manhattan(a, threat));
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

/** 按怪物类型派发专属攻击函数；Boss 调用专属机制，普通/精英/灵气怪走通用结算。 */
function attackByType(state: ExpeditionState, monster: Monster): ApplyResult {
  if (monster.type === 'BOSS') {
    switch (monster.bossId) {
      case 'GOBLIN_CHIEF':   return goblinChiefAttack(state, monster.id);
      case 'SANDWORM_QUEEN': return sandwormQueenAttack(state, monster.id);
      case 'FROST_GIANT':    return frostGiantAttack(state, monster.id);
      case 'LAVA_LORD':      return lavaLordAttack(state, monster.id);
      case 'FATE_GUARDIAN':  return fateGuardianAttack(state, monster.id);
    }
  }
  return monsterAttack(state, monster.id);
}

/**
 * Boss 特殊预处理：在 stepOneMonster 的正常逻辑之前优先检查。
 * - 潜地 Boss（isBurrowed）→ 跳过移动，直接走 attackByType（处理冒出逻辑）
 * - 沙虫女王潜地回合 → 触发潜地，本回合无攻击
 * 返回 ApplyResult 表示已处理；返回 null 表示走正常流程。
 */
function stepBoss(state: ExpeditionState, monster: Monster): ApplyResult | null {
  if (monster.type !== 'BOSS') return null;

  // 已处于潜地状态：冒出并攻击
  if (monster.isBurrowed) {
    return attackByType(state, monster);
  }

  // 沙虫女王：判断是否到潜地回合
  if (monster.bossId === 'SANDWORM_QUEEN' && isBurrowTurn(state.floorState.turn)) {
    return sandwormBurrow(state, monster.id);
  }

  // 哥布林酋长：完整行动由 stepGoblinChief 接管（移动+攻击+增援号角）
  if (monster.bossId === 'GOBLIN_CHIEF') {
    return stepGoblinChief(state, monster);
  }

  return null; // 走正常追击/移动逻辑
}

/**
 * 哥布林酋长完整行动：移动 → 攻击（或 AOE）→ 增援号角（非狂暴每 3 回合 / 狂暴每 2 回合）。
 * 接管 stepBoss 中的 GOBLIN_CHIEF 分支，保证行动序列完整可控。
 *
 * 移动规则：
 *   - 普通回合（奇数）：最多 1 步，攻击范围 boss.range（2）
 *   - 重击回合（偶数）：最多 1 步，攻击范围 HEAVY_STRIKE_RANGE（4）
 *   - 狂暴（HP≤GOBLIN_CHIEF_ENRAGE_HP）：上述最多步数 +1（最多 2 步）
 */
function stepGoblinChief(state: ExpeditionState, boss: Monster): ApplyResult {
  const floor = state.floorState;
  const allEvents: PveEvent[] = [];
  // 无论是否移动，都先将 boss 标记为 CHASE（与普通怪相同）
  let current = withMonsterPatch(state, boss.id, { aiState: 'CHASE' });

  // 本回合攻击范围（决定何时停止移动）
  const heavy = isHeavyStrikeTurn(floor.turn);
  const attackRange = heavy ? HEAVY_STRIKE_RANGE : boss.range;
  const enraged = boss.hp <= GOBLIN_CHIEF_ENRAGE_HP;
  const maxMoveSteps = goblinChiefMaxMoveSteps(boss.hp);

  for (let step = 0; step < maxMoveSteps; step++) {
    const m = current.floorState.monsters.find((m) => m.id === boss.id)!;
    if (manhattan(m.pos, current.floorState.player) <= attackRange) break; // 已在攻击范围内

    const chasing = withMonsterPatch(current, boss.id, { aiState: 'CHASE' });
    let didMove = false;
    for (const to of stepToward(m.pos, current.floorState.player)) {
      if (!inBounds(current.floorState.size, to)) continue;
      if (isOccupied(chasing.floorState, to, boss.id)) continue;
      allEvents.push({ type: 'MOVE', entityId: boss.id, from: m.pos, to, apLeft: floor.ap });
      current = withMonsterPatch(chasing, boss.id, { pos: to });
      didMove = true;
      break;
    }
    if (!didMove) {
      current = chasing; // 仍标记为 CHASE，即使未能移动
      break;
    }
  }

  // 攻击阶段（goblinChiefAttack 内部处理 AOE/单目标/预警/石块遮挡）
  const atkResult = goblinChiefAttack(current, boss.id);
  allEvents.push(...atkResult.events);
  current = atkResult.state;

  // 增援号角（非狂暴每 3 回合 / 狂暴每 2 回合，玩家存活，boss 未死时触发）
  if (current.status !== 'DEAD' && isHornTurn(floor.turn, enraged)) {
    const bossAlive = current.floorState.monsters.find((m) => m.id === boss.id && m.aiState !== 'DEAD');
    if (bossAlive) {
      const hornResult = goblinChiefHorn(current, boss.id);
      allEvents.push(...hornResult.events);
      current = hornResult.state;
    }
  }

  return { state: current, events: allEvents };
}

/**
 * 单个怪的一次行动，按 type 分派行为：
 *
 * NORMAL / BOSS（追击型）：
 *   玩家进仇恨范围 → CHASE；离开 → 恢复 IDLE。
 *   CHASE 且在攻击距离内 → 按类型派发攻击；否则贪心移动。
 *
 * ANIMA（逃跑型，AC-18）：
 *   玩家进仇恨范围 → FLEE，优先增大与玩家距离；出范围则保持 IDLE。
 *   无攻击能力（attack=0）。
 *
 * ELITE（巡逻→追击，AC-18）：
 *   发现玩家前 PATROL（确定性随机游走）；发现后 CHASE（不返回 PATROL）。
 *   CHASE 逻辑与 NORMAL 相同。
 */
/**
 * 单个怪的一次行动入口：LAVA_LORD 在正常行动前先结算熔岩潮汐阶段
 * （刷新/推进 lavaTiles，与 lavaLordAttack 独立叠加，不替代普通攻击）。
 */
function stepOneMonster(state: ExpeditionState, monsterId: string): ApplyResult {
  const monster = state.floorState.monsters.find((m) => m.id === monsterId);
  if (!monster || monster.aiState === 'DEAD') return { state, events: [] };

  if (monster.type === 'BOSS' && monster.bossId === 'LAVA_LORD') {
    const tide = lavaTideStep(state, monsterId);
    const result = stepOneMonsterCore(tide.state, monsterId);
    return { state: result.state, events: [...tide.events, ...result.events] };
  }

  return stepOneMonsterCore(state, monsterId);
}

function stepOneMonsterCore(state: ExpeditionState, monsterId: string): ApplyResult {
  const floor = state.floorState;
  const monster = floor.monsters.find((m) => m.id === monsterId);
  if (!monster || monster.aiState === 'DEAD') return { state, events: [] };

  // Boss 优先处理：潜地/冒出/特殊预动作
  const bossResult = stepBoss(state, monster);
  if (bossResult !== null) return bossResult;

  const dist = manhattan(monster.pos, floor.player);
  // ROGUE 潜行(stealth)：怪物仇恨范围缩小 2；EPIC+靴子：额外缩小 2~3（叠加）
  const stealthReduction = (state.player.classTraits.includes('stealth') ? 2 : 0)
    + shoesStealthReduction(state.player.equipment.SHOES?.baseStat ?? 0);
  const inAggroRange = dist <= Math.max(0, monster.aggroRadius - stealthReduction);

  // ── 灵气怪：FLEE ──────────────────────────────────────
  if (monster.type === 'ANIMA') {
    if (!inAggroRange) return { state, events: [] }; // 玩家不在范围内，原地不动

    const fleeing = withMonsterPatch(state, monsterId, { aiState: 'FLEE' });
    // 灵鼠(SPIRIT_RAT)：每次逃跑移动2格，其余灵气怪移动1格
    const moveSteps = monster.variantId === VARIANT_SPIRIT_RAT ? 2 : 1;
    let current = fleeing;
    const allEvents: PveEvent[] = [];

    for (let step = 0; step < moveSteps; step++) {
      const m = current.floorState.monsters.find((m) => m.id === monsterId)!;
      let moved = false;
      for (const to of stepAwayFrom(m.pos, current.floorState.player)) {
        if (!inBounds(current.floorState.size, to)) continue;
        if (isOccupied(current.floorState, to, monsterId)) continue;
        allEvents.push({ type: 'MOVE', entityId: monsterId, from: m.pos, to, apLeft: floor.ap });
        current = withMonsterPatch(current, monsterId, { pos: to });
        moved = true;
        break;
      }
      if (!moved) break; // 被封堵，停止
    }
    return { state: current, events: allEvents };
  }

  // ── 精英怪：PATROL → CHASE ───────────────────────────
  if (monster.type === 'ELITE') {
    if (!inAggroRange && monster.aiState !== 'CHASE') {
      // 巡逻：确定性随机游走
      const patrolling = withMonsterPatch(state, monsterId, { aiState: 'PATROL' });
      const dirs = [
        { x: monster.pos.x + 1, y: monster.pos.y },
        { x: monster.pos.x - 1, y: monster.pos.y },
        { x: monster.pos.x, y: monster.pos.y + 1 },
        { x: monster.pos.x, y: monster.pos.y - 1 },
      ];
      const startIdx = patrolDirIndex(monsterId, floor.turn);
      for (let i = 0; i < dirs.length; i++) {
        const to = dirs[(startIdx + i) % dirs.length];
        if (!inBounds(floor.size, to)) continue;
        if (isOccupied(patrolling.floorState, to, monsterId)) continue;
        return {
          state: withMonsterPatch(patrolling, monsterId, { pos: to }),
          events: [{ type: 'MOVE', entityId: monsterId, from: monster.pos, to, apLeft: floor.ap }],
        };
      }
      return { state: patrolling, events: [] };
    }
    // 发现玩家后进入 CHASE，与普通怪相同（fall through to CHASE logic below）
  }

  // ── 普通怪 / Boss / ELITE（已 CHASE）：追击型 ─────────
  if (!inAggroRange) {
    if (monster.aiState === 'IDLE') return { state, events: [] };
    return { state: withMonsterPatch(state, monsterId, { aiState: 'IDLE' }), events: [] };
  }

  if (dist <= monster.range) {
    return attackByType(
      withMonsterPatch(state, monsterId, { aiState: 'CHASE' }),
      monster,
    );
  }

  const chasing = withMonsterPatch(state, monsterId, { aiState: 'CHASE' });
  for (const to of stepToward(monster.pos, floor.player)) {
    if (!inBounds(floor.size, to)) continue;
    if (isOccupied(chasing.floorState, to, monsterId)) continue;
    return {
      state: withMonsterPatch(chasing, monsterId, { pos: to }),
      events: [{ type: 'MOVE', entityId: monsterId, from: monster.pos, to, apLeft: chasing.floorState.ap }],
    };
  }
  return { state: chasing, events: [] };
}

/**
 * 怪物回合：依次驱动场上全部存活怪各行动一次（NORMAL/ANIMA/ELITE/BOSS）；玩家阵亡则提前终止。
 */
export function stepMonsters(state: ExpeditionState): ApplyResult {
  let current = state;
  const events: PveEvent[] = [];

  for (const monster of state.floorState.monsters) {
    if (current.status === 'DEAD') break;
    if (monster.aiState === 'DEAD') continue;

    const result = stepOneMonster(current, monster.id);
    current = result.state;
    events.push(...result.events);
  }

  return { state: current, events };
}
