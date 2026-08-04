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
import { VARIANT_GOBLIN_SENTINEL, VARIANT_SPIRIT_RAT } from './Chapter1Monsters';
import { VARIANT_DESERT_HOPPER_LIZARD, VARIANT_DESERT_RAIDER, VARIANT_DUNE_SENTINEL } from './Chapter2Monsters';
import { VARIANT_FROST_SPRITE, VARIANT_GLACIER_SHAPER, VARIANT_SNOW_WOLF } from './Chapter3Monsters';
import { isControlRageActive } from './chapter3/ControlPointRage';
import { VARIANT_ASH_HOUND, VARIANT_FIRE_ELEMENTAL } from './Chapter4Monsters';
import { F24_ESCORT_CORE } from './chapter4/Chapter4FloorCatalog';
import { stepEscortCore } from './chapter4/EscortCore';
import { VARIANT_FATE_WATCHER, VARIANT_SHADOW_ASSASSIN } from './Chapter5Monsters';
import {
  VARIANT_SPIRIT_BEETLE,
  VARIANT_SPIRIT_ELF,
} from './ChapterAnimaMonsters';

import {
  ANIMA_BEETLE_TRAP_DURATION,
  ANIMA_ELF_TRAP_DURATION,
  CHAPTER1_CHASE_INTERCEPT_RUSH,
  CHAPTER1_CHASE_SENTINEL_MOVE,
  CHAPTER3_ICE_WALL_HP,
  CHAPTER3_CONTROL_RAGE_MOVE_BONUS,
  GLACIER_SHAPER_ICE_WALL_HP,
  GLACIER_SHAPER_WALLS_PER_CAST,
} from './PveConstants';
import type { FixedEntity } from './PveTypes';
import { resolveShoesStageEffectsFromItem } from './EquipmentSystem';
import { legSwallowStepsStealthBonus } from './LegendarySystem';
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
import { allyAttackMonster, monsterAttack } from './CombatSystem';
import { applyMonsterAlert, isPlayerExposed } from './AlertSystem';
import { checkLos } from './LosSystem';
import type { ApplyResult, Coord, ExpeditionState, FloorState, Monster, PveEvent } from './PveTypes';

/** 冲锋变体：CHASE 状态每回合最多移动 2 格（而非普通怪的 1 格）。哨兵已改为纯支援/逃跑，不含在内。 */
const CHARGE_VARIANTS = new Set([VARIANT_DESERT_HOPPER_LIZARD, VARIANT_DESERT_RAIDER, VARIANT_SNOW_WOLF]);
const WARNING_VARIANTS = new Set([VARIANT_DUNE_SENTINEL]);
const FIRE_ELEMENTAL_LAVA_DURATION = 3;

function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function inBounds(size: number, pos: Coord): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < size && pos.y < size;
}

function isAllyMonster(monster: Monster): boolean {
  return monster.side === 'ALLY';
}

function livingEnemyMonsters(floor: FloorState): Monster[] {
  return floor.monsters.filter((monster) => monster.aiState !== 'DEAD' && !isAllyMonster(monster));
}

function livingAllyMonsters(floor: FloorState): Monster[] {
  return floor.monsters.filter((monster) => monster.aiState !== 'DEAD' && isAllyMonster(monster));
}

function primaryEnemyTarget(floor: FloorState, monster: Monster): { pos: Coord; allyId?: string } {
  const allies = livingAllyMonsters(floor);
  if (allies.length === 0) return { pos: floor.player };
  allies.sort((a, b) => {
    const da = manhattan(a.pos, monster.pos);
    const db = manhattan(b.pos, monster.pos);
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });
  const ally = allies[0];
  return ally ? { pos: ally.pos, allyId: ally.id } : { pos: floor.player };
}

