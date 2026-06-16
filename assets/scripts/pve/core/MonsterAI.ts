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
import { VARIANT_SANDWORM_LARVA } from './Chapter2Monsters';
import { VARIANT_SNOW_WOLF } from './Chapter3Monsters';
import { VARIANT_VOID_WORM } from './Chapter5Monsters';
import {
  VARIANT_SPIRIT_BEETLE,
  VARIANT_SPIRIT_ELF,
} from './ChapterAnimaMonsters';

/** 冲锋变体：CHASE 状态每回合最多移动 2 格（而非普通怪的 1 格）。 */
const CHARGE_VARIANTS = new Set([VARIANT_SANDWORM_LARVA, VARIANT_SNOW_WOLF, VARIANT_VOID_WORM]);
import { ANIMA_BEETLE_TRAP_DURATION, ANIMA_ELF_TRAP_DURATION } from './PveConstants';
import type { FixedEntity } from './PveTypes';
import { shoesStealthReduction } from './EquipmentSystem';
import {
  fateGuardianAttack,
  fateProphecyStep,
  mirrorBehaviorStep,
  resolveDestinyRewrite,
  tryCrossEnrageThreshold,
  tryCrossMirrorThreshold,
  tryOfferDestinyRewrite,
} from './bosses/FateGuardian';
import { FATE_MIRROR_BOSS_ID } from './PveConstants';
import { frostGiantAttack, stepFrostGiant } from './bosses/FrostGiant';
import { lavaChainStep, lavaEruptionStep, lavaLordAttack, lavaTideStep } from './bosses/LavaLord';
import { isBurrowTurn, quicksandScorpionBurrow, quicksandScorpionAttack } from './bosses/QuicksandScorpion';
import { QUICKSAND_SCORPION_ENRAGE_HP_RATIO } from './PveConstants';
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
      case 'QUICKSAND_SCORPION': return quicksandScorpionAttack(state, monster.id);
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
 * - 流沙巨蝎潜地回合 → 触发潜地，本回合无攻击
 * 返回 ApplyResult 表示已处理；返回 null 表示走正常流程。
 */
