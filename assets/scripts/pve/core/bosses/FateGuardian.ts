// 命运守卫专属机制（第 25 层最终 Boss，260616 重做后）：
//
// 三段状态机（HP 阈值递进）：
//   1. 常态 100%-50%：普通近战 + 高血量×2（hpRatio > 0.5 时守卫伤害 ×2）+ 命运预言（3×3 反风筝）
//   2. 镜像段 50%-30%：上述全部 + 行为镜像
//      - HP 首次跨过 50% → emit MIRROR_SPAWNED + 写 boss.mirrorSpawned=true
//      - 下一次怪物回合 tryCrossMirrorThreshold 实际生成镜像（FATE_MIRROR_BOSS_ID）
//      - 镜像数值快照：hp=玩家HP×0.5、attack=玩家attack×0.5
//      - 镜像复制玩家行为（ATTACK > MOVE > IDLE 优先级互斥）：
//          ATTACK → 朝玩家反打（曼哈顿 ≤ 2 命中，否则空挥）
//          MOVE   → 朝玩家最短路径推进 N 格
//          IDLE   → 获得 1 层护盾（不叠加，CombatSystem.resolveHit 消耗）
//      - 镜像可被击杀，HP=0 后不再复生
//   3. 狂暴段 ≤30%：普通近战 + 高血量×2 + 行为镜像（继承）+ 改写命运
//      - HP 首次跨过 30% → emit BOSS_ENRAGED + 清空 fateProphecy + 写 boss.enraged=true / enrageTurn
//      - 命运预言此后不再触发（isProphecyTurn 在 enraged=true 时返回 false）
//      - 狂暴起每 DESTINY_REWRITE_INTERVAL(3) 个怪物回合触发「改写命运」预告
//        ├─ T0 怪物回合：5 抽 3，emit DESTINY_REWRITE_OFFERED，写 pendingDestinyRewrite
//        ├─ T1 玩家回合：阻塞模态弹出，玩家点选弃 1 → chooseDestinyRewrite(idx)
//        └─ T2 怪物回合：resolveDestinyRewrite 按 E5→E4→E3→E1→E2 顺序结算剩余 2 个
//      - 5 事件池：E1 Boss 回血 / E2 Boss 加伤害 / E3 玩家扣血 / E4 5×5 爆炸 / E5 命运封锁
//
// 历史：
//   - 2026-06-14：命运预言（反风筝）替换原"40% 闪避"
//   - 2026-06-16：本次重做——删除"跟随型镜像"，引入"行为镜像 + 狂暴改写命运"

import { monsterAttack } from '../CombatSystem';
import {
  CLASS_STATS,
  DESTINY_5X5_DMG_MULT,
  DESTINY_5X5_RADIUS,
  DESTINY_ATK_BUFF_DURATION_TURNS,
  DESTINY_ATK_BUFF_PCT,
  DESTINY_DIRECT_DMG_MULT,
  DESTINY_HEAL_RATIO,
  DESTINY_REWRITE_DRAW_SIZE,
  DESTINY_REWRITE_INTERVAL,
  DESTINY_REWRITE_POOL_SIZE,
  FATE_ENRAGE_HP_RATIO,
  FATE_GUARDIAN_HP_THRESHOLD,
  FATE_MIRROR_ATK_FROM_PLAYER,
  FATE_MIRROR_ATTACK_RANGE,
  FATE_MIRROR_BOSS_ID,
  FATE_MIRROR_HP_FROM_PLAYER,
  FATE_MIRROR_SPAWN_HP_RATIO,
  FATE_PROPHECY_DAMAGE_MULT,
  FATE_PROPHECY_INTERVAL,
  FATE_PROPHECY_RADIUS,
} from '../PveConstants';
import { getBalancedPlayerAttackBase } from '../PveBalance';
import { createRng } from '../rng';
import type { ApplyResult, Coord, ExpeditionState, FloorState, Monster, PveEvent } from '../PveTypes';

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function chebyshev(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** boss 周围（8 方向，距离 ≤ 1）且未被玩家/其他存活怪物占据的空格。 */
function adjacentEmptyCells(floor: FloorState, center: Coord, excludeId: string): Coord[] {
  const occupied = new Set<string>();
  occupied.add(`${floor.player.x},${floor.player.y}`);
  for (const m of floor.monsters) {
    if (m.id !== excludeId && m.aiState !== 'DEAD') occupied.add(`${m.pos.x},${m.pos.y}`);
  }
  const results: Coord[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = center.x + dx;
      const ny = center.y + dy;
      if (nx >= 0 && ny >= 0 && nx < floor.size && ny < floor.size) {
        if (!occupied.has(`${nx},${ny}`)) results.push({ x: nx, y: ny });
      }
    }
  }
  return results;
}

