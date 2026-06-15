// 远征运行态生命周期（design §2 / §14）：开局、回合推进、楼层切换、存档序列化、死亡结算。
// 这是 PVE core 的编排层 —— 组合 MapGenerator/ApSystem/MonsterAI 等纯逻辑模块，
// 仍保持零框架依赖、确定性（同 runSeed + 同操作序列 → 同结果，AC-13），供 Controller 与云端复算调用。

import { rollAp } from './ApSystem';
import { traitCount } from './AnimaSystem';
import { recordPlayerActionForMirror } from './bosses/FateGuardian';
import { stepMonsters } from './MonsterAI';
import { generateFloor } from './MapGenerator';
import { getAwakenEligible } from './ClassSystem';
import { applyFragmentBonus, buildPendingTreeChoices, deriveTreeRng, getTreeBonuses } from './DestinyTreeSystem';
import { relicOnNewFloor } from './RelicSystem';
import { isPlayerBurnImmune, tickMonsterDots } from './BossEquipTraitEffects';
import {
  ANIMA_PER_STRENGTHEN,
  AP_CARRY_CAP,
  CHAPTER4_LAVA_TILE_DAMAGE,
  INITIAL_ANIMA,
  INITIAL_CLASS,
  INITIAL_GOLD,
  INITIAL_HP,
  TOTAL_FLOORS,
  chapterOfFloor,
  isBossFloor,
} from './PveConstants';
import { createRng, hashSeed } from './rng';
import type { ApplyResult, Coord, DestinyTreeBonuses, ExpeditionState, FixedEntity, FloorState, PendingTreeChoice, PveEvent, PveMeta, RunPlayer } from './PveTypes';

/** 由远征种子派生每层独立种子，保证同一远征内各层布局确定且互不干扰。 */
function deriveFloorSeed(runSeed: number, floor: number): number {
  return hashSeed(`${runSeed}:floor:${floor}`);
}

/**
 * 创建初始玩家：基础属性叠加命运树快照（treeBonuses）：
 *   A1/A2/E1 → maxHp/hp 加成；C1 → 开局金币；D1 → 开局灵气；
 *   D2 → 强化阈值 ×系数；B3 → 随机可进阶职业碎片 +N（消耗 rng）。
 */
function createInitialPlayer(treeBonuses: DestinyTreeBonuses, rng: ReturnType<typeof createRng>): RunPlayer {
  const maxHp = INITIAL_HP + treeBonuses.maxHpBonus;
  const animaThreshold = Math.ceil(ANIMA_PER_STRENGTHEN * treeBonuses.strengthenThresholdMult);

  return {
    hp: maxHp,
    maxHp,
    gold: INITIAL_GOLD + treeBonuses.startGoldBonus,
    anima: INITIAL_ANIMA + treeBonuses.startAnimaBonus,
    animaProgress: treeBonuses.startAnimaBonus,
    animaThreshold,
    classId: INITIAL_CLASS,
    classTraits: [],
    equipment: {},
    classFragments: applyFragmentBonus(rng, {}, treeBonuses.fragmentBonus),
    treeBonuses,
  };
}

/**
 * 为新楼层掷出本回合 AP 并写回 floorState（turn 重置为 1）。
 * playerTraits 非空时应用 strengthen_ap_up 加成（每个 +1 AP 上限，可叠加）；
 * apDiceBonus 为命运树 B2「急行军」骰子上限加成（treeBonuses.apDiceBonus）。
 */
function startFloorTurn(generated: FloorState, playerTraits?: readonly string[], apDiceBonus = 0): FloorState {
  const rng = createRng(generated.rngState);
  const { dice, ap } = rollAp(rng);
  const apBonus = playerTraits ? traitCount(playerTraits, 'strengthen_ap_up') : 0;
  const finalAp = ap + apBonus + apDiceBonus;
  return { ...generated, ap: finalAp, maxAp: finalAp, dice, turn: 1, rngState: rng.state() };
}

