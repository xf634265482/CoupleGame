// 第一章 Boss「哥布林酋长」专属机制（design §6 Boss / §12 楼层通关 / AC-10）。
//
// 数值调整记录（2026-06-10）：
//   蓄力重击→同心圆AOE：内圈(距离≤2)=攻击×3，外圈(距离3-4)=攻击×2；
//   被AOE击中后移动AP+1持续2回合；石块可挡一次AOE后消失；
//   新增增援号角技能（召唤弓箭手×2，狂暴时额外召唤战士×2）。
//
// 平衡性调整记录（2026-06-10，下调强度）：
//   HP 改为按 bossChapterScaling 正常计算（不再绕过，第1章=45）；
//   攻击范围 GOBLIN_CHIEF_RANGE：3 → 2；
//   增援号角间隔：非狂暴每 3 回合一次，狂暴后每 2 回合一次。
//
// 平衡性调整记录（2026-06-11，蓄力重击节奏与预警）：
//   蓄力重击间隔 HEAVY_STRIKE_INTERVAL：2 → 3；
//   蓄力重击内圈伤害倍率 HEAVY_STRIKE_MULTIPLIER：×3 → ×2；
//   取消"重击前一回合"的独立预警（HEAVY_STRIKE_WARNING）：玩家本回合先行动，
//   重击就在该回合内直接结算并通过 HEAVY_STRIKE_RESOLVED（橙圈）标识命中范围，
//   减少"每回合都有红圈/橙圈"造成的持续压迫感。
//
// 平衡性调整记录（2026-06-13，进一步削弱）：
//   蓄力重击内/外圈伤害倍率 HEAVY_STRIKE_MULTIPLIER / HEAVY_STRIKE_OUTER_MULTIPLIER：×2 → ×1.5
//   （伤害取整 Math.round）；
//   增援号角不再召唤弓箭手，改为召唤哥布林战士 ×HORN_WARRIOR_COUNT（非狂暴=1），
//   狂暴后召唤数提升为 HORN_WARRIOR_ENRAGE_COUNT（=2）。
//
// 平衡性调整记录（2026-06-15，实测后再削弱）：
//   蓄力重击命中后不再附带「移动AP+1」减速效果；
//   普通攻击范围 GOBLIN_CHIEF_RANGE：2 → 1（改为纯近战）；
//   狂暴阈值 GOBLIN_CHIEF_ENRAGE_HP：200 → 170。
//
// 平衡性调整记录（2026-06-15，重击预警重做 → 最终「先释放后追击」）：
//   蓄力重击恢复「重击前一回合」红圈预警。演进过程：
//   ① 中途「威胁区」方案：红圈半径 = HEAVY_STRIKE_RANGE + 移动步数，因 boss 重击回合追击移动需
//      预留空间，红圈恒大于橙圈，玩家被误导多走位浪费 AP。
//   ② 中途「站桩」方案：重击回合 boss 完全不移动，红圈=橙圈预警精确，但 boss 呆站观感差。
//   ③ 最终「先释放后追击」方案：重击回合 boss 一回合内「技能/攻击二选一 + 移动追击」——先在
//      【原地】释放重击（锁定中心 = 当前位置 = 上一回合红圈中心 → 预警仍 100% 精确），释放后再
//      追击逼近玩家（boss 不呆站）。普通回合仍「先移动贴身、再普攻」。
//   HEAVY_STRIKE_RANGE 维持 4（曾短暂下调为 3，站桩/先放后追方案下无需缩半径即可躲避，已改回）。

import type { Rng } from '../rng';
import type {
  ApplyResult,
  Coord,
  EquipItem,
  ExpeditionState,
  FixedEntity,
  FloorState,
  Monster,
  PveEvent,
} from '../PveTypes';
import { makeGoblinWarrior } from '../Chapter1Monsters';
import { BOSS_ARMOR_PENETRATION, GOBLIN_CHIEF_SUMMON_CAP, HORN_WARRIOR_COUNT, HORN_WARRIOR_ENRAGE_COUNT } from '../PveConstants';