/** 4 方向相邻空格（移动用）。 */
function adjacentEmptyForMove(floor: FloorState, from: Coord, excludeId: string, target: Coord): Coord[] {
  const occupied = new Set<string>();
  occupied.add(`${floor.player.x},${floor.player.y}`); // 玩家所在格也算占据（镜像不能踩玩家）
  for (const m of floor.monsters) {
    if (m.id !== excludeId && m.aiState !== 'DEAD') occupied.add(`${m.pos.x},${m.pos.y}`);
  }
  // 优先朝玩家方向（先处理距离差更大的轴）
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const candidates: Coord[] = [];
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx !== 0) candidates.push({ x: from.x + Math.sign(dx), y: from.y });
    if (dy !== 0) candidates.push({ x: from.x, y: from.y + Math.sign(dy) });
  } else {
    if (dy !== 0) candidates.push({ x: from.x, y: from.y + Math.sign(dy) });
    if (dx !== 0) candidates.push({ x: from.x + Math.sign(dx), y: from.y });
  }
  return candidates.filter(
    (p) => p.x >= 0 && p.y >= 0 && p.x < floor.size && p.y < floor.size && !occupied.has(`${p.x},${p.y}`),
  );
}

/** Boss 当前实际攻击力（含 E2 加伤 buff，过期时返回原值；不修改状态）。 */
function bossEffectiveAttack(boss: Monster, currentTurn: number): number {
  const pct = boss.attackBuffPct ?? 0;
  if (pct <= 0) return boss.attack;
  if ((boss.attackBuffExpiresAtTurn ?? 0) <= currentTurn) return boss.attack;
  return Math.round(boss.attack * (1 + pct / 100));
}

/** 清除已过期的 attackBuffPct（无副作用，返回新 monsters 数组）。 */
function clearExpiredAtkBuff(monsters: Monster[], currentTurn: number): Monster[] {
  return monsters.map((m) => {
    if (m.bossId !== 'FATE_GUARDIAN') return m;
    if ((m.attackBuffPct ?? 0) <= 0) return m;
    if ((m.attackBuffExpiresAtTurn ?? 0) > currentTurn) return m;
    return { ...m, attackBuffPct: undefined, attackBuffExpiresAtTurn: undefined };
  });
}

// ════════════════════════════════════════════════════════════════
//  普攻 / 命运预言
// ════════════════════════════════════════════════════════════════

/**
 * 命运守卫普攻（high blood × 2 + attackBuffPct 加成）：
 * - 玩家 HP > 50% → 伤害 × 2（高血量惩罚，三段全程生效）
 * - 叠加 attackBuffPct（E2 改写命运）
 */
export function fateGuardianAttack(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'FATE_GUARDIAN',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);

  const hpRatio = state.player.hp / state.player.maxHp;
  const buffPct = (boss.attackBuffPct ?? 0) > 0 && (boss.attackBuffExpiresAtTurn ?? 0) > floor.turn
    ? (boss.attackBuffPct ?? 0)
    : 0;
  const buffMult = 1 + buffPct / 100;

  // 高血量 × 2 + E2 加伤倍率叠加
  const damageMult = (hpRatio > FATE_GUARDIAN_HP_THRESHOLD ? 2 : 1) * buffMult;
  return monsterAttack(state, bossId, damageMult);
}

/** 是否是命运预言标记回合（每 FATE_PROPHECY_INTERVAL 个怪物回合）。狂暴态永远 false。 */
export function isProphecyTurn(turn: number, enraged = false): boolean {
  if (enraged) return false;
  return turn > 0 && turn % FATE_PROPHECY_INTERVAL === 0;
}

/**
 * 命运预言前置步（仅在非狂暴态有效）：
 * - 若 boss.enraged → 跳过（双保险，调用方应已避免）
 * - 若存在待结算预言 → 3×3 区域爆炸结算
 * - 否则若 isProphecyTurn → 标记玩家当前格
 */