function isOccupied(floor: FloorState, pos: Coord, excludeId: string): boolean {
  if (floor.player.x === pos.x && floor.player.y === pos.y) return true;
  // 石块障碍：ROCK 类型未消耗的实体阻断移动（含怪物和玩家）
  if (floor.entities.some((e) => e.type === 'ROCK' && !e.consumed && e.pos.x === pos.x && e.pos.y === pos.y)) {
    return true;
  }
  return floor.monsters.some(
    (m) => m.id !== excludeId && m.aiState !== 'DEAD' && !m.isBurrowed && m.pos.x === pos.x && m.pos.y === pos.y,
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

function orthogonalSteps(from: Coord): Coord[] {
  return [
    { x: from.x + 1, y: from.y },
    { x: from.x - 1, y: from.y },
    { x: from.x, y: from.y + 1 },
    { x: from.x, y: from.y - 1 },
  ];
}

function getWarningUnit(floor: FloorState, monster: Monster): Monster | null {
  if (monster.type === 'BOSS' || WARNING_VARIANTS.has(monster.variantId ?? '')) return null;
  return floor.monsters.find(
    (m) =>
      m.id !== monster.id
      && m.aiState !== 'DEAD'
      && WARNING_VARIANTS.has(m.variantId ?? '')
      && manhattan(m.pos, monster.pos) <= 3
      && manhattan(m.pos, floor.player) <= 4,
  ) ?? null;
}

function coordinatedRetreatTarget(player: Coord, warning: Coord): Coord {
  const dx = player.x - warning.x;
  const dy = player.y - warning.y;
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) return { x: player.x + Math.sign(dx), y: player.y };
  if (dy !== 0) return { x: player.x, y: player.y + Math.sign(dy) };
  return { x: player.x + 1, y: player.y };
}

function chaseCandidates(floor: FloorState, monster: Monster): Coord[] {
  const primaryTarget = primaryEnemyTarget(floor, monster);
  const warning = getWarningUnit(floor, monster);
  if (!warning) return stepToward(monster.pos, primaryTarget.pos);

  const retreatTarget = coordinatedRetreatTarget(primaryTarget.pos, warning.pos);
  const defaultOrder = stepToward(monster.pos, primaryTarget.pos);
  return orthogonalSteps(monster.pos).sort((a, b) => {
    const aBlocked = !inBounds(floor.size, a) || isOccupied(floor, a, monster.id);
    const bBlocked = !inBounds(floor.size, b) || isOccupied(floor, b, monster.id);
    if (aBlocked !== bBlocked) return aBlocked ? 1 : -1;
    const aScore = manhattan(a, primaryTarget.pos) * 10 + manhattan(a, retreatTarget) * 3;
    const bScore = manhattan(b, primaryTarget.pos) * 10 + manhattan(b, retreatTarget) * 3;
    if (aScore !== bScore) return aScore - bScore;
    return defaultOrder.findIndex((p) => p.x === a.x && p.y === a.y)
      - defaultOrder.findIndex((p) => p.x === b.x && p.y === b.y);
  });
}

function isBlockingEntityType(type: FixedEntity['type']): boolean {
  return type === 'ROCK' || type === 'ICE_WALL' || type === 'FREEZE_WALL';
}

function isBlockedForPlayer(floor: FloorState, pos: Coord, extraWall?: Coord): boolean {
  if (!inBounds(floor.size, pos)) return true;
  if (extraWall && pos.x === extraWall.x && pos.y === extraWall.y) return true;
  if (floor.monsters.some((m) => m.aiState !== 'DEAD' && !m.isBurrowed && m.pos.x === pos.x && m.pos.y === pos.y)) return true;
  return floor.entities.some(
    (e) => !e.consumed && isBlockingEntityType(e.type) && e.pos.x === pos.x && e.pos.y === pos.y,
  );
}

function isReservedAllyCell(floor: FloorState, pos: Coord): boolean {
  return floor.entities.some((entity) => !entity.consumed
    && entity.pos.x === pos.x
    && entity.pos.y === pos.y
    && (entity.type === 'PORTAL' || entity.type === 'EXIT'));
}

function wouldHardLockPlayer(floor: FloorState, wallPos: Coord): boolean {
  return orthogonalSteps(floor.player).every((pos) => isBlockedForPlayer(floor, pos, wallPos));
}

function glacierShaperWallCandidates(player: Coord, monster: Coord, floor?: FloorState): Coord[] {
  const retreat = coordinatedRetreatTarget(player, monster);
  const lateral = orthogonalSteps(player)
    .filter((pos) => !(pos.x === retreat.x && pos.y === retreat.y))
    .sort((a, b) => manhattan(a, monster) - manhattan(b, monster));
  const cells: Coord[] = [retreat, ...lateral];
  const exit = floor?.entities.find((e) => !e.consumed && e.type === 'EXIT');
  if (exit) {
    cells.push(...orthogonalSteps(exit.pos).sort((a, b) => manhattan(a, player) - manhattan(b, player)));
  }
  const seen = new Set<string>();
  return cells.filter((pos) => {
    const key = `${pos.x},${pos.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fireElementalLavaCells(center: Coord): Coord[] {
  return [
    center,
    { x: center.x + 1, y: center.y },
    { x: center.x - 1, y: center.y },
    { x: center.x, y: center.y + 1 },
    { x: center.x, y: center.y - 1 },
  ];
}

function selectGlacierWallTargets(floor: FloorState, monster: Monster, monsterId: string): Coord[] {
  const result: Coord[] = [];
  for (const wallPos of glacierShaperWallCandidates(floor.player, monster.pos, floor)) {
    const blocked = isOccupied(floor, wallPos, monsterId)
      || floor.entities.some((e) => !e.consumed && e.pos.x === wallPos.x && e.pos.y === wallPos.y);
    if (!inBounds(floor.size, wallPos) || blocked) continue;
    const previewWalls = result.map((pos, index) => ({
      id: `__glacier_preview_${index}`,
      type: 'ICE_WALL' as const,
      pos,
      consumed: false,
      hp: GLACIER_SHAPER_ICE_WALL_HP,
      source: 'GLACIER_SHAPER' as const,
    }));
    if (wouldHardLockPlayer({ ...floor, entities: [...floor.entities, ...previewWalls] }, wallPos)) continue;
    result.push(wallPos);
    if (result.length >= GLACIER_SHAPER_WALLS_PER_CAST) break;
  }
  return result;
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

function attackWithTemporaryRange(
  state: ExpeditionState,
  monster: Monster,
  range: number,
): ApplyResult {
  const patched = withMonsterPatch(state, monster.id, { aiState: 'CHASE', range });
  const result = attackByType(patched, { ...monster, aiState: 'CHASE', range });
  return {
    state: withMonsterPatch(result.state, monster.id, { range: monster.range }),
    events: result.events,
  };
}

function patrolMove(state: ExpeditionState, monster: Monster, steps: number): ApplyResult {
  let current = withMonsterPatch(state, monster.id, { aiState: 'PATROL' });
  const events: PveEvent[] = [];
  for (let step = 0; step < steps; step++) {
    const latest = current.floorState.monsters.find((m) => m.id === monster.id);
    if (!latest || latest.aiState === 'DEAD') break;
    const dirs = orthogonalSteps(latest.pos);
    const startIdx = patrolDirIndex(monster.id, current.floorState.turn + step);
    let moved = false;
    for (let i = 0; i < dirs.length; i++) {
      const to = dirs[(startIdx + i) % dirs.length];
      if (!inBounds(current.floorState.size, to)) continue;
      if (isOccupied(current.floorState, to, monster.id)) continue;
      events.push({ type: 'MOVE', entityId: monster.id, from: latest.pos, to, apLeft: current.floorState.ap });
      current = withMonsterPatch(current, monster.id, { pos: to, aiState: 'PATROL' });
      moved = true;
      break;
    }
    if (!moved) break;
  }
  return { state: current, events };
}

function retreatMove(state: ExpeditionState, monsterId: string, steps: number): ApplyResult {
  let current = withMonsterPatch(state, monsterId, { aiState: 'FLEE' });
  const events: PveEvent[] = [];
  for (let step = 0; step < steps; step++) {
    const latest = current.floorState.monsters.find((m) => m.id === monsterId);
    if (!latest || latest.aiState === 'DEAD') break;
    const primaryTarget = primaryEnemyTarget(current.floorState, latest);
    let moved = false;
    for (const to of stepAwayFrom(latest.pos, primaryTarget.pos)) {
      if (!inBounds(current.floorState.size, to)) continue;
      if (isOccupied(current.floorState, to, monsterId)) continue;
      events.push({ type: 'MOVE', entityId: monsterId, from: latest.pos, to, apLeft: current.floorState.ap });
      current = withMonsterPatch(current, monsterId, { pos: to, aiState: 'FLEE' });
      moved = true;
      break;
    }
    if (!moved) break;
  }
  return { state: current, events };
}

function chapter1Floor4EscapeTarget(floor: FloorState): Coord {
  return floor.entities.find((entity) => !entity.consumed && entity.type === 'ESCAPE_MARKER')?.pos
    ?? { x: floor.size - 2, y: 0 };
}

function stepChapter1Floor4Sentinel(state: ExpeditionState, monsterId: string): ApplyResult {
  let current = withMonsterPatch(state, monsterId, { aiState: 'FLEE' });
  const events: PveEvent[] = [];
  for (let step = 0; step < CHAPTER1_CHASE_SENTINEL_MOVE; step += 1) {
    const latest = current.floorState.monsters.find((m) => m.id === monsterId);
    if (!latest || latest.aiState === 'DEAD') break;
    const escape = chapter1Floor4EscapeTarget(current.floorState);
    if (latest.pos.x === escape.x && latest.pos.y === escape.y) {
      events.push({ type: 'TARGET_ESCAPED', entityId: monsterId, pos: latest.pos });
      break;
    }
    const nearPlayer = manhattan(latest.pos, current.floorState.player) <= 3;
    const candidates = orthogonalSteps(latest.pos).sort((a, b) => {
      const aBlocked = !inBounds(current.floorState.size, a) || isOccupied(current.floorState, a, monsterId);
      const bBlocked = !inBounds(current.floorState.size, b) || isOccupied(current.floorState, b, monsterId);
      if (aBlocked !== bBlocked) return aBlocked ? 1 : -1;
      const aScore = manhattan(a, escape) * 10 - (nearPlayer ? manhattan(a, current.floorState.player) * 6 : 0);
      const bScore = manhattan(b, escape) * 10 - (nearPlayer ? manhattan(b, current.floorState.player) * 6 : 0);
      if (aScore !== bScore) return aScore - bScore;
      return a.x === b.x ? a.y - b.y : a.x - b.x;
    });
    const to = candidates.find((cell) => inBounds(current.floorState.size, cell) && !isOccupied(current.floorState, cell, monsterId));
    if (!to) break;
    events.push({ type: 'MOVE', entityId: monsterId, from: latest.pos, to, apLeft: current.floorState.ap });
    current = withMonsterPatch(current, monsterId, { pos: to, aiState: 'FLEE' });
    if (to.x === escape.x && to.y === escape.y) {
      events.push({ type: 'TARGET_ESCAPED', entityId: monsterId, pos: to });
      break;
    }
  }
  return { state: current, events };
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
      const primaryTarget = primaryEnemyTarget(current.floorState, m);
      if (stopRange >= 0 && manhattan(m.pos, primaryTarget.pos) <= stopRange) break;
      const chasing = withMonsterPatch(current, boss.id, { aiState: 'CHASE' });
      let didMove = false;
      for (const to of stepToward(m.pos, primaryTarget.pos)) {
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
  const primaryTarget = primaryEnemyTarget(floor, monster);
  if (manhattan(monster.pos, primaryTarget.pos) <= monster.range) {
    return { state: withMonsterPatch(state, monsterId, { aiState: 'CHASE' }), events: [] };
  }
  const chasing = withMonsterPatch(state, monsterId, { aiState: 'CHASE' });
  for (const to of chaseCandidates(chasing.floorState, monster)) {
    if (!inBounds(floor.size, to)) continue;
    if (isOccupied(chasing.floorState, to, monsterId)) continue;
    return {
      state: withMonsterPatch(chasing, monsterId, { pos: to }),
      events: [{ type: 'MOVE', entityId: monsterId, from: monster.pos, to, apLeft: chasing.floorState.ap }],
    };
  }
  return { state: chasing, events: [] };
}

function stepOneAlly(state: ExpeditionState, monsterId: string): ApplyResult {
  if (monsterId === F24_ESCORT_CORE) {
    return stepEscortCore(state, monsterId);
  }
  const ally = state.floorState.monsters.find((monster) => monster.id === monsterId);
  if (!ally || ally.aiState === 'DEAD' || !isAllyMonster(ally)) return { state, events: [] };
  const enemies = livingEnemyMonsters(state.floorState);
  if (enemies.length === 0) {
    for (const to of orthogonalSteps(ally.pos)) {
      if (!inBounds(state.floorState.size, to)) continue;
      if (isOccupied(state.floorState, to, monsterId) || isReservedAllyCell(state.floorState, to)) continue;
      return {
        state: withMonsterPatch(state, monsterId, { pos: to, aiState: 'IDLE' }),
        events: [{ type: 'MOVE', entityId: monsterId, from: ally.pos, to, apLeft: state.floorState.ap }],
      };
    }
    return { state, events: [] };
  }
  enemies.sort((a, b) => {
    const da = manhattan(a.pos, ally.pos);
    const db = manhattan(b.pos, ally.pos);
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });
  const target = enemies[0];
  if (!target) return { state, events: [] };

  let current = withMonsterPatch(state, monsterId, { aiState: 'CHASE' });
  const startDist = manhattan(ally.pos, target.pos);
  const events: PveEvent[] = [];
  if (startDist > ally.range) {
    const latest = current.floorState.monsters.find((monster) => monster.id === monsterId);
    if (latest) {
      for (const to of stepToward(latest.pos, target.pos)) {
        if (!inBounds(current.floorState.size, to)) continue;
        if (isOccupied(current.floorState, to, monsterId) || isReservedAllyCell(current.floorState, to)) continue;
        events.push({ type: 'MOVE', entityId: monsterId, from: latest.pos, to, apLeft: current.floorState.ap });
        current = withMonsterPatch(current, monsterId, { pos: to, aiState: 'CHASE' });
        break;
      }
    }
  }

  const movedAlly = current.floorState.monsters.find((monster) => monster.id === monsterId);
  if (!movedAlly) return { state: current, events };
  if (manhattan(movedAlly.pos, target.pos) > movedAlly.range) return { state: current, events };
  const attackResult = allyAttackMonster(current, monsterId, target.id);
  return { state: attackResult.state, events: [...events, ...attackResult.events] };
}

function stepOneMonsterCore(state: ExpeditionState, monsterId: string): ApplyResult {
  const floor = state.floorState;
  const monster = floor.monsters.find((m) => m.id === monsterId);
  if (!monster || monster.aiState === 'DEAD') return { state, events: [] };
  if (isAllyMonster(monster)) return stepOneAlly(state, monsterId);

  // 冰冻状态：跳过本回合并递减，归零后恢复行动。
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

  // 冰霜精灵：每 3 回合牺牲本次攻击，在玩家与自身之间、靠近玩家的一格升起冰墙。
  // 该墙立即打断双方远程 LOS，玩家可换线或击碎；同回合只触发一次。
  if (monster.variantId === VARIANT_FROST_SPRITE
    && floor.turn > 0
    && floor.turn % 3 === 0
    && monster.frostWallTurn !== floor.turn
    && manhattan(monster.pos, floor.player) >= 2) {
    const dx = Math.sign(monster.pos.x - floor.player.x);
    const dy = Math.sign(monster.pos.y - floor.player.y);
    const wallPos = Math.abs(monster.pos.x - floor.player.x) >= Math.abs(monster.pos.y - floor.player.y)
      ? { x: floor.player.x + dx, y: floor.player.y }
      : { x: floor.player.x, y: floor.player.y + dy };
    const blocked = isOccupied(floor, wallPos, monsterId)
      || floor.entities.some((e) => !e.consumed && e.pos.x === wallPos.x && e.pos.y === wallPos.y);
    if (inBounds(floor.size, wallPos) && !blocked) {
      const entityId = `frost_sprite_wall_${floor.floor}_${floor.turn}_${monsterId}`;
      return {
        state: {
          ...state,
          floorState: {
            ...floor,
            monsters: floor.monsters.map((m) => m.id === monsterId
              ? { ...m, aiState: 'CHASE', frostWallTurn: floor.turn }
              : m),
            entities: [...floor.entities, {
              id: entityId,
              type: 'ICE_WALL',
              pos: wallPos,
              consumed: false,
              hp: CHAPTER3_ICE_WALL_HP,
              remaining: 3,
            }],
          },
        },
        events: [{ type: 'FROST_SPRITE_WALL_RAISED', monsterId, entityId, pos: wallPos }],
      };
    }
  }

  if (monster.variantId === VARIANT_GLACIER_SHAPER) {
    if (monster.glacierWallTarget || (monster.glacierWallTargets?.length ?? 0) > 0) {
      const wallPositions = selectGlacierWallTargets(floor, monster, monsterId);
      if (wallPositions.length > 0) {
        const walls = wallPositions.map((pos, index) => ({
          id: `glacier_shaper_wall_${floor.floor}_${floor.turn}_${monsterId}_${index}`,
          type: 'ICE_WALL' as const,
          pos,
          consumed: false,
          hp: GLACIER_SHAPER_ICE_WALL_HP,
          source: 'GLACIER_SHAPER' as const,
        }));
        const raisedState: ExpeditionState = {
          ...state,
          floorState: {
            ...floor,
            monsters: floor.monsters.map((m) => m.id === monsterId
              ? {
                ...m,
                aiState: 'CHASE',
                frostWallTurn: floor.turn,
                glacierWallTarget: undefined,
                glacierWallTargets: undefined,
              }
              : m),
            entities: [...floor.entities, ...walls],
          },
        };
        const chaseResult = chaseMoveOnly(raisedState, monsterId);
        return {
          state: chaseResult.state,
          events: [
            ...walls.map((wall) => ({
              type: 'GLACIER_SHAPER_WALL_RAISED' as const,
              monsterId,
              entityId: wall.id,
              pos: wall.pos,
            })),
            ...chaseResult.events,
          ],
        };
      }
      return {
        state: withMonsterPatch(state, monsterId, {
          aiState: 'CHASE',
          glacierWallTarget: undefined,
          glacierWallTargets: undefined,
        }),
        events: monster.glacierWallTarget
          ? [{ type: 'GLACIER_SHAPER_WALL_FIZZLED', monsterId, pos: monster.glacierWallTarget }]
          : [],
      };
    }

    if (floor.turn > 0
      && floor.turn % 3 === 0
      && monster.frostWallTurn !== floor.turn
      && manhattan(monster.pos, primaryEnemyTarget(floor, monster).pos) <= 4) {
      const wallPositions = selectGlacierWallTargets(floor, monster, monsterId);
      if (wallPositions.length > 0) {
        return {
          state: withMonsterPatch(state, monsterId, {
            aiState: 'CHASE',
            frostWallTurn: floor.turn,
            glacierWallTarget: wallPositions[0],
            glacierWallTargets: wallPositions,
          }),
          events: [{ type: 'GLACIER_SHAPER_WALL_TELEGRAPHED', monsterId, pos: wallPositions[0] }],
        };
      }
    }
  }

  if (monster.variantId === VARIANT_FIRE_ELEMENTAL) {
    if (monster.lavaTelegraphTarget) {
      const target = monster.lavaTelegraphTarget;
      const tiles = fireElementalLavaCells(target)
        .filter((pos) => inBounds(floor.size, pos))
        .filter((pos) => !floor.entities.some(
          (e) => !e.consumed && e.type === 'LAVA_TILE' && e.pos.x === pos.x && e.pos.y === pos.y,
        ));
      return {
        state: {
          ...state,
          floorState: {
            ...floor,
            monsters: floor.monsters.map((m) => m.id === monsterId
              ? { ...m, aiState: 'CHASE', lavaTelegraphTarget: undefined }
              : m),
            entities: [
              ...floor.entities,
              ...tiles.map((pos, index) => ({
                id: `fire_elemental_lava_${floor.floor}_${floor.turn}_${monsterId}_${index}`,
                type: 'LAVA_TILE' as const,
                pos,
                consumed: false,
                remaining: FIRE_ELEMENTAL_LAVA_DURATION,
              })),
            ],
          },
        },
        events: [{ type: 'FIRE_ELEMENTAL_LAVA_SPREAD', monsterId, tiles, duration: FIRE_ELEMENTAL_LAVA_DURATION }],
      };
    }

    if (floor.turn > 0 && floor.turn % 3 === 0 && manhattan(monster.pos, primaryEnemyTarget(floor, monster).pos) <= 4) {
      const cells = fireElementalLavaCells(floor.player).filter((pos) => inBounds(floor.size, pos));
      return {
        state: withMonsterPatch(state, monsterId, {
          aiState: 'CHASE',
          lavaTelegraphTarget: primaryEnemyTarget(floor, monster).pos,
        }),
        events: [{ type: 'FIRE_ELEMENTAL_LAVA_TELEGRAPHED', monsterId, cells }],
      };
    }
  }

  const primaryTarget = primaryEnemyTarget(floor, monster);
  const dist = manhattan(monster.pos, primaryTarget.pos);
  // ROGUE 潜行(stealth)：怪物仇恨范围缩小 2；轻靴史诗起：额外缩小（叠加）
  // 基础款优缺点：重盔 helmet_heavy 使怪物警戒范围 +1（等同于减少潜行收益，AC-EQ-3）
  const helmetAggroPenalty = state.player.equipment.HELMET?.implicit === 'helmet_heavy' ? 1 : 0;
  const stealthReduction = resolveShoesStageEffectsFromItem(state.player.equipment.SHOES).stealthReduction
    + legSwallowStepsStealthBonus(state.player.equipment)
    - helmetAggroPenalty;
  // 潜行削减"发现距离"，但怪物在自身攻击射程内时始终能感知玩家（不能对贴身敌人完全隐身）
  const detectedPlayer = !state.floorState.rogueHidden
    && dist <= Math.max(monster.range, monster.aggroRadius - stealthReduction);
  const detectedTarget = primaryTarget.allyId
    ? dist <= Math.max(monster.range, monster.aggroRadius)
    : detectedPlayer;
  const inAggroRange = primaryTarget.allyId
    ? detectedTarget || monster.aiState === 'CHASE'
    : (monster.type !== 'ANIMA' && isPlayerExposed(floor)) || detectedPlayer;

  if (monster.variantId === VARIANT_GOBLIN_SENTINEL && detectedPlayer) {
    const alertEvents: PveEvent[] = [];
    const alerted = applyMonsterAlert(state, monsterId, 'GOBLIN_SENTINEL', alertEvents);
    if (alertEvents.length > 0) {
      // 第 4 层：哨兵首次呼喊时，其余守卫立刻冲锋拦截追击玩家。
      if (floor.floor === 4 && monsterId === 'GOBLIN_SENTINEL') {
        const interceptorIds = livingEnemyMonsters(alerted.floorState)
          .filter((entry) => entry.id !== monsterId)
          .map((entry) => entry.id);
        const rush = rushMonstersTowardPlayer(alerted, CHAPTER1_CHASE_INTERCEPT_RUSH, {
          monsterIds: interceptorIds,
          attackIfInRange: true,
        });
        return { state: rush.state, events: [...alertEvents, ...rush.events] };
      }
      return { state: alerted, events: alertEvents };
    }
  }
  if (monster.variantId === VARIANT_DUNE_SENTINEL && detectedPlayer) {
    const alertEvents: PveEvent[] = [];
    const alerted = applyMonsterAlert(state, monsterId, 'DUNE_SENTINEL', alertEvents);
    if (alertEvents.length > 0) return { state: alerted, events: alertEvents };
  }

  // 哥布林哨兵：永不普攻。第 4 层目标哨兵走追逃专属；其余巡逻 / 远离玩家。
  if (monster.variantId === VARIANT_GOBLIN_SENTINEL) {
    if (floor.floor === 4 && monster.id === 'GOBLIN_SENTINEL') {
      return stepChapter1Floor4Sentinel(state, monsterId);
    }
    if (!inAggroRange) return patrolMove(state, monster, 2);
    return retreatMove(state, monsterId, 2);
  }

  if (floor.floor === 11 && monsterId === 'CHASE_TARGET') {
    return stepChapter1Floor4Sentinel(state, monsterId);
  }
  if (floor.floor === 17 && monsterId === 'CHASE_TARGET') {
    return stepChapter1Floor4Sentinel(state, monsterId);
  }

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
      for (const to of stepAwayFrom(m.pos, primaryEnemyTarget(current.floorState, m).pos)) {
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
      return patrolMove(state, monster, 1);
    }
    // 发现玩家后进入 CHASE，与普通怪相同（fall through to CHASE logic below）
  }

  // ── 普通怪 / Boss / ELITE（已 CHASE）：追击型 ─────────
  if (!inAggroRange) {
    if (monster.aiState === 'IDLE') return { state, events: [] };
    return { state: withMonsterPatch(state, monsterId, { aiState: 'IDLE' }), events: [] };
  }

  if (dist <= monster.range) {
    // 远程怪（range≥2）：先做 LOS 校验；被掩体遮挡时不站桩空放，改为移动找射界（AC-MT-6）。
    // 近战（range=1）无中间格，直接攻击。
    if (monster.range >= 2) {
      const stateChased = withMonsterPatch(state, monsterId, { aiState: 'CHASE' });
      if (!checkLos(stateChased.floorState, monster.pos, primaryTarget.pos)) {
        return attackByType(stateChased, monster);
      }
      // LOS 被遮挡 → fall through 到移动逻辑，让怪物继续逼近找射界
    } else {
      return attackByType(
        withMonsterPatch(state, monsterId, { aiState: 'CHASE' }),
        monster,
      );
    }
  }

  // 高速/封路变体（沙漠跃蜥/沙漠劫匪/雪狼）每回合最多移动 2 格，且移动后本回合不追加攻击。
  const ashHoundOnLava = monster.variantId === VARIANT_ASH_HOUND && floor.entities.some(
    (e) => e.type === 'LAVA_TILE' && !e.consumed && e.pos.x === monster.pos.x && e.pos.y === monster.pos.y,
  );
  const playerRepeatedMove = (floor.playerStepsThisTurn ?? 0) >= 2;
  const shadowCutsRetreat = monster.variantId === VARIANT_SHADOW_ASSASSIN && playerRepeatedMove;
  const watcherAction: 'ATTACK' | 'MOVE' | null = monster.variantId === VARIANT_FATE_WATCHER
    ? floor.playerAttackedThisTurn ? 'ATTACK' : playerRepeatedMove ? 'MOVE' : null
    : null;
  const watcherRange = watcherAction === 'ATTACK' ? monster.range + 1 : monster.range;
  const warningUnit = getWarningUnit(floor, monster);
  const baseMoveSteps = CHARGE_VARIANTS.has(monster.variantId ?? '')
    || ashHoundOnLava
    || shadowCutsRetreat
    || watcherAction === 'ATTACK'
    || warningUnit !== null
    ? 2
    : watcherAction === 'MOVE'
      ? 3
      : 1;
  const floor12SandstormMoveBonus = floor.floor === 12 ? 4 : 0;
  let maxMoveSteps = baseMoveSteps
    + floor12SandstormMoveBonus
    + (monster.frenzied ? 1 : 0)
    + (isControlRageActive(floor) ? CHAPTER3_CONTROL_RAGE_MOVE_BONUS : 0);
  // 第 12 层第 19 回合后追兵狂暴：移动翻倍。
  if (floor.floor === 12 && floor.timedEscapeEnraged) {
    maxMoveSteps *= 2;
  }
  // 第 4 层哨兵已呼喊期间：追逃守卫加速贴脸拦截。
  if (
    floor.floor === 4
    && monsterId !== 'GOBLIN_SENTINEL'
    && (floor.goblinSentinelAlertIds?.length ?? 0) > 0
  ) {
    maxMoveSteps = Math.max(maxMoveSteps, 2);
  }
  let current = withMonsterPatch(state, monsterId, { aiState: 'CHASE' });
  const allEvents: PveEvent[] = [];
  if (watcherAction) allEvents.push({ type: 'FATE_WATCHER_ADAPTED', monsterId, action: watcherAction });

  if (watcherAction === 'ATTACK' && dist <= watcherRange) {
    const rangedAttack = attackWithTemporaryRange(current, monster, watcherRange);
    return { state: rangedAttack.state, events: [...allEvents, ...rangedAttack.events] };
  }

  for (let step = 0; step < maxMoveSteps; step++) {
    const m = current.floorState.monsters.find((mm) => mm.id === monsterId)!;
    let moved = false;
    for (const to of chaseCandidates(current.floorState, m)) {
      if (!inBounds(current.floorState.size, to)) continue;
      if (isOccupied(current.floorState, to, monsterId)) continue;
      allEvents.push({ type: 'MOVE', entityId: monsterId, from: m.pos, to, apLeft: floor.ap });
      current = withMonsterPatch(current, monsterId, { pos: to });
      moved = true;
      break;
    }
    if (!moved) break;
  }

  if (watcherAction === 'MOVE') {
    const movedWatcher = current.floorState.monsters.find((mm) => mm.id === monsterId);
    if (movedWatcher && manhattan(movedWatcher.pos, primaryEnemyTarget(current.floorState, movedWatcher).pos) <= movedWatcher.range) {
      const attackResult = attackByType(current, movedWatcher);
      return { state: attackResult.state, events: [...allEvents, ...attackResult.events] };
    }
  }

  return { state: current, events: allEvents };
}

/**
 * 火药桶警报冲锋 / 夜袭刷出冲锋：指定（或全体）存活敌怪各向玩家逼近最多 steps 格。
 * - attackIfInRange 默认 true（火药桶）；夜袭刷出传 false，避免刚出场就远程点杀。
 * - collapseMoves 为 true 时每个怪只 emit 一条 MOVE（起点→终点），便于整波同时冲入。
 */
export function rushMonstersTowardPlayer(
  state: ExpeditionState,
  steps: number,
  options?: {
    monsterIds?: readonly string[];
    attackIfInRange?: boolean;
    collapseMoves?: boolean;
  },
): ApplyResult {
  const attackIfInRange = options?.attackIfInRange !== false;
  const collapseMoves = options?.collapseMoves === true;
  const idFilter = options?.monsterIds ? new Set(options.monsterIds) : null;
  let current = state;
  const events: PveEvent[] = [];
  const livingIds = livingEnemyMonsters(state.floorState)
    .map((monster) => monster.id)
    .filter((id) => !idFilter || idFilter.has(id));

  for (const monsterId of livingIds) {
    if (current.status === 'DEAD' || current.player.hp <= 0) break;
    const monster = current.floorState.monsters.find((entry) => entry.id === monsterId);
    if (!monster || monster.aiState === 'DEAD' || monster.hp <= 0) continue;
    const startPos = { ...monster.pos };

    for (let step = 0; step < steps; step++) {
      const latest = current.floorState.monsters.find((entry) => entry.id === monsterId);
      if (!latest || latest.aiState === 'DEAD') break;
      const target = primaryEnemyTarget(current.floorState, latest).pos;
      if (manhattan(latest.pos, target) <= latest.range) break;

      let moved = false;
      for (const to of stepToward(latest.pos, target)) {
        if (!inBounds(current.floorState.size, to)) continue;
        if (isOccupied(current.floorState, to, monsterId)) continue;
        if (!collapseMoves) {
          events.push({ type: 'MOVE', entityId: monsterId, from: latest.pos, to, apLeft: current.floorState.ap });
        }
        current = withMonsterPatch(current, monsterId, { pos: to, aiState: 'CHASE' });
        moved = true;
        break;
      }
      if (!moved) break;
    }

    if (collapseMoves) {
      const after = current.floorState.monsters.find((entry) => entry.id === monsterId);
      if (after && (after.pos.x !== startPos.x || after.pos.y !== startPos.y)) {
        events.push({
          type: 'MOVE',
          entityId: monsterId,
          from: startPos,
          to: { ...after.pos },
          apLeft: current.floorState.ap,
        });
      } else {
        current = withMonsterPatch(current, monsterId, { aiState: 'CHASE' });
      }
    }

    if (!attackIfInRange) continue;
    if (current.status === 'DEAD' || current.player.hp <= 0) break;
    const afterMove = current.floorState.monsters.find((entry) => entry.id === monsterId);
    if (!afterMove || afterMove.aiState === 'DEAD' || afterMove.hp <= 0) continue;
    const target = primaryEnemyTarget(current.floorState, afterMove).pos;
    if (manhattan(afterMove.pos, target) > afterMove.range) continue;

    const attack = attackByType(current, afterMove);
    current = attack.state;
    events.push(...attack.events);
  }

  return { state: current, events };
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