function collectRevealedCells(revealed: boolean[][]): Coord[] {
  const cells: Coord[] = [];
  for (let y = 0; y < revealed.length; y++) {
    for (let x = 0; x < revealed[y].length; x++) {
      if (revealed[y][x]) cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * 开启一次新远征：生成第 1 层、初始化玩家与首回合 AP。
 * meta（可选）：玩家局外元进度，命运树效果（meta.unlockedTreeNodes）在此处一次性
 * 计算并固化为 player.treeBonuses；E2/E3 三选一产生的待选项写入 pendingTreeChoices。
 */
export function startExpedition(runSeed: number, meta?: PveMeta): ExpeditionState {
  const floor = 1;
  const treeBonuses = getTreeBonuses(meta?.unlockedTreeNodes);
  const treeRng = deriveTreeRng(runSeed);
  const player = createInitialPlayer(treeBonuses, treeRng);
  // 遗物图鉴快照：开局从元数据复制到 player.codexRelics，供 Boss 掉落「图鉴已解锁 +10%」判定。
  // 本场拾取新遗物时也会写入此字段，远征结束由 Controller 同步回云端 codex.relics。
  if (meta?.codex?.relics && meta.codex.relics.length > 0) {
    player.codexRelics = [...meta.codex.relics];
  }

  // 新游戏玩家无词条，传空数组（保持函数签名一致）
  const floorState = startFloorTurn(generateFloor(floor, deriveFloorSeed(runSeed, floor)), [], treeBonuses.apDiceBonus);
  const { choices: pendingTreeChoices } = buildPendingTreeChoices(treeRng, treeBonuses, player.classId);

  return {
    runSeed,
    chapter: chapterOfFloor(floor),
    floor,
    status: 'ACTIVE',
    player,
    floorState,
    ...(pendingTreeChoices.length > 0 ? { pendingTreeChoices } : {}),
  };
}

/**
 * 结束当前回合：怪物按 AI 行动一次，随后开启下一回合并重新掷 AP（AC-3）。
 * 远征非 ACTIVE 或楼层已通关时为 no-op；怪物行动导致玩家阵亡则停在 DEAD，不再开启新回合。
 */
export function endTurn(state: ExpeditionState): ApplyResult {
  if (state.status !== 'ACTIVE' || state.floorState.status !== 'EXPLORING') {
    return { state, events: [] };
  }

  const events: PveEvent[] = [{ type: 'TURN_END', turn: state.floorState.turn }];

  // 命运守卫行为镜像：玩家回合结束、怪物回合开始之前，记录玩家本回合行为到活镜像的 pendingBehavior
  // （ATTACK > MOVE > IDLE 优先级互斥；镜像在下个怪物回合按此执行）。
  const attackedThisTurn = !!state.floorState.playerAttackedThisTurn;
  const stepsThisTurn = state.floorState.playerStepsThisTurn ?? 0;
  const mirrorRecord = recordPlayerActionForMirror(state, attackedThisTurn, stepsThisTurn);
  events.push(...mirrorRecord.events);

  const aiResult = stepMonsters(mirrorRecord.state);
  events.push(...aiResult.events);
  if (aiResult.state.status === 'DEAD') {
    return { state: aiResult.state, events };
  }

  const rng = createRng(aiResult.state.floorState.rngState);
  const { dice, ap } = rollAp(rng);
  const apBonus = traitCount(aiResult.state.player.classTraits, 'strengthen_ap_up');
  const treeApBonus = aiResult.state.player.treeBonuses?.apDiceBonus ?? 0;
  const nextTurn = aiResult.state.floorState.turn + 1;

  // AP 结转：上回合剩余 AP 按 min(剩余, AP_CARRY_CAP + 命运树B2加成) 加到本回合上限
  const carryCap = AP_CARRY_CAP + (aiResult.state.player.treeBonuses?.apCarryCapBonus ?? 0);
  const carryAp = Math.min(aiResult.state.floorState.ap, carryCap);
  let finalAp = ap + apBonus + treeApBonus + carryAp;

  // 命运守卫 E5 命运封锁：上一个 Boss 回合写入 destinyLockNextTurn=true → 本回合 AP 减半（最少 1）
  const destinyLocked = !!aiResult.state.floorState.destinyLockNextTurn;
  if (destinyLocked) {
    finalAp = Math.max(1, Math.floor(finalAp / 2));
  }

  events.push({ type: 'AP_ROLLED', turn: nextTurn, dice, ap: finalAp });
  if (carryAp > 0) events.push({ type: 'AP_CARRIED', amount: carryAp });
  if (destinyLocked) events.push({ type: 'DESTINY_AP_LOCKED', nextTurnAp: finalAp });

  // Boss 装备 trait: boss_burn_immune（焰心护胸）→ 玩家完全免疫熔岩/赤炎灼烧
  const burnImmune = isPlayerBurnImmune(aiResult.state.player.equipment);

  // 熔岩领主灼烧 tick：每回合开始时 -10 HP（×10 基准，原 -1）
  const burnRemaining = aiResult.state.floorState.playerBurnRemaining ?? 0;
  let burnedHp = aiResult.state.player.hp;
  let newBurnRemaining = burnRemaining;
  let burnDead = false;
  if (burnRemaining > 0 && !burnImmune) {
    burnedHp = Math.max(0, burnedHp - 10);
    newBurnRemaining = burnRemaining - 1;
    burnDead = burnedHp <= 0;
    events.push({ type: 'BURN_TICK', damage: 10, hp: burnedHp });
    if (burnDead) events.push({ type: 'PLAYER_DEAD' });
  } else if (burnImmune && burnRemaining > 0) {
    newBurnRemaining = 0; // 免疫时直接清空灼烧状态
  }

  // 赤炎哥布林灼烧 DoT：每回合累计 5HP（×10 基准，原 0.5HP），累计满 10 时结算一次整数伤害
  const fireBurnRounds = aiResult.state.floorState.playerFireBurnRounds ?? 0;
  const fireBurnAccum = aiResult.state.floorState.playerFireBurnAccum ?? 0;
  let newFireBurnRounds = fireBurnRounds;
  let newFireBurnAccum = fireBurnAccum;
  if (fireBurnRounds > 0 && !burnDead && !burnImmune) {
    const newAccum = fireBurnAccum + 5;
    const fireDmg = Math.floor(newAccum / 10) * 10;
    newFireBurnAccum = newAccum - fireDmg;
    newFireBurnRounds = fireBurnRounds - 1;
    if (fireDmg > 0) {
      burnedHp = Math.max(0, burnedHp - fireDmg);
      burnDead = burnedHp <= 0;
      events.push({ type: 'BURN_TICK', damage: fireDmg, hp: burnedHp });
      if (burnDead) events.push({ type: 'PLAYER_DEAD' });
    }
  } else if (burnImmune) {
    newFireBurnRounds = 0;
    newFireBurnAccum = 0;
  }

  // 怪物 DoT tick（流血 / 灼烧 — boss_bleed_on_hit / boss_burn_on_hit 装备 trait）：
  // 在玩家结算后处理，怪物可能因此死亡（不触发掉落，因为不是玩家直接击杀；避免装备 DoT 农怪刷资源）
  const dotResult = tickMonsterDots(aiResult.state.floorState.monsters);
  const dotMonsters = dotResult.monsters;

  // 移动AP惩罚倒计时
  const moveApPenaltyRounds = aiResult.state.floorState.playerMoveApPenaltyRounds ?? 0;
  const newMoveApPenaltyRounds = Math.max(0, moveApPenaltyRounds - 1);

  // 限时地块倒计时：凡带 remaining 的未消耗实体（LAVA_TILE 熔岩 / ICE_TILE 冰面 / 动态 SAND_PIT 流沙）
  // 每回合结束 remaining-1，归零移除；无 remaining 的实体（静态沙坑/石块/冰墙等）永久保留。
  // 熔岩地块额外：玩家踩入扣 CHAPTER4_LAVA_TILE_DAMAGE。
  let lavaHp = burnedHp;
  let lavaDead = burnDead;
  let hpChanged = burnRemaining > 0 || (fireBurnRounds > 0 && Math.floor((fireBurnAccum + 5) / 10) > 0);
  const entitiesAfterLava: FixedEntity[] = [];
  for (const entity of aiResult.state.floorState.entities) {
    if (entity.consumed) {
      entitiesAfterLava.push(entity);
      continue;
    }
    // 熔岩地块踩入扣血：与 remaining 倒计时解耦，永久格子（无 remaining）同样生效。
    if (entity.type === 'LAVA_TILE') {
      const playerOnTile =
        aiResult.state.floorState.player.x === entity.pos.x && aiResult.state.floorState.player.y === entity.pos.y;
      if (playerOnTile && !lavaDead) {
        lavaHp = Math.max(0, lavaHp - CHAPTER4_LAVA_TILE_DAMAGE);
        lavaDead = lavaHp <= 0;
        hpChanged = true;
        events.push({ type: 'LAVA_TILE_DAMAGED', entityId: entity.id, damage: CHAPTER4_LAVA_TILE_DAMAGE });
        if (lavaDead) events.push({ type: 'PLAYER_DEAD' });
      }
    }
    if (entity.remaining === undefined) {
      entitiesAfterLava.push(entity);
      continue;
    }
    const remaining = entity.remaining - 1;
    if (remaining > 0) entitiesAfterLava.push({ ...entity, remaining });
  }

  const nextState: ExpeditionState = {
    ...aiResult.state,
    status: lavaDead ? 'DEAD' : aiResult.state.status,
    player: hpChanged
      ? { ...aiResult.state.player, hp: lavaHp }
      : aiResult.state.player,
    floorState: {
      ...aiResult.state.floorState,
      ap: finalAp,
      maxAp: finalAp,
      dice,
      turn: nextTurn,
      rngState: rng.state(),
      entities: entitiesAfterLava,
      monsters: dotMonsters, // 应用怪物 DoT tick 结果（流血/灼烧）
      playerBurnRemaining: newBurnRemaining > 0 ? newBurnRemaining : undefined,
      playerFireBurnRounds: newFireBurnRounds > 0 ? newFireBurnRounds : undefined,
      playerFireBurnAccum: newFireBurnRounds > 0 ? newFireBurnAccum : undefined,
      playerMoveApPenaltyRounds: newMoveApPenaltyRounds > 0 ? newMoveApPenaltyRounds : undefined,
      status: lavaDead ? 'DEAD' : aiResult.state.floorState.status,
      shoesFirstMoveDone: undefined, // 每回合开始时重置靴子首步免费标记
      shadowStrikeCount: 0, // 觉醒·影袭：每回合开始时重置可用次数
      destinyLockNextTurn: undefined, // 命运封锁本回合已结算（finalAp 已减半），清空
      playerAttackedThisTurn: undefined, // 命运守卫行为镜像：玩家本回合行为状态重置
      playerStepsThisTurn: undefined,
    },
  };

  return { state: nextState, events };
}

/**
 * 从存档恢复远征（design ddl-sql.md §1 / AC-11）：存档记录"已完成的层号"，
 * 续玩固定从下一层开始（不做层内断点续玩）。按 runSeed + 层号派生地图种子，
 * 与 advanceFloor 规则一致，保证云端可按相同规则复算（AC-13）。
 * 调用方须保证 `completedFloor < TOTAL_FLOORS`（已通关全部楼层应走结算流程，不会留有可续存档）。
 */
export function resumeExpedition(runSeed: number, completedFloor: number, player: RunPlayer): ApplyResult {
  const nextFloor = completedFloor + 1;
  const floorState = startFloorTurn(
    generateFloor(nextFloor, deriveFloorSeed(runSeed, nextFloor)),
    player.classTraits,
    player.treeBonuses?.apDiceBonus ?? 0,
  );
  const events: PveEvent[] = [
    { type: 'REVEAL', cells: collectRevealedCells(floorState.revealed) },
    { type: 'AP_ROLLED', turn: floorState.turn, dice: floorState.dice, ap: floorState.ap },
  ];

  return {
    state: {
      runSeed,
      chapter: chapterOfFloor(nextFloor),
      floor: nextFloor,
      status: 'ACTIVE',
      player,
      floorState,
    },
    events,
  };
}

/**
 * 推进到下一层：当前层须已 CLEARED，否则 no-op。最后一层通关后远征状态置为 COMPLETED。
 * 新楼层由 `runSeed + 层号` 派生种子生成，保证可复现（AC-13）；产生 REVEAL 事件揭示出生点视野。
 */
export function advanceFloor(state: ExpeditionState): ApplyResult {
  if (state.floorState.status !== 'CLEARED') {
    return { state, events: [] };
  }

  // 章节 Boss 层通关时记录"已通关最大章节"，供二阶觉醒条件判定使用。
  const clearedChapter = chapterOfFloor(state.floor);
  const player: RunPlayer = isBossFloor(state.floor) && (state.player.maxChapterCleared ?? 0) < clearedChapter
    ? { ...state.player, maxChapterCleared: clearedChapter }
    : state.player;

  const nextFloor = state.floor + 1;
  if (nextFloor > TOTAL_FLOORS) {
    return { state: { ...state, player, status: 'COMPLETED' }, events: [] };
  }

  const floorState = startFloorTurn(
    generateFloor(nextFloor, deriveFloorSeed(state.runSeed, nextFloor)),
    player.classTraits,
    player.treeBonuses?.apDiceBonus ?? 0,
  );
  const events: PveEvent[] = [
    { type: 'REVEAL', cells: collectRevealedCells(floorState.revealed) },
    { type: 'AP_ROLLED', turn: floorState.turn, dice: floorState.dice, ap: floorState.ap },
  ];

  // 击败章节 Boss 后若已满足其余觉醒条件，触发觉醒确认
  if (getAwakenEligible(player)) {
    events.push({ type: 'CLASS_CAN_AWAKEN', classId: player.classId });
  }

  let next: ExpeditionState = {
    ...state,
    chapter: chapterOfFloor(nextFloor),
    floor: nextFloor,
    status: 'ACTIVE',
    player,
    floorState,
  };

  // 遗物：流沙之心 — 进入新房间随机生成 2 格沙坑（消耗本层 rngState 推进，确定性）
  const relicResult = relicOnNewFloor(next);
  next = relicResult.state;
  events.push(...relicResult.events);

  return { state: next, events };
}

/**
 * 死亡结算（design §2.1 / AC-12）：清空局内进度 —— 装备、职业、职业词条、当前金币/灵气
 * （含本次远征收集的职业碎片进度），保留局外元进度（账户钻石/命运碎片/成就/图鉴，存于 users 集合，
 * 不在 ExpeditionState 范围内，由云端 settleRun 处理）。非 DEAD 状态时为 no-op。
 *
 * 命运树 A3「遗产意志」：保留 deathGoldRetentionPct 比例的金币（向下取整）而非清零。
 */
export function applyDeath(state: ExpeditionState): ApplyResult {
  if (state.status !== 'DEAD') {
    return { state, events: [] };
  }

  const retentionPct = state.player.treeBonuses?.deathGoldRetentionPct ?? 0;
  const retainedGold = INITIAL_GOLD + Math.floor(state.player.gold * retentionPct);

  const player: RunPlayer = {
    ...state.player,
    gold: retainedGold,
    anima: INITIAL_ANIMA,
    animaProgress: 0,
    classId: INITIAL_CLASS,
    classTraits: [],
    equipment: {},
    classFragments: {},
    awakenForm: undefined,
  };

  return {
    state: { ...state, player },
    events: [],
  };
}

/**
 * 仅开发调试：将远征状态快速跳至目标层（不产生任何事件，UI 不会播动画）。
 * 通过连续伪造"当前层已通关"再调用 advanceFloor 实现，复用现有楼层推进逻辑，
 * 保证各层随机种子与正式游戏完全一致（可复现 Boss 层布局）。
 * 配合 PveConstants.DEV_SKIP_TO_FLOOR 使用；正式构建时该常量应为 0，此函数不会被调用。
 */
export function devSkipToFloor(state: ExpeditionState, target: number): ExpeditionState {
  let s = state;
  while (s.floor < target && s.status === 'ACTIVE') {
    const cleared: ExpeditionState = {
      ...s,
      floorState: { ...s.floorState, status: 'CLEARED' },
    };
    const result = advanceFloor(cleared);
    if (result.state === cleared) break; // safety: advanceFloor 返回 no-op，防死循环
    s = result.state;
  }
  return s;
}

/** 序列化为可写入 pve_saves 的 JSON 字符串（ExpeditionState 为纯数据，含 RNG 种子可完整复原）。 */
export function serialize(state: ExpeditionState): string {
  return JSON.stringify(state);
}

/** 从存档 JSON 还原 ExpeditionState（与 serialize 互为逆操作）。 */
export function deserialize(json: string): ExpeditionState {
  return JSON.parse(json) as ExpeditionState;
}