export function fateProphecyStep(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'FATE_GUARDIAN',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);
  if (boss.enraged) return noop(state); // 狂暴态停摆

  // 非预言触发回合：跳过（防止标记后下一个怪物回合立即爆炸）
  if (!isProphecyTurn(floor.turn)) return noop(state);

  // ── 结算待定预言（爆炸：到达下一个 isProphecyTurn 时结算上次标记）──────────
  if (floor.fateProphecy) {
    const center = floor.fateProphecy.center;
    const events: PveEvent[] = [{ type: 'PROPHECY_RESOLVED', center }];
    const inBlast =
      Math.max(Math.abs(floor.player.x - center.x), Math.abs(floor.player.y - center.y)) <= FATE_PROPHECY_RADIUS;

    let next: ExpeditionState = { ...state, floorState: { ...floor, fateProphecy: undefined } };
    if (inBlast) {
      const effAttack = bossEffectiveAttack(boss, floor.turn);
      const damage = Math.round(effAttack * FATE_PROPHECY_DAMAGE_MULT);
      const hp = Math.max(0, state.player.hp - damage);
      const dead = hp <= 0;
      events.push({ type: 'PLAYER_DAMAGED', damage, hp, sourceId: bossId });
      if (dead) events.push({ type: 'PLAYER_DEAD' });
      next = {
        ...next,
        status: dead ? 'DEAD' : next.status,
        player: { ...next.player, hp },
        floorState: { ...next.floorState, status: dead ? 'DEAD' : next.floorState.status },
      };
    }
    return { state: next, events };
  }

  // ── 标记新预言 ────────────────────────────────────────
  const center: Coord = { x: floor.player.x, y: floor.player.y };
  return {
    state: { ...state, floorState: { ...floor, fateProphecy: { center } } },
    events: [{ type: 'PROPHECY_MARKED', center }],
  };
}

// ════════════════════════════════════════════════════════════════
//  跨阈值触发
// ════════════════════════════════════════════════════════════════

/**
 * HP 跨过 50% 后 + 尚未生成过镜像 → 在 Boss 相邻空格生成行为镜像。
 * MonsterAI 在 FATE_GUARDIAN 每回合行动前调用；幂等（mirrorSpawned=true 则 noop）。
 *
 * 镜像数值快照（诞生瞬间，之后不再变化）：
 *   hp = maxHp = round(player.hp × FATE_MIRROR_HP_FROM_PLAYER)
 *   attack = round(player.attack × FATE_MIRROR_ATK_FROM_PLAYER)
 */
export function tryCrossMirrorThreshold(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'FATE_GUARDIAN',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);
  if (boss.mirrorSpawned) return noop(state); // 已生成过（含死亡情况）
  if (boss.hp / boss.maxHp > FATE_MIRROR_SPAWN_HP_RATIO) return noop(state);

  const candidates = adjacentEmptyCells(floor, boss.pos, bossId);
  if (candidates.length === 0) {
    // 周围被堵：标记已生成避免每回合重试；下回合周围松动也不再生成（设计约定：一次性触发）
    return {
      state: {
        ...state,
        floorState: {
          ...floor,
          monsters: floor.monsters.map((m) => (m.id === bossId ? { ...m, mirrorSpawned: true } : m)),
        },
      },
      events: [],
    };
  }

  const rng = createRng(floor.rngState);
  const pos = rng.pick(candidates);

  // 玩家攻击力：由 CombatSystem.playerAttackPower 复算更准确，但避免循环依赖，
  // 这里用基础攻击 = CLASS_STATS + WEAPON.baseStat 的简化形式（设计：快照仅取基础值，词条/词条加成不计入镜像）
  // playerAttack 估算：通过 player 的 maxHp 简单测算可能误差大；此处直接取 player.maxHp 作为镜像 HP 基准更稳定的话语权
  const playerAttackEstimate = estimatePlayerBaseAttack(state);
  const mirrorHp = Math.max(1, Math.round(state.player.hp * FATE_MIRROR_HP_FROM_PLAYER));
  const mirrorAtk = Math.max(1, Math.round(playerAttackEstimate * FATE_MIRROR_ATK_FROM_PLAYER));

  const mirror: Monster = {
    id: `mirror_${floor.floor}`,
    type: 'BOSS',
    bossId: FATE_MIRROR_BOSS_ID,
    pos,
    hp: mirrorHp,
    maxHp: mirrorHp,
    attack: mirrorAtk,
    range: 1,
    aggroRadius: boss.aggroRadius,
    aiState: 'CHASE',
  };

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        monsters: [
          ...floor.monsters.map((m) => (m.id === bossId ? { ...m, mirrorSpawned: true } : m)),
          mirror,
        ],
        rngState: rng.state(),
      },
    },
    events: [{ type: 'MIRROR_SPAWNED', mirrorId: mirror.id, pos }],
  };
}