function bossPhysicalDamage(state: ExpeditionState, rawAttack: number, multiplier = 1): number {
  const player = state.player;
  const armor = (player.equipment.ARMOR?.baseStat ?? 0)
    + (player.idolArmorBonus ?? 0);
  const effectiveArmor = Math.floor(Math.max(0, armor) * (1 - BOSS_ARMOR_PENETRATION));
  return Math.max(1, Math.round(Math.max(0, rawAttack - effectiveArmor) * multiplier));
}

/** HP ≤ 此值时进入狂暴：攻击 +10、移动 +1（MonsterAI 处理额外移动步；2026-06-15 由 200 下调为 170）。 */
export const GOBLIN_CHIEF_ENRAGE_HP = 170;
/** 普通攻击范围（曼哈顿距离）。2026-06-15 由 2 → 1，改为纯近战。 */
export const GOBLIN_CHIEF_RANGE = 1;
/** 每隔多少个怪物回合触发一次蓄力重击。 */
export const HEAVY_STRIKE_INTERVAL = 3;
/** 增援号角间隔（非狂暴）：每 3 个怪物回合。 */
export const HORN_INTERVAL_NORMAL = 3;
/** 增援号角间隔（狂暴后）：每 2 个怪物回合。 */
export const HORN_INTERVAL_ENRAGED = 2;
/** 蓄力重击内圈伤害倍率（距离 ≤ HEAVY_STRIKE_INNER_RANGE）。 */
export const HEAVY_STRIKE_MULTIPLIER = 1.5;
/** 蓄力重击内圈半径（距离 ≤ 2 触发内圈伤害）。 */
export const HEAVY_STRIKE_INNER_RANGE = 2;
/** 蓄力重击外圈伤害倍率（距离 HEAVY_STRIKE_INNER_RANGE+1 到 HEAVY_STRIKE_RANGE）。 */
export const HEAVY_STRIKE_OUTER_MULTIPLIER = 1.5;
/** 蓄力重击外圈最大半径（整体 AOE 半径）。2026-06-15 曾由 4→3，同日改为「重击回合站桩」后又改回 4
 *  （站桩后红圈=橙圈，无需靠缩小半径来腾出躲避空间，半径放大回 4 保持威慑）。 */
export const HEAVY_STRIKE_RANGE = 4;

function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function noop(state: ExpeditionState): ApplyResult {
  return { state, events: [] };
}

/** 当前怪物回合是否触发蓄力重击（第 2、4、6… 个怪物回合）。 */
export function isHeavyStrikeTurn(turn: number): boolean {
  return turn > 0 && turn % HEAVY_STRIKE_INTERVAL === 0;
}

/** 当前怪物回合是否触发增援号角：非狂暴每 HORN_INTERVAL_NORMAL（3）回合，狂暴后每 HORN_INTERVAL_ENRAGED（2）回合。 */
export function isHornTurn(turn: number, enraged: boolean): boolean {
  const interval = enraged ? HORN_INTERVAL_ENRAGED : HORN_INTERVAL_NORMAL;
  return turn > 0 && turn % interval === 0;
}

/** 哥布林酋长本回合最大移动步数：2026-06-27 起狂暴后不再额外增加移动，始终为 1。 */
export function goblinChiefMaxMoveSteps(hp: number): number {
  void hp;
  return 1;
}

/**
 * 检测是否有石块实体位于 boss→target 路径上（抵挡 AOE 伤害的判定核心）。
 * 判定：石块比 target 更靠近 boss，且在与 target 同方向（同象限）的爆炸范围内。
 * 返回被击中的石块实体，无则返回 null。
 */
function rockShadowing(
  entities: FixedEntity[],
  boss: Coord,
  target: Coord,
  blastRange: number,
): FixedEntity | null {
  const dx = Math.sign(target.x - boss.x);
  const dy = Math.sign(target.y - boss.y);
  const targetDist = manhattan(boss, target);

  for (const e of entities) {
    if (e.type !== 'ROCK' || e.consumed) continue;
    const rockDist = manhattan(boss, e.pos);
    if (rockDist >= targetDist) continue; // 石块必须比 target 更近
    if (rockDist > blastRange) continue;  // 石块必须在爆炸范围内

    // 石块必须在 target 所在方向上（同象限检测）
    const rdx = e.pos.x - boss.x;
    const rdy = e.pos.y - boss.y;
    const sameDirX = dx === 0 || (rdx !== 0 && Math.sign(rdx) === dx);
    const sameDirY = dy === 0 || (rdy !== 0 && Math.sign(rdy) === dy);
    if (sameDirX && sameDirY) return e;
  }
  return null;
}