function stepBoss(state: ExpeditionState, monster: Monster): ApplyResult | null {
  if (monster.type !== 'BOSS') return null;

  // 已处于潜地状态：冒出并攻击
  if (monster.isBurrowed) {
    return attackByType(state, monster);
  }

  // 流沙巨蝎：判断是否到潜地回合（HP 占比 ≤ 阈值时狂暴，间隔缩短）
  if (monster.bossId === 'QUICKSAND_SCORPION') {
    const enraged = monster.hp / monster.maxHp <= QUICKSAND_SCORPION_ENRAGE_HP_RATIO;
    if (isBurrowTurn(state.floorState.turn, enraged)) {
      return quicksandScorpionBurrow(state, monster.id);
    }
  }

  // 哥布林酋长：完整行动由 stepGoblinChief 接管（移动+攻击+增援号角）
  if (monster.bossId === 'GOBLIN_CHIEF') {
    return stepGoblinChief(state, monster);
  }

  // 冰霜巨人：冰霜重击/狂暴预警冲锋接管的回合，由 stepFrostGiant 完整处理
  if (monster.bossId === 'FROST_GIANT') {
    const result = stepFrostGiant(state, monster);
    if (result !== null) return result;
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

  const heavy = isHeavyStrikeTurn(floor.turn);
  const enraged = boss.hp <= GOBLIN_CHIEF_ENRAGE_HP;
  const moveSteps = goblinChiefMaxMoveSteps(boss.hp);

  // 朝玩家贪心移动若干步：stopRange≥0 时一旦进入该范围即停（普攻回合，移动到贴身就停手攻击）；
  // stopRange<0 时纯追击，移动满 steps 步或被挡为止（重击回合释放后用）。每步 emit MOVE。
  const chasePlayer = (steps: number, stopRange: number) => {
    for (let step = 0; step < steps; step++) {
      const m = current.floorState.monsters.find((mm) => mm.id === boss.id);
      if (!m || m.aiState === 'DEAD') break;
      if (stopRange >= 0 && manhattan(m.pos, current.floorState.player) <= stopRange) break;
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
  };

  // 一回合内「技能/攻击二选一 + 移动追击」（2026-06-15）：
  //  - 重击回合：先在【原地】释放重击（锁定中心 = 当前位置 = 上一回合红圈中心 → 预警精确），
  //    释放后再追击逼近玩家（boss 不再呆站）。范围攻击无需贴身，故先打后走。
  //  - 普通回合：近战普攻需贴身，故先移动到攻击范围内、再普攻（沿用原顺序）。
  if (heavy) {
    const atkResult = goblinChiefAttack(current, boss.id);
    allEvents.push(...atkResult.events);
    current = atkResult.state;
    if (current.status !== 'DEAD') chasePlayer(moveSteps, -1);
  } else {
    chasePlayer(moveSteps, boss.range);
    const atkResult = goblinChiefAttack(current, boss.id);
    allEvents.push(...atkResult.events);
    current = atkResult.state;
  }

  // 增援号角（非狂暴每 3 回合 / 狂暴每 2 回合，玩家存活，boss 未死时触发）
  if (current.status !== 'DEAD' && isHornTurn(floor.turn, enraged)) {
    const bossAlive = current.floorState.monsters.find((m) => m.id === boss.id && m.aiState !== 'DEAD');
    if (bossAlive) {
      const hornResult = goblinChiefHorn(current, boss.id);
      allEvents.push(...hornResult.events);
      current = hornResult.state;
    }
  }

  // 蓄力重击预警（2026-06-15 恢复 → 最终方案「先释放后追击 + 精确预警」）：本回合非重击回合，
  // 但下个怪物回合将触发重击时，发出预警。
  //
  // 重击回合 boss 先在【原地】释放重击、再追击移动（见上方 heavy 分支），即重击释放点 = 重击回合
  // 起始位置 = 本预警回合末 boss 位置（boss 在玩家回合内不动）。故下回合重击中心 = boss **当前
  // 位置**，命中半径 = HEAVY_STRIKE_RANGE。红圈据此画出 → 与下回合实际橙圈完全同心同半径，预警
  // 100% 精确：玩家只要移出红圈（距 boss 当前位置 > HEAVY_STRIKE_RANGE）即绝对安全，不浪费 AP。
  // （boss 释放后的追击移动发生在重击结算之后，不影响本次命中判定，仅为下回合逼近玩家。）
  if (current.status !== 'DEAD' && !heavy && isHeavyStrikeTurn(floor.turn + 1)) {
    const bossAlive = current.floorState.monsters.find((m) => m.id === boss.id && m.aiState !== 'DEAD');
    if (bossAlive) {
      allEvents.push({
        type: 'HEAVY_STRIKE_WARNING',
        bossId: boss.id,
        center: bossAlive.pos,
        radius: HEAVY_STRIKE_RANGE,
      });
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
 * 单个怪的一次行动入口：LAVA_LORD 在正常行动前依次结算
 * 喷发预警(lavaEruptionStep) → 熔岩锁链(lavaChainStep，触发则替换本回合普攻但保留追击移动，
 * 避免"Boss 原地不动→玩家被拉一格再走开→Boss 又不动→再次锁链"的死循环) → 定向熔岩潮汐
 * (lavaTideStep) → 正常行动（普攻+灼烧，见 lavaLordAttack）。
 */
function stepOneMonster(state: ExpeditionState, monsterId: string): ApplyResult {
  const monster = state.floorState.monsters.find((m) => m.id === monsterId);
  if (!monster || monster.aiState === 'DEAD') return { state, events: [] };

  if (monster.type === 'BOSS' && monster.bossId === 'LAVA_LORD') {
    const eruption = lavaEruptionStep(state, monsterId);

    const chain = lavaChainStep(eruption.state, monsterId);
    const chainTriggered = chain.events.some((e) => e.type === 'LAVA_CHAIN_PULL');
    if (chainTriggered) {
      if (chain.state.status === 'DEAD') {
        return { state: chain.state, events: [...eruption.events, ...chain.events] };
      }
      // 锁链触发：跳过本回合普攻与潮汐推进，但仍朝玩家追击移动一格——否则 Boss 永远停在原地，
      // 玩家被拉一下走一下，下回合又触发锁链，Boss 实质从不主动逼近。
      const move = chaseMoveOnly(chain.state, monsterId);
      return { state: move.state, events: [...eruption.events, ...chain.events, ...move.events] };
    }

    const tide = lavaTideStep(chain.state, monsterId);
    const result = stepOneMonsterCore(tide.state, monsterId);
    return { state: result.state, events: [...eruption.events, ...chain.events, ...tide.events, ...result.events] };
  }

  if (monster.type === 'BOSS' && monster.bossId === 'FATE_GUARDIAN') {
    // FATE_GUARDIAN 怪物回合调度顺序（design §8）：
    // 1. tryCrossEnrageThreshold（幂等，写 enraged + 清 fateProphecy）
    // 2. tryOfferDestinyRewrite（狂暴态周期到位则 5 抽 3 写 pendingDestinyRewrite）
    // 3. resolveDestinyRewrite（若 pendingDestinyRewrite.removed 非 null → 结算剩余 2）
    // 4. fateProphecyStep（仅非狂暴态，结算上回合预言 / 标记本回合）
    // 5. tryCrossMirrorThreshold（未生成过镜像 + HP ≤ 50% → 生成）
    // 6. fateGuardianAttack（普攻，吃 attackBuffPct）
    const enrage = tryCrossEnrageThreshold(state, monsterId);
    if (enrage.state.status === 'DEAD') return enrage;

    const offer = tryOfferDestinyRewrite(enrage.state, monsterId);
    if (offer.state.status === 'DEAD') {
      return { state: offer.state, events: [...enrage.events, ...offer.events] };
    }

    const resolve = resolveDestinyRewrite(offer.state, monsterId);
    if (resolve.state.status === 'DEAD') {
      return { state: resolve.state, events: [...enrage.events, ...offer.events, ...resolve.events] };
    }

    const prophecy = fateProphecyStep(resolve.state, monsterId);
    if (prophecy.state.status === 'DEAD') {
      return { state: prophecy.state, events: [...enrage.events, ...offer.events, ...resolve.events, ...prophecy.events] };
    }

    const mirror = tryCrossMirrorThreshold(prophecy.state, monsterId);
    const result = stepOneMonsterCore(mirror.state, monsterId);
    return {
      state: result.state,
      events: [...enrage.events, ...offer.events, ...resolve.events, ...prophecy.events, ...mirror.events, ...result.events],
    };
  }

  // 命运守卫行为镜像（FATE_MIRROR_BOSS_ID）：跳过通用 AI，直接走 mirrorBehaviorStep。
  if (monster.type === 'BOSS' && monster.bossId === FATE_MIRROR_BOSS_ID) {
    return mirrorBehaviorStep(state, monsterId);
  }

  return stepOneMonsterCore(state, monsterId);
}

/**
 * 朝玩家追击一格但不攻击（熔岩锁链触发后使用，确保 Boss 在跳过普攻的回合仍能逼近玩家）。
 * 已贴身（dist ≤ range）或四方向均被阻挡则原地不动。
 */
function chaseMoveOnly(state: ExpeditionState, monsterId: string): ApplyResult {
  const floor = state.floorState;
  const monster = floor.monsters.find((m) => m.id === monsterId);
  if (!monster || monster.aiState === 'DEAD') return { state, events: [] };
  if (manhattan(monster.pos, floor.player) <= monster.range) {
    return { state: withMonsterPatch(state, monsterId, { aiState: 'CHASE' }), events: [] };
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

function stepOneMonsterCore(state: ExpeditionState, monsterId: string): ApplyResult {
  const floor = state.floorState;
  const monster = floor.monsters.find((m) => m.id === monsterId);
  if (!monster || monster.aiState === 'DEAD') return { state, events: [] };

  // 冰冻（永冻之核遗物）：跳过本回合并 -1；归零后下回合正常行动
  if ((monster.frozenRounds ?? 0) > 0) {
    return {
      state: {
        ...state,
        floorState: {
          ...floor,
          monsters: floor.monsters.map((m) =>
            m.id === monsterId ? { ...m, frozenRounds: Math.max(0, (m.frozenRounds ?? 0) - 1) } : m,
          ),
        },
      },
      events: [],
    };
  }

  // Boss 优先处理：潜地/冒出/特殊预动作
  const bossResult = stepBoss(state, monster);
  if (bossResult !== null) return bossResult;

  const dist = manhattan(monster.pos, floor.player);
  // ROGUE 潜行(stealth)：怪物仇恨范围缩小 2；EPIC+靴子：额外缩小 2~3（叠加）
  const stealthReduction = (state.player.classTraits.includes('stealth') ? 2 : 0)
    + shoesStealthReduction(state.player.equipment.SHOES?.baseStat ?? 0);
  // 潜行削减"发现距离"，但怪物在自身攻击射程内时始终能感知玩家（不能对贴身敌人完全隐身）
  const inAggroRange = dist <= Math.max(monster.range, monster.aggroRadius - stealthReduction);

  // ── 灵气怪：FLEE ──────────────────────────────────────
  if (monster.type === 'ANIMA') {
    if (!inAggroRange) return { state, events: [] }; // 玩家不在范围内，原地不动

    const fleeing = withMonsterPatch(state, monsterId, { aiState: 'FLEE' });
    // 灵鼠(SPIRIT_RAT)：每次逃跑移动2格，其余灵气怪移动1格
    const moveSteps = monster.variantId === VARIANT_SPIRIT_RAT ? 2 : 1;
    // 灵气甲虫/精灵（CH2/CH3）：逃跑离开的原格生成陷阱（沙坑/冰面），存续若干回合
    const trapType: 'SAND_PIT' | 'ICE_TILE' | null =
      monster.variantId === VARIANT_SPIRIT_BEETLE ? 'SAND_PIT' :
      monster.variantId === VARIANT_SPIRIT_ELF ? 'ICE_TILE' : null;
    const trapDuration =
      trapType === 'SAND_PIT' ? ANIMA_BEETLE_TRAP_DURATION :
      trapType === 'ICE_TILE' ? ANIMA_ELF_TRAP_DURATION : 0;

    let current = fleeing;
    const allEvents: PveEvent[] = [];

    for (let step = 0; step < moveSteps; step++) {
      const m = current.floorState.monsters.find((m) => m.id === monsterId)!;
      let moved = false;
      for (const to of stepAwayFrom(m.pos, current.floorState.player)) {
        if (!inBounds(current.floorState.size, to)) continue;
        if (isOccupied(current.floorState, to, monsterId)) continue;
        const from = m.pos;
        allEvents.push({ type: 'MOVE', entityId: monsterId, from, to, apLeft: floor.ap });
        current = withMonsterPatch(current, monsterId, { pos: to });

        // 离开原格生成陷阱：跳过原格已有未消耗的同类型实体（避免叠加）
        if (trapType !== null) {
          const occupied = current.floorState.entities.some(
            (e) => !e.consumed && e.pos.x === from.x && e.pos.y === from.y && e.type === trapType,
          );
          if (!occupied) {
            const trapId = `anima_trap_${current.floorState.floor}_${monsterId}_${step}`;
            const trap: FixedEntity = {
              id: trapId,
              type: trapType,
              pos: from,
              consumed: false,
              remaining: trapDuration,
            };
            current = {
              ...current,
              floorState: {
                ...current.floorState,
                entities: [...current.floorState.entities, trap],
              },
            };
            allEvents.push({
              type: 'ANIMA_TRAP_SPAWNED',
              entityId: trapId,
              entityType: trapType,
              pos: from,
              variantId: monster.variantId ?? '',
              duration: trapDuration,
            });
          }
        }

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

  // 冲锋变体（SANDWORM_LARVA/SNOW_WOLF/VOID_WORM）每回合最多移动 2 格，普通怪 1 格。
  const maxMoveSteps = CHARGE_VARIANTS.has(monster.variantId ?? '') ? 2 : 1;
  let current = withMonsterPatch(state, monsterId, { aiState: 'CHASE' });
  const allEvents: PveEvent[] = [];

  for (let step = 0; step < maxMoveSteps; step++) {
    const m = current.floorState.monsters.find((mm) => mm.id === monsterId)!;
    let moved = false;
    for (const to of stepToward(m.pos, current.floorState.player)) {
      if (!inBounds(current.floorState.size, to)) continue;
      if (isOccupied(current.floorState, to, monsterId)) continue;
      allEvents.push({ type: 'MOVE', entityId: monsterId, from: m.pos, to, apLeft: floor.ap });
      current = withMonsterPatch(current, monsterId, { pos: to });
      moved = true;
      break;
    }
    if (!moved) break;
  }

  return { state: current, events: allEvents };
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