/**
 * 估算玩家基础攻击力（无 RNG/概率词条加成，仅 BASE + class + WEAPON.baseStat）。
 * 用于镜像快照。避免循环依赖 CombatSystem.playerAttackPower 的复杂词条计算。
 */
function estimatePlayerBaseAttack(state: ExpeditionState): number {
  const classBonus = CLASS_STATS[state.player.classId]?.attackBonus ?? 0;
  const weaponBonus = state.player.equipment.WEAPON?.baseStat ?? 0;
  return getBalancedPlayerAttackBase(state.balanceSnapshot, state.chapter).damage + classBonus + weaponBonus;
}

/**
 * HP 跨过 30% 后 + 尚未狂暴 → 进入狂暴态。
 * - 写 boss.enraged = true、enrageTurn = floor.turn
 * - 清空 floor.fateProphecy（避免狂暴 + 预言 + 改写命运三层叠加）
 *
 * CombatSystem.resolveHit 在玩家攻击使 HP 跨阈值时已 emit BOSS_ENRAGED；
 * 本函数仅落字段（幂等），不再二次 emit。
 */
export function tryCrossEnrageThreshold(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'FATE_GUARDIAN',
  );
  if (!boss || boss.aiState === 'DEAD') return noop(state);
  if (boss.enraged) return noop(state);
  if (boss.hp / boss.maxHp > FATE_ENRAGE_HP_RATIO) return noop(state);

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        fateProphecy: undefined,
        monsters: floor.monsters.map((m) =>
          m.id === bossId ? { ...m, enraged: true, enrageTurn: floor.turn } : m,
        ),
      },
    },
    events: [],
  };
}

// ════════════════════════════════════════════════════════════════
//  行为镜像
// ════════════════════════════════════════════════════════════════

/**
 * 玩家回合结束时调用：根据玩家本回合行为写入活镜像的 pendingBehavior。
 * 优先级：ATTACK > MOVE > IDLE（互斥）。
 *
 * @param attackedThisTurn 玩家本回合是否至少一次命中（攻击事件）
 * @param netMoveDistance  玩家本回合净位移格数（≥ 1 视为 MOVE）
 */
export function recordPlayerActionForMirror(
  state: ExpeditionState,
  attackedThisTurn: boolean,
  netMoveDistance: number,
): ApplyResult {
  const floor = state.floorState;
  const mirror = floor.monsters.find(
    (m) => m.bossId === FATE_MIRROR_BOSS_ID && m.aiState !== 'DEAD',
  );
  if (!mirror) return noop(state);

  let action: 'ATTACK' | 'MOVE' | 'IDLE';
  let distance = 0;
  if (attackedThisTurn) {
    action = 'ATTACK';
  } else if (netMoveDistance >= 1) {
    action = 'MOVE';
    distance = netMoveDistance;
  } else {
    action = 'IDLE';
  }

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        monsters: floor.monsters.map((m) =>
          m.id === mirror.id ? { ...m, pendingBehavior: { action, distance } } : m,
        ),
      },
    },
    events: [{ type: 'MIRROR_BEHAVIOR_QUEUED', mirrorId: mirror.id, action, distance }],
  };
}

/**
 * 镜像怪物回合：按 pendingBehavior 执行 ATTACK / MOVE / IDLE 分支。
 * MonsterAI 在迭代到 FATE_MIRROR_BOSS_ID 怪物时直接调用本函数（跳过通用 AI）。
 *
 * 执行后清空 pendingBehavior（无 pendingBehavior 时也不做事）。
 */