/** 检测是否有石块实体位于 boss→player 路径上，用于抵挡 AOE 伤害。返回被击中石块 id，无则返回 null。 */
function findBlockingRock(
  entities: FixedEntity[],
  boss: Coord,
  player: Coord,
  blastRange: number,
): string | null {
  return rockShadowing(entities, boss, player, blastRange)?.id ?? null;
}

/** 判断某格是否被石块遮挡（boss→该格路径上有未消耗的石块），用于 UI 预警范围排除"安全格"。 */
export function isCellShadowedByRock(
  entities: FixedEntity[],
  boss: Coord,
  cell: Coord,
  blastRange: number,
): boolean {
  return rockShadowing(entities, boss, cell, blastRange) !== null;
}

/**
 * 查找 boss 周围的空闲格子（用于增援号角召唤）。
 * 8 方向优先，跳过玩家位置、已有存活怪物、石块。
 */
function getAdjacentFreeCells(floor: FloorState, center: Coord, count: number): Coord[] {
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
    if (d.x < 0 || d.y < 0 || d.x >= floor.size || d.y >= floor.size) continue;
    if (d.x === floor.player.x && d.y === floor.player.y) continue;
    if (floor.monsters.some((m) => m.aiState !== 'DEAD' && m.pos.x === d.x && m.pos.y === d.y)) continue;
    if (floor.entities.some((e) => !e.consumed && e.pos.x === d.x && e.pos.y === d.y)) continue;
    result.push(d);
  }
  return result;
}

/**
 * 哥布林酋长专属攻击：
 * - 普通回合（奇数）：普通攻击范围 GOBLIN_CHIEF_RANGE（2），单目标
 * - 重击回合（偶数）：同心圆 AOE，内圈(≤2格)×3，外圈(3-4格)×2
 *   - 石块在 boss→player 路径上时吸收伤害并消失
 * - 狂暴（HP≤GOBLIN_CHIEF_ENRAGE_HP）：基础攻击+10
 */
export function goblinChiefAttack(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find((m) => m.id === bossId);
  if (!boss || boss.type !== 'BOSS' || boss.bossId !== 'GOBLIN_CHIEF' || boss.aiState === 'DEAD') {
    return noop(state);
  }

  const heavy = isHeavyStrikeTurn(floor.turn);
  const enraged = boss.hp <= GOBLIN_CHIEF_ENRAGE_HP;
  const baseAttack = enraged ? boss.attack + 10 : boss.attack;

  if (!heavy) {
    // ── 普通攻击（单目标）───────────────────────────────
    if (manhattan(boss.pos, floor.player) > boss.range) {
      return noop(state);
    }

    const damage = bossPhysicalDamage(state, baseAttack);
    const hp = Math.max(0, state.player.hp - damage);
    const dead = hp <= 0;

    const events: PveEvent[] = [{ type: 'PLAYER_DAMAGED', damage, hp, sourceId: bossId }];
    if (dead) events.push({ type: 'PLAYER_DEAD' });

    return {
      state: {
        ...state,
        status: dead ? 'DEAD' : state.status,
        player: { ...state.player, hp },
        floorState: { ...floor, status: dead ? 'DEAD' : floor.status },
      },
      events,
    };
  }

  // ── 蓄力重击（同心圆 AOE）────────────────────────────
  // 无论是否命中，都标记本次重击实际结算的中心点（boss 当前位置），供 UI 显示「实际命中区域」。
  const resolvedEvent: PveEvent = { type: 'HEAVY_STRIKE_RESOLVED', bossId, center: boss.pos };

  const playerDist = manhattan(boss.pos, floor.player);
  if (playerDist > HEAVY_STRIKE_RANGE) {
    return { state, events: [resolvedEvent] }; // 玩家在爆炸范围外
  }

  // 检查石块遮挡：若有石块在 boss→player 路径上则吸收此次爆炸
  const blockingRockId = findBlockingRock(floor.entities, boss.pos, floor.player, HEAVY_STRIKE_RANGE);
  if (blockingRockId) {
    return {
      state: {
        ...state,
        floorState: {
          ...floor,
          entities: floor.entities.map((e) =>
            e.id === blockingRockId ? { ...e, consumed: true } : e,
          ),
        },
      },
      events: [resolvedEvent, { type: 'ROCK_DESTROYED', entityId: blockingRockId }],
    };
  }

  // 按距离计算伤害倍率：内圈×HEAVY_STRIKE_MULTIPLIER，外圈×HEAVY_STRIKE_OUTER_MULTIPLIER
  const mult = playerDist <= HEAVY_STRIKE_INNER_RANGE ? HEAVY_STRIKE_MULTIPLIER : HEAVY_STRIKE_OUTER_MULTIPLIER;
  const damage = bossPhysicalDamage(state, baseAttack, mult);

  const hp = Math.max(0, state.player.hp - damage);
  const dead = hp <= 0;

  const events: PveEvent[] = [resolvedEvent, { type: 'PLAYER_DAMAGED', damage, hp, sourceId: bossId }];
  if (dead) events.push({ type: 'PLAYER_DEAD' });

  return {
    state: {
      ...state,
      status: dead ? 'DEAD' : state.status,
      player: { ...state.player, hp },
      floorState: {
        ...floor,
        status: dead ? 'DEAD' : floor.status,
      },
    },
    events,
  };
}