export function mirrorBehaviorStep(state: ExpeditionState, mirrorId: string): ApplyResult {
  const floor = state.floorState;
  const mirror = floor.monsters.find(
    (m) => m.id === mirrorId && m.bossId === FATE_MIRROR_BOSS_ID,
  );
  if (!mirror || mirror.aiState === 'DEAD') return noop(state);
  const behavior = mirror.pendingBehavior;
  if (!behavior) return noop(state);

  // 清空 pendingBehavior（不论分支结果）
  const clearPending = (s: ExpeditionState): ExpeditionState => ({
    ...s,
    floorState: {
      ...s.floorState,
      monsters: s.floorState.monsters.map((m) =>
        m.id === mirrorId ? { ...m, pendingBehavior: undefined } : m,
      ),
    },
  });

  if (behavior.action === 'IDLE') {
    // 已有护盾 → 跳过 emit；无护盾 → 写 1 + emit
    if (mirror.shieldStacks === 1) {
      return { state: clearPending(state), events: [] };
    }
    const next: ExpeditionState = {
      ...state,
      floorState: {
        ...floor,
        monsters: floor.monsters.map((m) =>
          m.id === mirrorId ? { ...m, shieldStacks: 1 as const, pendingBehavior: undefined } : m,
        ),
      },
    };
    return { state: next, events: [{ type: 'MIRROR_SHIELDED', mirrorId }] };
  }

  if (behavior.action === 'MOVE') {
    const steps = Math.max(0, behavior.distance);
    if (steps === 0) return { state: clearPending(state), events: [] };
    let current: ExpeditionState = state;
    let pos = mirror.pos;
    const events: PveEvent[] = [];
    for (let i = 0; i < steps; i++) {
      const target = current.floorState.player;
      const candidates = adjacentEmptyForMove(current.floorState, pos, mirrorId, target);
      if (candidates.length === 0) break;
      const next = candidates[0];
      events.push({ type: 'MIRROR_MOVED', mirrorId, from: pos, to: next });
      current = {
        ...current,
        floorState: {
          ...current.floorState,
          monsters: current.floorState.monsters.map((m) =>
            m.id === mirrorId ? { ...m, pos: next } : m,
          ),
        },
      };
      pos = next;
    }
    return { state: clearPending(current), events };
  }

  // ATTACK：曼哈顿 ≤ FATE_MIRROR_ATTACK_RANGE 命中（用 mirror.attack，吃 Boss E2 buff，受 ARMOR 减伤）
  const distToPlayer = manhattan(mirror.pos, floor.player);
  if (distToPlayer > FATE_MIRROR_ATTACK_RANGE) {
    return {
      state: clearPending(state),
      events: [{ type: 'MIRROR_ATTACKED', mirrorId, hit: false, damage: 0, hp: state.player.hp }],
    };
  }
  // 命中：手动构造伤害结算（避开 monsterAttack 的 range 校验，镜像 range=1 不允许曼哈顿=2 命中）
  // 镜像攻击吃 Boss 当前 E2 buff（design §4.3 E2：「镜像攻击都吃 buff」）
  const guardian = floor.monsters.find(
    (m) => m.bossId === 'FATE_GUARDIAN' && m.aiState !== 'DEAD',
  );
  const buffPct = guardian && (guardian.attackBuffPct ?? 0) > 0
    && (guardian.attackBuffExpiresAtTurn ?? 0) > floor.turn
    ? (guardian.attackBuffPct ?? 0)
    : 0;
  const armorReduction = state.player.equipment.ARMOR?.baseStat ?? 0;
  const rawDamage = mirror.attack * (1 + buffPct / 100);
  const reducedDamage = Math.max(0, rawDamage - armorReduction);
  const damage = Math.max(10, Math.round(reducedDamage));
  const hp = Math.max(0, state.player.hp - damage);
  const dead = hp <= 0;

  const events: PveEvent[] = [
    { type: 'MIRROR_ATTACKED', mirrorId, hit: true, damage, hp },
    { type: 'PLAYER_DAMAGED', damage, hp, sourceId: mirrorId },
  ];
  if (dead) events.push({ type: 'PLAYER_DEAD' });

  const next: ExpeditionState = {
    ...state,
    status: dead ? 'DEAD' : state.status,
    player: { ...state.player, hp },
    floorState: {
      ...floor,
      status: dead ? 'DEAD' : floor.status,
      monsters: floor.monsters.map((m) =>
        m.id === mirrorId ? { ...m, pendingBehavior: undefined } : m,
      ),
    },
  };
  return { state: next, events };
}

// ════════════════════════════════════════════════════════════════
//  改写命运（狂暴段周期触发）
// ════════════════════════════════════════════════════════════════

/** 狂暴起经过的怪物回合数（用于改写命运周期判定）。 */
function turnsSinceEnrage(boss: Monster, currentTurn: number): number {
  return Math.max(0, currentTurn - (boss.enrageTurn ?? currentTurn));
}

/**
 * 狂暴态周期触发「改写命运」预告（5 抽 3）：
 * - 仅在 boss.enraged=true 且 turnsSinceEnrage % DESTINY_REWRITE_INTERVAL === 0 时触发
 * - 已存在 pendingDestinyRewrite 时 noop（避免覆盖玩家未做出选择的预告）
 *
 * 从 1..5 中抽 3 个不重复的事件编号（顺序即为玩家看到的卡片顺序），写入 pendingDestinyRewrite.drawn。
 */
export function tryOfferDestinyRewrite(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'FATE_GUARDIAN',
  );
  if (!boss || boss.aiState === 'DEAD' || !boss.enraged) return noop(state);
  if (floor.pendingDestinyRewrite) return noop(state);

  const turnsSince = turnsSinceEnrage(boss, floor.turn);
  // 狂暴当回合（turnsSince=0）即首次预告；之后每 INTERVAL 回合触发
  if (turnsSince % DESTINY_REWRITE_INTERVAL !== 0) return noop(state);

  const rng = createRng(floor.rngState);
  const pool: number[] = [];
  for (let i = 1; i <= DESTINY_REWRITE_POOL_SIZE; i++) pool.push(i);
  const drawn: number[] = [];
  for (let i = 0; i < DESTINY_REWRITE_DRAW_SIZE; i++) {
    const idx = rng.int(0, pool.length - 1);
    drawn.push(pool[idx]);
    pool.splice(idx, 1);
  }
  const tuple = [drawn[0], drawn[1], drawn[2]] as [number, number, number];

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        rngState: rng.state(),
        pendingDestinyRewrite: { drawn: tuple, removed: null, offeredAtTurn: floor.turn },
      },
    },
    events: [{ type: 'DESTINY_REWRITE_OFFERED', drawn: tuple }],
  };
}

/**
 * 玩家在阻塞模态中点选弃 1 时调用：写入 pendingDestinyRewrite.removed。
 * - 无 pendingDestinyRewrite / 已选过 → noop
 * - removedIndex 必须 ∈ {0,1,2}
 */
export function chooseDestinyRewrite(state: ExpeditionState, removedIndex: 0 | 1 | 2): ApplyResult {
  const floor = state.floorState;
  if (!floor.pendingDestinyRewrite) return noop(state);
  if (floor.pendingDestinyRewrite.removed !== null) return noop(state);

  return {
    state: {
      ...state,
      floorState: {
        ...floor,
        pendingDestinyRewrite: { ...floor.pendingDestinyRewrite, removed: removedIndex },
      },
    },
    events: [{ type: 'DESTINY_REWRITE_CHOSEN', removedIndex }],
  };
}

/**
 * 下个 Boss 回合结算 pendingDestinyRewrite：按 E5 → E4 → E3 → E1 → E2 顺序执行剩余 2 个事件。
 * - 无 pendingDestinyRewrite / removed=null → noop
 * - 结算完毕清空 pendingDestinyRewrite
 *
 * 结算顺序保证：
 *   1. E5 命运封锁先生效（写 destinyLockNextTurn，不影响本回合）
 *   2. E4 5×5 爆炸用 buff 前 attack（如本回合 E2 也生效，仍用未加 buff 的 attack）
 *   3. E3 同 E4，用 buff 前 attack
 *   4. E1 Boss 回血（伤害结算后）
 *   5. E2 写入 attackBuffPct（影响下回合起的攻击）
 */