/**
 * 哥布林酋长增援号角：召唤哥布林战士 ×HORN_WARRIOR_COUNT（非狂暴=1）；
 * 狂暴状态下召唤数提升为 HORN_WARRIOR_ENRAGE_COUNT（=2）。
 * 为避免久战时怪物数量失控，场上同时存活的号角召唤兵数量被限制在
 * GOBLIN_CHIEF_SUMMON_CAP 以内；达到上限时本次号角不再继续加怪。
 * 怪物生成在 boss 相邻空格，格子不足时少召唤。
 */
export function goblinChiefHorn(state: ExpeditionState, bossId: string): ApplyResult {
  const floor = state.floorState;
  const boss = floor.monsters.find((m) => m.id === bossId);
  if (!boss || boss.type !== 'BOSS' || boss.bossId !== 'GOBLIN_CHIEF' || boss.aiState === 'DEAD') {
    return { state, events: [] };
  }

  const enraged = boss.hp <= GOBLIN_CHIEF_ENRAGE_HP;
  const warriorCount = enraged ? HORN_WARRIOR_ENRAGE_COUNT : HORN_WARRIOR_COUNT;
  const activeSummonedCount = floor.monsters.filter((m) => m.aiState !== 'DEAD' && m.summoned).length;
  const summonQuota = Math.max(0, GOBLIN_CHIEF_SUMMON_CAP - activeSummonedCount);
  if (summonQuota <= 0) {
    return { state, events: [] };
  }
  const actualSummonCount = Math.min(warriorCount, summonQuota);

  const freeCells = getAdjacentFreeCells(floor, boss.pos, actualSummonCount);
  const newMonsters: Monster[] = [];
  const events: PveEvent[] = [];

  for (let i = 0; i < actualSummonCount && i < freeCells.length; i++) {
    const pos = freeCells[i];
    // summoned: 增援召唤的战士击杀后不掉落（金币/灵气/装备），避免刷增援白嫖收益
    const m = { ...makeGoblinWarrior(`mon_horn_${floor.turn}_w${i}`, pos), summoned: true };
    newMonsters.push(m);
    events.push({ type: 'MONSTER_SPAWNED', monsterId: m.id, pos });
  }

  return {
    state: {
      ...state,
      floorState: { ...floor, monsters: [...floor.monsters, ...newMonsters] },
    },
    events,
  };
}

/**
 * 哥布林酋长必掉装备（50% 概率，design §6「Boss 必掉装备」/ AC-10）。
 * 返回 EquipItem 或 undefined（未掉落）。
 */
export function rollGuaranteedDrop(rng: Rng): EquipItem {
  return {
    id: `equip_goblin_chief_${rng.int(100000, 999999)}`,
    slot: 'WEAPON',
    quality: 'RARE',
    name: '哥布林酋长的战斧',
    baseStat: 30,
    trait: 'on_hit_lifesteal_1',
  };
}