export function resolveDestinyRewrite(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  if (!floor.pendingDestinyRewrite || floor.pendingDestinyRewrite.removed === null) {
    return noop(state);
  }

  const boss = floor.monsters.find(
    (m) => m.id === bossId && m.type === 'BOSS' && m.bossId === 'FATE_GUARDIAN',
  );
  if (!boss || boss.aiState === 'DEAD') {
    // Boss 已死 → 清空 pending
    return {
      state: { ...state, floorState: { ...floor, pendingDestinyRewrite: undefined } },
      events: [],
    };
  }

  const { drawn, removed } = floor.pendingDestinyRewrite;
  const remaining = drawn.filter((_, i) => i !== removed);
  // 按 E5 → E4 → E3 → E1 → E2 顺序结算（编号即 1-5）
  const executionOrder = [5, 4, 3, 1, 2];
  const toExecute = executionOrder.filter((e) => remaining.includes(e));

  let next: ExpeditionState = state;
  const events: PveEvent[] = [];
  const executed: number[] = [];
  const preBuffAttack = bossEffectiveAttack(boss, floor.turn); // 本次结算用此值（E2 不影响本次）

  for (const eventId of toExecute) {
    if (next.status === 'DEAD') break;

    if (eventId === 5) {
      // E5 命运封锁
      next = {
        ...next,
        floorState: { ...next.floorState, destinyLockNextTurn: true },
      };
      events.push({ type: 'DESTINY_AP_LOCKED', nextTurnAp: 0 }); // 实际值在 ApSystem 结算时填入
      executed.push(5);
    } else if (eventId === 4) {
      // E4 5×5 爆炸（中心 = Boss 当前格）
      const center = boss.pos;
      const playerInBlast = chebyshev(next.floorState.player, center) <= DESTINY_5X5_RADIUS;
      let damage = 0;
      let hp = next.player.hp;
      if (playerInBlast) {
        damage = Math.round(preBuffAttack * DESTINY_5X5_DMG_MULT);
        hp = Math.max(0, next.player.hp - damage);
        const dead = hp <= 0;
        next = {
          ...next,
          status: dead ? 'DEAD' : next.status,
          player: { ...next.player, hp },
          floorState: { ...next.floorState, status: dead ? 'DEAD' : next.floorState.status },
        };
        events.push({ type: 'PLAYER_DAMAGED', damage, hp, sourceId: bossId });
        if (dead) events.push({ type: 'PLAYER_DEAD' });
      }
      events.push({ type: 'DESTINY_5X5_EXPLODED', center, damage, hp });
      executed.push(4);
    } else if (eventId === 3) {
      // E3 玩家扣血（无视防御）
      const damage = Math.round(preBuffAttack * DESTINY_DIRECT_DMG_MULT);
      const hp = Math.max(0, next.player.hp - damage);
      const dead = hp <= 0;
      next = {
        ...next,
        status: dead ? 'DEAD' : next.status,
        player: { ...next.player, hp },
        floorState: { ...next.floorState, status: dead ? 'DEAD' : next.floorState.status },
      };
      events.push({ type: 'PLAYER_DAMAGED', damage, hp, sourceId: bossId });
      events.push({ type: 'DESTINY_DIRECT_DAMAGE', damage, hp });
      if (dead) events.push({ type: 'PLAYER_DEAD' });
      executed.push(3);
    } else if (eventId === 1) {
      // E1 Boss 回血
      const amount = Math.round(boss.maxHp * DESTINY_HEAL_RATIO);
      const newHp = Math.min(boss.maxHp, boss.hp + amount);
      next = {
        ...next,
        floorState: {
          ...next.floorState,
          monsters: next.floorState.monsters.map((m) => (m.id === bossId ? { ...m, hp: newHp } : m)),
        },
      };
      events.push({ type: 'DESTINY_HEAL', amount, bossHp: newHp });
      executed.push(1);
    } else if (eventId === 2) {
      // E2 加伤害（写入 buff，影响下回合起的攻击）
      const expiresAt = floor.turn + DESTINY_ATK_BUFF_DURATION_TURNS;
      next = {
        ...next,
        floorState: {
          ...next.floorState,
          monsters: next.floorState.monsters.map((m) =>
            m.id === bossId
              ? { ...m, attackBuffPct: DESTINY_ATK_BUFF_PCT, attackBuffExpiresAtTurn: expiresAt }
              : m,
          ),
        },
      };
      events.push({ type: 'DESTINY_ATK_BUFF', pct: DESTINY_ATK_BUFF_PCT, expiresAtTurn: expiresAt });
      executed.push(2);
    }
  }

  // 清空 pendingDestinyRewrite + emit 汇总
  next = {
    ...next,
    floorState: { ...next.floorState, pendingDestinyRewrite: undefined },
  };
  events.push({ type: 'DESTINY_REWRITE_RESOLVED', executed });

  // 清掉过期 buff（保持不变性）
  next = {
    ...next,
    floorState: {
      ...next.floorState,
      monsters: clearExpiredAtkBuff(next.floorState.monsters, next.floorState.turn),
    },
  };

  return { state: next, events };
}
