import { resumeFloorRuntime, startFloorRuntime } from './FloorChallengeLifecycle';
import {
  FLOOR_RUNTIME_VERSION,
  createFreshProfessionState,
  type FloorChallengeRuntimeState,
  type FloorProfessionRuntimeState,
  type FloorRuntimeStatus,
} from './FloorChallengeState';
import { createMinghenTriggerMemory, pruneMinghenMemory, type MinghenTriggerMemory } from './minghen/MinghenEffects';
import { getChapter1Objective } from './objectives/Chapter1Objectives';
import type { FloorObjectiveState, ObjectiveCommand, ObjectiveDefinition, ObjectiveEvent } from './objectives/FloorObjective';
import type { ApplyResult, Coord, ExpeditionState, PveEvent } from './PveTypes';
import type { FloorChallengeSnapshot, PveProfile } from './PveProgressionTypes';
import { chapterIdForFloor, isFloorContentReady } from './chapterRouting';
import { createChapter1ExpeditionState, createChapter1Monster } from './chapter1/Chapter1ExpeditionFactory';
import { createChapter2ExpeditionState, createChapter2Monster } from './chapter2/Chapter2ExpeditionFactory';
import { createChapter3ExpeditionState, createChapter3Monster } from './chapter3/Chapter3ExpeditionFactory';
import { createChapter4ExpeditionState, createChapter4Monster } from './chapter4/Chapter4ExpeditionFactory';
import { createChapter5ExpeditionState, createChapter5Monster } from './chapter5/Chapter5ExpeditionFactory';
import { generateChapter2Floor } from './chapter2/Chapter2FloorGenerator';
import { generateChapter3Floor } from './chapter3/Chapter3FloorGenerator';
import { generateChapter4Floor } from './chapter4/Chapter4FloorGenerator';
import { generateChapter5Floor } from './chapter5/Chapter5FloorGenerator';
import { getChapter2Objective } from './chapter2/Chapter2Objectives';
import { getChapter3Objective } from './chapter3/Chapter3Objectives';
import { getChapter4Objective } from './chapter4/Chapter4Objectives';
import { getChapter5Objective } from './chapter5/Chapter5Objectives';
import { dissolveHuntPressure } from './chapter2/HuntPressure';
import { CHAPTER1_FLOOR3_BLOCKER_IDS } from './chapter1/Chapter1FloorCatalog';
import { generateChapter1Floor } from './chapter1/Chapter1FloorGenerator';
import { createTutorialExpeditionState, shouldUseTutorialFloor } from '../tutorial/TutorialFloorFactory';
import { spawnObjectivePortal } from './FloorRules';
import { commitProfessionMove, endProfessionTurn } from './professions/ProfessionActionSystem';
import { gainSpirit } from './SpiritBurstSystem';
import { resolveMinghenEffects } from './minghen/MinghenEffects';
import { buildMinghenSpatialContext } from './minghen/MinghenCombatBridge';
import type { MinghenEventContext, MinghenHook } from './minghen/MinghenEventContext';
import { playerOnExtraMoveCostTerrain } from './minghen/SandMinghenBridge';
import { createPartnerBattleState } from './partner/PartnerSkillExecutor';
import {
  usePartnerSkill,
  type PartnerSkillResult,
} from './partner/PartnerSkillExecutor';
import type { PartnerBattleState } from './partner/PartnerTypes';
import { createRng } from './rng';
import { getChapter2FloorDefinition } from './chapter2/Chapter2FloorCatalog';
import { applyCoreBreakPressure } from './chapter3/CoreBreakPressure';
import { syncControlPointProgress, unfinishedControlPointAtPlayer } from './chapter3/ControlPointRage';
import { CHAPTER3_BOUNTY_IDS, F18_CORE, F21_BOSS_ID } from './chapter3/Chapter3FloorCatalog';
import { F23_VENT_IDS, F24_ESCORT_BASE, F24_ESCORT_CORE, F28_BOSS_ID } from './chapter4/Chapter4FloorCatalog';
import { applyLavaVentPressure } from './chapter4/LavaVentPressure';
import { applyLavaTideAdvance } from './chapter4/LavaTideAdvance';
import { applySafeZoneMigration, applySafeZoneOutsideDamage } from './chapter4/SafeZoneMigration';
import { applyProphecyEyePressure } from './chapter5/ProphecyEyePressure';
import {
  offerFloorDestinyRewrite,
  resolveFloorDestinyRewrite,
} from './chapter5/FateRewriteTrial';
import {
  F30_ELITE_ID,
  F31_CHOICE_BY_SEAL,
  F31_SEAL_IDS,
  F32_PROPHECY_EYE_IDS,
  F33_MIRROR_ID,
  F35_BOSS_ID,
} from './chapter5/Chapter5FloorCatalog';
import { CHAPTER5_FATE_REWRITE_INTERVAL } from './PveConstants';
import { applyLightSandstorm } from './chapter2/LightSandstorm';
import { expandSandPits } from './chapter2/SandPitExpansion';
import {
  markSandPitStepWaived,
  sandPitPenaltyReduction,
  shouldWaiveSandPitStep,
} from './minghen/SandMinghenBridge';
import { CHAPTER2_SAND_PIT_MOVE_PENALTY } from './PveConstants';
import { rushMonstersTowardPlayer } from './MonsterAI';

/** 第 6 / 13 层夜袭：整波刷出后立刻朝玩家冲锋格数。 */
export const WAVE_SPAWN_RUSH_STEPS = 4;

function getFloorObjective(floor: number): ObjectiveDefinition {
  const chapter = chapterIdForFloor(floor);
  if (chapter === 1) return getChapter1Objective(floor);
  if (chapter === 2) return getChapter2Objective(floor);
  if (chapter === 5) return getChapter5Objective(floor);
  if (chapter === 4) return getChapter4Objective(floor);
  return getChapter3Objective(floor);
}

export interface PersistentExpeditionBattleState {
  expedition: ExpeditionState;
  objective: FloorObjectiveState;
  pendingCommands: ObjectiveCommand[];
  profession: FloorProfessionRuntimeState;
  minghenMemory: MinghenTriggerMemory;
  /** 本层伙伴技能态；无携带时为 null。 */
  partnerBattle?: import('./partner/PartnerTypes').PartnerBattleState | null;
  rewardCatalog: {
    minghenIds: string[];
    equipmentIds: string[];
    optionalObjectiveIds: string[];
  };
}

export type PersistentExpeditionRuntime = FloorChallengeRuntimeState<PersistentExpeditionBattleState>;

export function syncRuntimeFromExpedition(
  runtime: PersistentExpeditionRuntime,
  expedition: ExpeditionState,
  now = Date.now(),
): PersistentExpeditionRuntime {
  return {
    ...runtime,
    status: expedition.status === 'DEAD' || expedition.floorState.status === 'DEAD'
      ? 'DEAD'
      : runtime.status,
    resources: {
      ...runtime.resources,
      hp: expedition.player.hp,
      maxHp: expedition.player.maxHp,
      ap: expedition.floorState.ap,
      maxAp: expedition.floorState.maxAp,
      spirit: runtime.resources.spirit,
    },
    profession: runtime.profession,
    turn: expedition.floorState.turn,
    rngState: expedition.floorState.rngState,
    battleState: { ...runtime.battleState, expedition, profession: runtime.profession },
    updatedAt: now,
  };
}

export interface PersistentFloorRuntimeOptions {
  /** 玩家已完成第一层新手引导时传 true；缺省（含未知/false）视为需要注入脚本化教学层。 */
  tutorialCompleted?: boolean;
}

export function createPersistentFloorRuntime(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
  options?: PersistentFloorRuntimeOptions,
  now = Date.now(),
): PersistentExpeditionRuntime {
  if (!isFloorContentReady(snapshot.floor)) throw new Error('FLOOR_CONTENT_NOT_READY');
  const chapterId = chapterIdForFloor(snapshot.floor);
  if (chapterId === 1) {
    const useTutorial = shouldUseTutorialFloor(snapshot.floor, options?.tutorialCompleted);
    let expedition = useTutorial
      ? createTutorialExpeditionState(snapshot, profile)
      : createChapter1ExpeditionState(snapshot, profile);
    // 新手教学层固定用战士出战，不受玩家当前选定职业影响，保证引导脚本可预测。
    const effectiveSnapshot: FloorChallengeSnapshot = useTutorial
      ? { ...snapshot, config: { ...snapshot.config, professionId: 'WARRIOR' } }
      : snapshot;
    const map = useTutorial
      ? null
      : generateChapter1Floor(snapshot.floor, snapshot.seed, snapshot.mode, false);
    const profession = createFreshProfessionState();
    let objective = getChapter1Objective(snapshot.floor).create();
    if (!useTutorial && snapshot.floor === 6) {
      const waveIds = expedition.floorState.monsters
        .filter((monster) => monster.id.startsWith('wave1_'))
        .map((monster) => monster.id);
      // 开局第一波与后续波一致：整波刷出后立刻朝玩家冲锋。
      expedition = rushMonstersTowardPlayer(expedition, WAVE_SPAWN_RUSH_STEPS, {
        monsterIds: waveIds,
        attackIfInRange: false,
        collapseMoves: true,
      }).state;
      objective = getChapter1Objective(6).apply(objective, {
        type: 'WAVE_SPAWNED',
        wave: 1,
        entityIds: waveIds,
      }).state;
    }
    const runtime = startFloorRuntime(effectiveSnapshot, {
      maxHp: expedition.player.maxHp,
      maxAp: expedition.floorState.maxAp,
    }, {
      expedition,
      objective,
      pendingCommands: [],
      profession,
      minghenMemory: createMinghenTriggerMemory(),
      rewardCatalog: {
        minghenIds: map ? [...map.minghenIds] : [],
        equipmentIds: map ? [...map.equipmentIds] : [],
        optionalObjectiveIds: map ? [...map.optionalObjectiveIds] : [],
      },
    }, now);
    return syncRuntimeFromExpedition(runtime, expedition, now);
  }
  if (chapterId === 2) {
    let expedition = createChapter2ExpeditionState(snapshot, profile);
    const map = generateChapter2Floor(snapshot.floor, snapshot.seed, snapshot.mode, false);
    const profession = createFreshProfessionState();
    let objective = getChapter2Objective(snapshot.floor).create();
    if (snapshot.floor === 13) {
      const waveIds = expedition.floorState.monsters
        .filter((monster) => monster.id.startsWith('wave1_'))
        .map((monster) => monster.id);
      expedition = rushMonstersTowardPlayer(expedition, WAVE_SPAWN_RUSH_STEPS, {
        monsterIds: waveIds,
        attackIfInRange: false,
        collapseMoves: true,
      }).state;
      objective = getChapter2Objective(13).apply(objective, {
        type: 'WAVE_SPAWNED',
        wave: 1,
        entityIds: waveIds,
      }).state;
    }
    const runtime = startFloorRuntime(snapshot, {
      maxHp: expedition.player.maxHp,
      maxAp: expedition.floorState.maxAp,
    }, {
      expedition,
      objective,
      pendingCommands: [],
      profession,
      minghenMemory: createMinghenTriggerMemory(),
      rewardCatalog: {
        minghenIds: [...map.minghenIds],
        equipmentIds: [...map.equipmentIds],
        optionalObjectiveIds: [...map.optionalObjectiveIds],
      },
    }, now);
    return syncRuntimeFromExpedition(runtime, expedition, now);
  }
  if (chapterId === 3) {
    let expedition = createChapter3ExpeditionState(snapshot, profile);
    const map = generateChapter3Floor(snapshot.floor, snapshot.seed, snapshot.mode, false);
    const profession = createFreshProfessionState();
    let objective = getChapter3Objective(snapshot.floor).create();
    if (snapshot.floor === 20) {
      const waveIds = expedition.floorState.monsters
        .filter((monster) => monster.id.startsWith('wave1_'))
        .map((monster) => monster.id);
      expedition = rushMonstersTowardPlayer(expedition, WAVE_SPAWN_RUSH_STEPS, {
        monsterIds: waveIds,
        attackIfInRange: false,
        collapseMoves: true,
      }).state;
      objective = getChapter3Objective(20).apply(objective, {
        type: 'WAVE_SPAWNED',
        wave: 1,
        entityIds: waveIds,
      }).state;
    }
    const runtime = startFloorRuntime(snapshot, {
      maxHp: expedition.player.maxHp,
      maxAp: expedition.floorState.maxAp,
    }, {
      expedition,
      objective,
      pendingCommands: [],
      profession,
      minghenMemory: createMinghenTriggerMemory(),
      rewardCatalog: {
        minghenIds: [...map.minghenIds],
        equipmentIds: [...map.equipmentIds],
        optionalObjectiveIds: [...map.optionalObjectiveIds],
      },
    }, now);
    return syncRuntimeFromExpedition(runtime, expedition, now);
  }
  if (chapterId === 5) {
    const expedition = createChapter5ExpeditionState(snapshot, profile);
    const map = generateChapter5Floor(snapshot.floor, snapshot.seed, snapshot.mode, false);
    const profession = createFreshProfessionState();
    const objective = getChapter5Objective(snapshot.floor).create();
    const runtime = startFloorRuntime(snapshot, {
      maxHp: expedition.player.maxHp,
      maxAp: expedition.floorState.maxAp,
    }, {
      expedition,
      objective,
      pendingCommands: [],
      profession,
      minghenMemory: createMinghenTriggerMemory(),
      rewardCatalog: {
        minghenIds: [...map.minghenIds],
        equipmentIds: [...map.equipmentIds],
        optionalObjectiveIds: [...map.optionalObjectiveIds],
      },
    }, now);
    return syncRuntimeFromExpedition(runtime, expedition, now);
  }
  let expedition = createChapter4ExpeditionState(snapshot, profile);
  const map = generateChapter4Floor(snapshot.floor, snapshot.seed, snapshot.mode, false);
  const profession = createFreshProfessionState();
  let objective = getChapter4Objective(snapshot.floor).create();
  if (snapshot.floor === 26) {
    const waveIds = expedition.floorState.monsters
      .filter((monster) => monster.id.startsWith('wave1_'))
      .map((monster) => monster.id);
    expedition = rushMonstersTowardPlayer(expedition, WAVE_SPAWN_RUSH_STEPS, {
      monsterIds: waveIds,
      attackIfInRange: false,
      collapseMoves: true,
    }).state;
    objective = getChapter4Objective(26).apply(objective, {
      type: 'WAVE_SPAWNED',
      wave: 1,
      entityIds: waveIds,
    }).state;
  }
  const runtime = startFloorRuntime(snapshot, {
    maxHp: expedition.player.maxHp,
    maxAp: expedition.floorState.maxAp,
  }, {
    expedition,
    objective,
    pendingCommands: [],
    profession,
    minghenMemory: createMinghenTriggerMemory(),
    rewardCatalog: {
      minghenIds: [...map.minghenIds],
      equipmentIds: [...map.equipmentIds],
      optionalObjectiveIds: [...map.optionalObjectiveIds],
    },
  }, now);
  return syncRuntimeFromExpedition(runtime, expedition, now);
}

export function resumePersistentRuntimeV2(
  snapshot: FloorChallengeSnapshot,
  serialized: string,
): PersistentExpeditionRuntime {
  return resumeFloorRuntime<PersistentExpeditionBattleState>(snapshot, serialized);
}

export function resumeOrRebuildPersistentRuntime(
  snapshot: FloorChallengeSnapshot,
  serialized: string,
  profile: PveProfile,
  now = Date.now(),
): PersistentExpeditionRuntime {
  let parsed: {
    version?: unknown;
    runtime?: { version?: unknown; battleState?: { expedition?: { isTutorialRun?: boolean } } };
  };
  try {
    parsed = JSON.parse(serialized) as typeof parsed;
  } catch (_err) {
    throw new Error('INVALID_FLOOR_RUNTIME_SAVE');
  }
  if (parsed.version === 1 && parsed.runtime?.version === 1) {
    return createPersistentFloorRuntime(snapshot, profile, undefined, now);
  }
  if (parsed.version !== FLOOR_RUNTIME_VERSION || parsed.runtime?.version !== FLOOR_RUNTIME_VERSION) {
    throw new Error('FLOOR_RUNTIME_VERSION_MISMATCH');
  }
  // 教学层保存时用「战士出战」的 effectiveSnapshot 冻结了 config；恢复时必须用同一套
  // effectiveSnapshot 重新冻结比对，否则玩家实际选定职业（非战士）会导致误判配置不匹配。
  const isTutorialRun = Boolean(parsed.runtime?.battleState?.expedition?.isTutorialRun);
  const effectiveSnapshot: FloorChallengeSnapshot = isTutorialRun
    ? { ...snapshot, config: { ...snapshot.config, professionId: 'WARRIOR' } }
    : snapshot;
  return resumePersistentRuntimeV2(effectiveSnapshot, serialized);
}

export function initialPersistentPresentationEvents(runtime: PersistentExpeditionRuntime): PveEvent[] {
  const floor = runtime.battleState.expedition.floorState;
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < floor.revealed.length; y += 1) {
    for (let x = 0; x < floor.revealed[y]!.length; x += 1) {
      if (floor.revealed[y]![x]) cells.push({ x, y });
    }
  }
  return [
    { type: 'REVEAL', cells },
    { type: 'AP_ROLLED', turn: floor.turn, dice: floor.dice, ap: floor.ap },
  ];
}

export function applyPersistentMinghenTurnChoice(
  runtime: PersistentExpeditionRuntime,
  minghenId: 'M23' | 'M24' | null,
): PersistentExpeditionRuntime {
  const turnKey = `MINGHEN_TURN_CHOICE:${runtime.turn}`;
  const baseMemory = pruneMinghenMemory(runtime.battleState.minghenMemory, runtime.turn);
  if (baseMemory.turnKeys.includes(turnKey)) {
    if (baseMemory === runtime.battleState.minghenMemory) return runtime;
    return { ...runtime, battleState: { ...runtime.battleState, minghenMemory: baseMemory } };
  }
  const memory = {
    eventKeys: [...baseMemory.eventKeys],
    turnKeys: [...baseMemory.turnKeys, turnKey],
    layerKeys: [...baseMemory.layerKeys],
    states: [...baseMemory.states],
  };
  memory.states = memory.states.filter((state) => state !== 'M23_ACTIVE' && state !== 'M24_ACTIVE' && state !== 'M24_SHIELD');
  if (!minghenId) return { ...runtime, battleState: { ...runtime.battleState, minghenMemory: memory } };
  const equipped = runtime.config.minghenLoadout.find((entry) => entry.id === minghenId);
  if (!equipped) return runtime;
  const expedition = runtime.battleState.expedition;
  const effect = resolveMinghenEffects([equipped], {
    eventId: `${runtime.turn}:turn-choice:${minghenId}`,
    hook: 'TURN_START',
    turn: runtime.turn,
    source: 'ACTIVE_ACTION',
    hp: expedition.player.hp,
    maxHp: expedition.player.maxHp,
    apLeft: expedition.floorState.ap,
    voluntary: true,
  }, memory);
  const hp = Math.max(1, Math.min(expedition.player.maxHp, expedition.player.hp + Math.round(effect.heal)));
  const ap = Math.max(0, expedition.floorState.ap + effect.apDelta);
  const nextExpedition = {
    ...expedition,
    player: { ...expedition.player, hp },
    floorState: { ...expedition.floorState, ap, maxAp: Math.max(expedition.floorState.maxAp, ap) },
  };
  return syncRuntimeFromExpedition({
    ...runtime,
    resources: {
      ...runtime.resources,
      hp,
      ap,
      maxAp: Math.max(runtime.resources.maxAp, ap),
      shield: Math.min(runtime.resources.maxHp, runtime.resources.shield + Math.round(effect.shield)),
      spirit: addSpiritUntilFull(runtime.resources.spirit, effect.spiritGain),
    },
    battleState: { ...runtime.battleState, expedition: nextExpedition, minghenMemory: memory },
  }, nextExpedition);
}

export function isPersistentMoveBlocked(runtime: PersistentExpeditionRuntime): boolean {
  return runtime.battleState.minghenMemory.states.includes('M24_ACTIVE');
}

function objectiveEventsFor(
  runtime: PersistentExpeditionRuntime,
  result: ApplyResult,
): ObjectiveEvent[] {
  const events: ObjectiveEvent[] = [];
  for (const event of result.events) {
    if (event.type === 'PICK_KEY') events.push({ type: 'KEY_ACQUIRED', keyId: event.entityId });
    else if (event.type === 'KILL') events.push({ type: 'ENTITY_KILLED', entityId: event.monsterId });
    else if (event.type === 'TARGET_ESCAPED') events.push({ type: 'TARGET_ESCAPED', entityId: event.entityId });
    else if (event.type === 'ALTAR_USED') events.push({ type: 'ALTAR_DESTROYED', altarId: event.entityId });
    else if (event.type === 'GUNPOWDER_BARREL_ACTIVATED') events.push({ type: 'GUNPOWDER_ACTIVATED', entityId: event.entityId });
    else if (event.type === 'BLAST_TARGET_DETONATED') events.push({ type: 'BLAST_DETONATED', entityId: event.entityId });
    else if (event.type === 'TURN_END') events.push({ type: 'PLAYER_TURN_ENDED' });
    else if (event.type === 'ICE_WALL_BROKEN') events.push({ type: 'ENTITY_DESTROYED', entityId: event.entityId });
    else if (event.type === 'PLAYER_DEAD') events.push({ type: 'PLAYER_DIED' });
    else if (event.type === 'VENT_SEALED') events.push({ type: 'VENT_SEALED', entityId: event.entityId });
    else if (event.type === 'FATE_CHOICE_SELECTED') {
      events.push({
        type: 'FATE_CHOICE_SELECTED',
        sealId: event.sealId,
        choice: event.choice,
      });
    }
    else if (event.type === 'ESCORT_ARRIVED') events.push({ type: 'ESCORT_ARRIVED', escortId: event.escortId });
    else if (event.type === 'ALLY_KILLED' && event.allyId === F24_ESCORT_CORE) {
      events.push({ type: 'ESCORT_DESTROYED', escortId: event.allyId });
    }
    else if (event.type === 'FLOOR_CLEARED') {
      events.push({ type: 'EXIT_INTERACTED', apPaid: runtime.floor === 5 ? 1 : 0 });
    }
  }
  if (result.state.status === 'DEAD' && !events.some((event) => event.type === 'PLAYER_DIED')) {
    events.push({ type: 'PLAYER_DIED' });
  }
  return events;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function isMonsterDeadOrMissing(
  monsters: readonly { id: string; hp: number; aiState?: string }[],
  id: string,
): boolean {
  const monster = monsters.find((entry) => entry.id === id);
  return !monster || monster.hp <= 0 || monster.aiState === 'DEAD';
}

function addSpiritUntilFull(current: number, gain: number): number {
  if (current >= 100 || gain <= 0) return Math.min(100, Math.max(0, current));
  return Math.min(100, current + gain);
}

function hasConsumedPortal(state: ExpeditionState): boolean {
  return state.floorState.entities.some((entity) => entity.type === 'PORTAL' && entity.consumed);
}

function findChapter1Floor3Altar(state: ExpeditionState, consumed?: boolean): ExpeditionState['floorState']['entities'][number] | undefined {
  return state.floorState.entities.find((entity) => (
    entity.type === 'ALTAR'
    && (consumed == null || entity.consumed === consumed)
  ));
}

/** 击杀型目标（精英/追逃/清哨/Boss）：门刷在目标尸体格，与第一章同类层一致。 */
function killTargetIdsForFloor(floor: number, objective?: FloorObjectiveState): string[] {
  const fromObjective = objective ? stringArray(objective.data.sentinelIds) : [];
  if (fromObjective.length > 0) return fromObjective;
  const bountyIds = objective ? stringArray(objective.data.bountyIds) : [];
  if (bountyIds.length > 0) return bountyIds;
  if (objective && typeof objective.data.targetId === 'string') return [objective.data.targetId];
  if (floor === 10) return ['F10_SENTINEL_1', 'F10_SENTINEL_2'];
  const targetIdByFloor: Record<number, string> = {
    2: 'FLOOR2_ELITE',
    4: 'GOBLIN_SENTINEL',
    7: 'GOBLIN_CHIEF',
    9: 'FLOOR9_ELITE',
    11: 'CHASE_TARGET',
    14: 'QUICKSAND_SCORPION',
    17: 'CHASE_TARGET',
    21: F21_BOSS_ID,
    28: F28_BOSS_ID,
    30: F30_ELITE_ID,
    33: F33_MIRROR_ID,
    35: F35_BOSS_ID,
  };
  const id = targetIdByFloor[floor];
  return id ? [id] : [];
}

/** 本批事件里最后一只目标击杀的尸体格——「怪死在哪，门出现在哪」。 */
function lastObjectiveKillPos(
  expedition: ExpeditionState,
  events: readonly PveEvent[],
  targetIds: readonly string[],
): { x: number; y: number } | undefined {
  if (targetIds.length === 0) return undefined;
  const idSet = new Set(targetIds);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (!event || event.type !== 'KILL' || !idSet.has(event.monsterId)) continue;
    const monster = expedition.floorState.monsters.find((entry) => entry.id === event.monsterId);
    if (monster) return { ...monster.pos };
  }
  return undefined;
}

/** 无击杀事件时：取仍在场上的目标格，优先靠近玩家（镜头下可见）。 */
function nearestTargetMonsterPos(
  floor: ExpeditionState['floorState'],
  targetIds: readonly string[],
): { x: number; y: number } | undefined {
  let best: { pos: { x: number; y: number }; dist: number } | undefined;
  for (const id of targetIds) {
    const monster = floor.monsters.find((entry) => entry.id === id);
    if (!monster) continue;
    const dist = Math.abs(monster.pos.x - floor.player.x) + Math.abs(monster.pos.y - floor.player.y);
    if (!best || dist < best.dist) best = { pos: { ...monster.pos }, dist };
  }
  return best?.pos;
}

function completionPortalPos(
  state: ExpeditionState,
  preferredPos?: { x: number; y: number },
  objective?: FloorObjectiveState,
): { x: number; y: number } {
  if (preferredPos) return { ...preferredPos };
  const floor = state.floorState;
  if (state.floor === 1) {
    // 拿钥匙即完成：门刷在钥匙格（玩家拾取处），与战报同时出现。
    return floor.entities.find((entity) => entity.type === 'KEY')?.pos
      ?? floor.player;
  }
  if (state.floor === 3) {
    return findChapter1Floor3Altar(state)?.pos
      ?? floor.entities.find((entity) => entity.type === 'ALTAR')?.pos
      ?? floor.player;
  }
  if (state.floor === 6 || state.floor === 13) {
    return { x: Math.floor(floor.size / 2), y: Math.floor(floor.size / 2) };
  }
  if (state.floor === 5) {
    return floor.entities.find((entity) => entity.id === 'F5_BLAST_TARGET')?.pos
      ?? floor.player;
  }
  if (state.floor === 8) {
    return floor.entities.find((entity) => entity.type === 'KEY')?.pos
      ?? floor.player;
  }
  if (state.floor === 12) {
    return floor.entities.find((entity) => entity.type === 'EXIT')?.pos
      ?? floor.player;
  }
  if (state.floor === 15) {
    return floor.entities.find((entity) => entity.type === 'KEY')?.pos
      ?? floor.player;
  }
  if (state.floor === 22) {
    return floor.entities.find((entity) => entity.type === 'KEY')?.pos
      ?? floor.player;
  }
  if (state.floor === 29) {
    return floor.entities.find((entity) => entity.type === 'KEY')?.pos
      ?? floor.player;
  }
  if (state.floor === 18) {
    return floor.entities.find((entity) => entity.id === F18_CORE)?.pos
      ?? floor.player;
  }
  if (state.floor === 19 || state.floor === 20 || state.floor === 23 || state.floor === 25 || state.floor === 26
    || state.floor === 32 || state.floor === 34) {
    return { x: Math.floor(floor.size / 2), y: Math.floor(floor.size / 2) };
  }
  if (state.floor === 31 && objective?.kind === 'FATE_CHOICE' && objective.data.chosen === 'ESCAPE') {
    return floor.entities.find((entity) => entity.type === 'EXIT')?.pos
      ?? floor.player;
  }
  if (state.floor === 24) {
    return floor.entities.find((entity) => entity.id === F24_ESCORT_BASE)?.pos
      ?? floor.player;
  }
  if (state.floor === 27) {
    return floor.entities.find((entity) => entity.type === 'EXIT')?.pos
      ?? floor.player;
  }
  const killTargets = killTargetIdsForFloor(state.floor, objective);
  if (killTargets.length > 0) {
    return nearestTargetMonsterPos(floor, killTargets) ?? floor.player;
  }
  return floor.entities.find((entity) => entity.type === 'EXIT' && entity.consumed)?.pos
    ?? floor.entities.find((entity) => entity.type === 'EXIT')?.pos
    ?? floor.player;
}

function openCompletionPortal(
  expedition: ExpeditionState,
  preferredPos?: { x: number; y: number },
  objective?: FloorObjectiveState,
): { expedition: ExpeditionState; events: PveEvent[] } {
  const portal = spawnObjectivePortal(
    expedition,
    completionPortalPos(expedition, preferredPos, objective),
  );
  return { expedition: portal.state, events: portal.events };
}

function extendPersistentEvents(
  runtime: PersistentExpeditionRuntime,
  expedition: ExpeditionState,
  events: readonly PveEvent[],
): { runtime: PersistentExpeditionRuntime; expedition: ExpeditionState } {
  let nextRuntime = runtime;
  let nextExpedition = expedition;
  const pruned = pruneMinghenMemory(runtime.battleState.minghenMemory, expedition.floorState.turn);
  const memory = {
    eventKeys: [...pruned.eventKeys],
    turnKeys: [...pruned.turnKeys],
    layerKeys: [...pruned.layerKeys],
    states: [...pruned.states],
  };
  const applyHook = (
    hook: MinghenHook,
    event: PveEvent,
    index: number,
    targetId?: string,
    overrides?: Partial<MinghenEventContext>,
  ): void => {
    const target = targetId
      ? nextExpedition.floorState.monsters.find((monster) => monster.id === targetId)
      : undefined;
    const movePos = event.type === 'MOVE' && event.entityId === 'PLAYER' ? event.to : nextExpedition.floorState.player;
    const onExtraTerrain = playerOnExtraMoveCostTerrain(nextExpedition.floorState.entities, movePos);
    const envSource = event.type === 'SANDSTORM_HIT'
      || (event.type === 'PLAYER_DAMAGED' && (event.sourceId === 'SANDSTORM' || event.sourceId === 'ENVIRONMENT'));
    const context: MinghenEventContext = {
      eventId: `${nextExpedition.floorState.turn}:${index}:${event.type}:${hook}`,
      hook,
      turn: nextExpedition.floorState.turn,
      source: envSource ? 'ENVIRONMENT' : event.type === 'PLAYER_DAMAGED' ? 'ENEMY' : 'ACTIVE_ACTION',
      hp: nextExpedition.player.hp,
      maxHp: nextExpedition.player.maxHp,
      shield: nextRuntime.resources.shield,
      apLeft: nextExpedition.floorState.ap,
      targetId,
      targetHpRatio: target ? target.hp / Math.max(1, target.maxHp) : undefined,
      targetHasStatus: target ? Boolean(target.bleedRounds || target.poisonRounds || target.burnRounds || target.frozenRounds) : false,
      movedThisTurn: (nextExpedition.floorState.playerStepsThisTurn ?? 0) > 0,
      attackedThisTurn: Boolean(nextExpedition.floorState.playerAttackedThisTurn),
      actualDamage: event.type === 'PLAYER_DAMAGED'
        ? event.damage
        : event.type === 'SANDSTORM_HIT'
          ? event.damage
          : undefined,
      environmentDamage: event.type === 'SANDSTORM_HIT' ? event.damage : undefined,
      action: event.type === 'MOVE' ? 'MOVE' : event.type === 'ATTACK' ? 'ATTACK' : undefined,
      enteredDangerousTerrain: event.type === 'MOVE' && event.entityId === 'PLAYER' ? onExtraTerrain : undefined,
      activeMoveStepsThisTurn: nextExpedition.floorState.playerStepsThisTurn ?? 0,
      ...buildMinghenSpatialContext(nextExpedition, targetId, movePos),
      ...overrides,
    };
    const effect = resolveMinghenEffects(nextRuntime.config.minghenLoadout, context, memory);
    if (effect.spiritGain > 0) {
      nextRuntime = {
        ...nextRuntime,
        resources: { ...nextRuntime.resources, spirit: addSpiritUntilFull(nextRuntime.resources.spirit, effect.spiritGain) },
      };
    }
    const apGain = effect.apDelta + effect.moveCostReduction;
    if (apGain !== 0) {
      const ap = Math.max(0, Math.min(nextExpedition.floorState.maxAp, nextExpedition.floorState.ap + apGain));
      nextExpedition = { ...nextExpedition, floorState: { ...nextExpedition.floorState, ap } };
      nextRuntime = { ...nextRuntime, resources: { ...nextRuntime.resources, ap } };
    }
    if (effect.shield > 0) {
      nextRuntime = {
        ...nextRuntime,
        resources: {
          ...nextRuntime.resources,
          shield: Math.min(nextRuntime.resources.maxHp, nextRuntime.resources.shield + Math.round(effect.shield)),
        },
      };
    }
    if (effect.heal !== 0) {
      const hp = Math.max(1, Math.min(nextExpedition.player.maxHp, nextExpedition.player.hp + Math.round(effect.heal)));
      nextExpedition = { ...nextExpedition, player: { ...nextExpedition.player, hp } };
    }
    if (target && effect.applyStatuses.length > 0) {
      nextExpedition = {
        ...nextExpedition,
        floorState: {
          ...nextExpedition.floorState,
          monsters: nextExpedition.floorState.monsters.map((monster) => {
            if (monster.id !== target.id) return monster;
            let patched = monster;
            for (const status of effect.applyStatuses) {
              if (status.id === 'BLEED') patched = { ...patched, bleedRounds: (patched.bleedRounds ?? 0) + status.stacks };
              if (status.id === 'POISON') patched = { ...patched, poisonRounds: (patched.poisonRounds ?? 0) + status.stacks, poisonDamage: 3 };
              if (status.id === 'BURN') patched = { ...patched, burnRounds: (patched.burnRounds ?? 0) + status.stacks };
              if (status.id === 'CHILL') patched = { ...patched, frozenRounds: (patched.frozenRounds ?? 0) + status.stacks };
            }
            return patched;
          }),
        },
      };
    }
  };
  events.forEach((event, index) => {
    if (event.type === 'MOVE' && event.entityId === 'PLAYER') {
      applyHook('BEFORE_MOVE', event, index);
      applyHook('AFTER_MOVE', event, index);
    }
    // 主动攻击相关命痕由 PersistentCombatRules 在原攻击链前后处理，避免重复触发。
    if (event.type === 'PLAYER_DAMAGED') {
      nextRuntime = gainSpirit(nextRuntime, { type: 'PLAYER_DAMAGED', actualDamage: event.damage });
      applyHook('DAMAGED', event, index);
    }
    if (event.type === 'SANDSTORM_HIT') {
      applyHook('DAMAGED', event, index);
    }
    if (event.type === 'PLAYER_SHIELD_BROKEN') {
      applyHook('SHIELD_BROKEN', event, index);
    }
    if (
      event.type === 'GUNPOWDER_BARREL_ACTIVATED'
      || event.type === 'BLAST_TARGET_DETONATED'
      || event.type === 'PICK_KEY'
      || event.type === 'ALTAR_USED'
      || event.type === 'VENT_SEALED'
    ) {
      applyHook('TASK_INTERACT', event, index, undefined, { isTaskInteract: true });
      applyHook('TASK_INTERACT', event, index + 1000, undefined, { isTaskInteract: true });
    }
    if (event.type === 'HOT_SPRING_BLESSING') {
      if (event.effect === 'SHIELD') {
        nextRuntime = {
          ...nextRuntime,
          resources: {
            ...nextRuntime.resources,
            shield: Math.min(nextRuntime.resources.maxHp, nextRuntime.resources.shield + event.shield),
          },
        };
      } else {
        nextRuntime = {
          ...nextRuntime,
          resources: {
            ...nextRuntime.resources,
            spirit: addSpiritUntilFull(nextRuntime.resources.spirit, event.spirit),
          },
        };
      }
    }
    if (event.type === 'PICK_KEY') {
      nextRuntime = gainSpirit(nextRuntime, { type: 'KEY_OBJECTIVE', firstForEntity: true });
    }
    if (event.type === 'TURN_END') {
      applyHook('TURN_END', event, index);
      applyHook('TURN_START', event, index);
    }
  });
  nextRuntime = {
    ...nextRuntime,
    battleState: { ...nextRuntime.battleState, minghenMemory: memory },
  };
  return { runtime: nextRuntime, expedition: nextExpedition };
}

function isWaveSpawnMarker(entity: { id: string; type: string; consumed?: boolean }): boolean {
  if (entity.consumed) return false;
  return entity.type === 'WAVE_SPAWN_MARKER'
    || (entity.type === 'ALTAR' && entity.id.startsWith('WAVE_ALTAR_'));
}

function waveKindsForFloor(floor: number, wave: number): string[] {
  if (floor === 13) {
    const waves: Record<number, string[]> = {
      1: ['DESERT_RAIDER', 'DESERT_RAIDER'],
      2: ['DESERT_RAIDER', 'DESERT_HOPPER_LIZARD'],
      3: ['DESERT_RAIDER', 'DESERT_RAIDER', 'DESERT_HOPPER_LIZARD'],
      4: ['POISON_SCORPION', 'DESERT_RAIDER', 'DESERT_HOPPER_LIZARD'],
    };
    return waves[wave] ?? [];
  }
  if (floor === 20) {
    const waves: Record<number, string[]> = {
      1: ['SNOW_WOLF', 'SNOW_WOLF'],
      2: ['SNOW_WOLF', 'FROSTSPIKE_PORCUPINE'],
      3: ['SNOW_WOLF', 'FROSTSPIKE_PORCUPINE', 'FROST_SPRITE'],
      4: ['FROST_SPRITE', 'GLACIER_SHAPER', 'SNOW_WOLF'],
    };
    return waves[wave] ?? [];
  }
  if (floor === 26) {
    const waves: Record<number, string[]> = {
      1: ['ASH_HOUND', 'ASH_HOUND'],
      2: ['ASH_HOUND', 'LAVA_CRAB'],
      3: ['FIRE_ELEMENTAL'],
      4: ['SPIRIT_EMBER'],
    };
    return waves[wave] ?? [];
  }
  const waves: Record<number, string[]> = {
    1: ['GOBLIN_WARRIOR', 'GOBLIN_WARRIOR'],
    2: ['GOBLIN_WARRIOR', 'GOBLIN_ARCHER'],
    3: ['GOBLIN_WARRIOR', 'GOBLIN_WARRIOR', 'GOBLIN_ARCHER'],
    4: ['FROST_GOBLIN', 'GOBLIN_WARRIOR', 'GOBLIN_ARCHER'],
    5: ['FIRE_GOBLIN', 'FROST_GOBLIN', 'GOBLIN_WARRIOR', 'GOBLIN_ARCHER'],
  };
  return waves[wave] ?? [];
}

function spawnWave(
  runtime: PersistentExpeditionRuntime,
  wave: number,
): { expedition: ExpeditionState; spawnedIds: string[] } {
  const current = runtime.battleState.expedition;
  const kinds = waveKindsForFloor(current.floor, wave);
  const markerCells = current.floorState.entities
    .filter(isWaveSpawnMarker)
    .map((entity) => entity.pos);
  const spawnCells = markerCells.length > 0 ? markerCells : [{x:0,y:0},{x:8,y:0},{x:0,y:8},{x:8,y:8}];
  const createMonster = current.floor >= 29
    ? createChapter5Monster
    : current.floor >= 22
    ? createChapter4Monster
    : current.floor >= 15
      ? createChapter3Monster
      : current.floor >= 8
        ? createChapter2Monster
        : createChapter1Monster;
  const blocked = new Set<string>([
    `${current.floorState.player.x},${current.floorState.player.y}`,
    ...current.floorState.entities
      .filter((entity) => !entity.consumed && !isWaveSpawnMarker(entity))
      .map((entity) => `${entity.pos.x},${entity.pos.y}`),
    ...current.floorState.monsters
      .filter((monster) => monster.aiState !== 'DEAD' && monster.hp > 0)
      .map((monster) => `${monster.pos.x},${monster.pos.y}`),
  ]);
  const adjacentSpawnCells = spawnCells.flatMap((cell) => [
    { x: cell.x + 1, y: cell.y },
    { x: cell.x - 1, y: cell.y },
    { x: cell.x, y: cell.y + 1 },
    { x: cell.x, y: cell.y - 1 },
  ]).filter((cell) => cell.x >= 0 && cell.y >= 0 && cell.x < current.floorState.size && cell.y < current.floorState.size);
  // 优先落在刷怪点本格，其次相邻格，最后全图扫描。
  const fallbackCells = [...spawnCells, ...adjacentSpawnCells];
  for (let y = 0; y < current.floorState.size; y += 1) {
    for (let x = 0; x < current.floorState.size; x += 1) fallbackCells.push({ x, y });
  }
  const monsters = kinds.map((kind, index) => createMonster({
    id: `wave${wave}_${index}`,
    kind,
    pos: (() => {
      const preferred = spawnCells[index % spawnCells.length] ?? spawnCells[0]!;
      const selected = [preferred, ...fallbackCells].find((cell) => !blocked.has(`${cell.x},${cell.y}`));
      if (!selected) return { ...preferred };
      blocked.add(`${selected.x},${selected.y}`);
      return { ...selected };
    })(),
    role: current.floor === 6 && wave === 5 && index < 2 ? 'CLIMAX' : 'NORMAL',
    rewardEligible: false,
  }));
  const spawnedIds = monsters.map((monster) => monster.id);
  let expedition: ExpeditionState = {
    ...current,
    floorState: {
      ...current.floorState,
      monsters: [...current.floorState.monsters, ...monsters],
    },
  };
  // 整波同时刷出后立刻朝玩家冲锋 4 格，落点更靠近中场，避免玩家四角来回清剿。
  const rush = rushMonstersTowardPlayer(expedition, WAVE_SPAWN_RUSH_STEPS, {
    monsterIds: spawnedIds,
    attackIfInRange: false,
    collapseMoves: true,
  });
  let nextExpedition = rush.state;
  if (current.floor === 13 && wave > 1) {
    const expandCount = Number(getChapter2FloorDefinition(13).special?.expandPitsPerWave ?? 2);
    nextExpedition = expandSandPits(nextExpedition, expandCount);
  }
  return {
    expedition: nextExpedition,
    spawnedIds,
  };
}

function reconcileWaveSurvivalObjective(
  maxWave: number,
  objective: FloorObjectiveState,
  monsters: ExpeditionState['floorState']['monsters'],
  definition: ObjectiveDefinition,
  pendingCommands: ObjectiveCommand[],
): { objective: FloorObjectiveState; pendingCommands: ObjectiveCommand[] } {
  let nextObjective = objective;
  let nextCommands = [...pendingCommands];
  let currentWave = Number(nextObjective.data.currentWave ?? 0);
  if (currentWave === 0) {
    const wave1Ids = monsters.filter((monster) => monster.id.startsWith('wave1_')).map((monster) => monster.id);
    if (wave1Ids.length > 0) {
      const applied = definition.apply(nextObjective, {
        type: 'WAVE_SPAWNED',
        wave: 1,
        entityIds: wave1Ids,
      });
      nextObjective = applied.state;
      nextCommands.push(...applied.commands);
      currentWave = 1;
    }
  }
  currentWave = Number(nextObjective.data.currentWave ?? 0);
  if (currentWave >= 1) {
    const wavePrefix = `wave${currentWave}_`;
    const waveIds = monsters
      .filter((monster) => monster.id.startsWith(wavePrefix))
      .map((monster) => monster.id);
    const livingWaveIds = monsters
      .filter((monster) => (
        monster.id.startsWith(wavePrefix)
        && monster.hp > 0
        && monster.aiState !== 'DEAD'
      ))
      .map((monster) => monster.id);
    const tracked = stringArray(nextObjective.data.aliveIds);
    if (
      tracked.length === 0
      && waveIds.length > 0
      && nextObjective.status === 'ACTIVE'
      && !nextCommands.some((command) => command.type === 'SPAWN_WAVE')
    ) {
      nextObjective = {
        ...nextObjective,
        data: {
          ...nextObjective.data,
          aliveIds: waveIds,
        },
      };
    } else if (livingWaveIds.some((id) => !tracked.includes(id))) {
      nextObjective = {
        ...nextObjective,
        data: {
          ...nextObjective.data,
          aliveIds: [...new Set([...tracked, ...livingWaveIds])],
        },
      };
    }
    for (const aliveId of stringArray(nextObjective.data.aliveIds)) {
      if (isMonsterDeadOrMissing(monsters, aliveId)) {
        const applied = definition.apply(nextObjective, { type: 'ENTITY_KILLED', entityId: aliveId });
        nextObjective = applied.state;
        nextCommands.push(...applied.commands);
      }
    }
  }
  let preparationTurns = Number(nextObjective.data.preparationTurns ?? 0);
  while (preparationTurns > 0) {
    const applied = definition.apply(nextObjective, { type: 'PLAYER_TURN_ENDED' });
    nextObjective = applied.state;
    nextCommands.push(...applied.commands);
    preparationTurns = Number(nextObjective.data.preparationTurns ?? 0);
  }
  currentWave = Number(nextObjective.data.currentWave ?? 0);
  const livingCurrent = currentWave >= 1
    ? monsters.filter((monster) => (
      monster.id.startsWith(`wave${currentWave}_`)
      && monster.hp > 0
      && monster.aiState !== 'DEAD'
    ))
    : [];
  if (
    nextObjective.status === 'ACTIVE'
    && currentWave >= 1
    && currentWave < maxWave
    && livingCurrent.length === 0
    && stringArray(nextObjective.data.aliveIds).length === 0
    && !nextCommands.some((command) => command.type === 'SPAWN_WAVE')
  ) {
    const nextWave = currentWave + 1;
    const livingNext = monsters.some((monster) => (
      monster.id.startsWith(`wave${nextWave}_`)
      && monster.hp > 0
      && monster.aiState !== 'DEAD'
    ));
    if (!livingNext) {
      nextCommands.push({ type: 'WARN_WAVE', wave: nextWave });
      nextCommands.push({ type: 'SPAWN_WAVE', wave: nextWave });
    }
  }
  return { objective: nextObjective, pendingCommands: nextCommands };
}

export function applyPersistentBattleResult(
  runtime: PersistentExpeditionRuntime,
  result: ApplyResult,
  now = Date.now(),
): { runtime: PersistentExpeditionRuntime; result: ApplyResult } {
  if (runtime.status !== 'ACTIVE') return { runtime, result };
  let shield = runtime.resources.shield;
  let defendedHp = result.state.player.hp;
  let shieldAbsorbed = 0;
  let shieldBroken = false;
  const defendedEvents = result.events.map((event): PveEvent => {
    if (event.type !== 'PLAYER_DAMAGED' || shield <= 0 || event.damage <= 0) return event;
    const absorbed = Math.min(shield, event.damage);
    shield -= absorbed;
    shieldAbsorbed += absorbed;
    if (shield === 0) shieldBroken = true;
    defendedHp = Math.min(result.state.player.maxHp, defendedHp + absorbed);
    return { ...event, damage: event.damage - absorbed, hp: defendedHp };
  });
  if (shield !== runtime.resources.shield) {
    result = {
      state: { ...result.state, player: { ...result.state.player, hp: defendedHp } },
      events: shieldBroken ? [...defendedEvents, { type: 'PLAYER_SHIELD_BROKEN', absorbed: shieldAbsorbed }] : defendedEvents,
    };
    runtime = { ...runtime, resources: { ...runtime.resources, hp: defendedHp, shield } };
  }
  let professionRuntime = runtime;
  for (const event of result.events) {
    if (event.type === 'MOVE' && event.entityId === 'PLAYER') {
      if (professionRuntime.profession.rangerFreeMoveSteps > 0) {
        professionRuntime = {
          ...professionRuntime,
          profession: {
            ...professionRuntime.profession,
            rangerFreeMoveSteps: professionRuntime.profession.rangerFreeMoveSteps - 1,
          },
        };
        // 收招免费步：不耗职业 AP 账本、不增加连击（forced）
        professionRuntime = commitProfessionMove(professionRuntime, 0, true);
      } else {
        const observedCost = Math.max(1, professionRuntime.resources.ap - event.apLeft);
        professionRuntime = commitProfessionMove(professionRuntime, observedCost);
      }
    } else if (event.type === 'TURN_END') {
      professionRuntime = endProfessionTurn(professionRuntime, result.state.floorState.ap);
    }
  }
  const clearByPortal = result.events.some((event) => event.type === 'FLOOR_CLEARED') && hasConsumedPortal(result.state);
  if (result.events.some((event) => event.type === 'FLOOR_CLEARED') && !clearByPortal) {
    result = {
      state: {
        ...result.state,
        floorState: { ...result.state.floorState, status: 'EXPLORING' },
      },
      events: result.events,
    };
  }
  const extended = extendPersistentEvents(professionRuntime, result.state, result.events);
  professionRuntime = extended.runtime;
  if (runtime.floor === 12 && result.events.some((event) => event.type === 'TURN_END')) {
    const turnEvent = result.events.find((event) => event.type === 'TURN_END');
    const completedTurn = turnEvent && 'turn' in turnEvent ? Number(turnEvent.turn) : extended.expedition.floorState.turn - 1;
    const special = getChapter2FloorDefinition(12).special ?? {};
    const interval = Number(special.sandstormIntervalTurns ?? 2);
    if (completedTurn > 0 && completedTurn % interval === 0) {
      const rng = createRng(extended.expedition.floorState.rngState);
      const storm = applyLightSandstorm(extended.expedition, rng, {
        cellCount: Number(special.sandstormCells ?? 4),
        damage: Number(special.sandstormDamage ?? 10),
      }, {
        loadout: runtime.config.minghenLoadout,
        memory: professionRuntime.battleState.minghenMemory,
      });
      result = {
        state: storm.state,
        events: [...result.events, ...storm.events],
      };
      if (storm.memory) {
        professionRuntime = {
          ...professionRuntime,
          battleState: { ...professionRuntime.battleState, minghenMemory: storm.memory },
        };
      }
    } else {
      result = { ...result, state: extended.expedition };
    }
  } else if (runtime.floor === 18 && result.events.some((event) => event.type === 'TURN_END')) {
    const turnEvent = result.events.find((event) => event.type === 'TURN_END');
    const completedTurn = turnEvent && 'turn' in turnEvent ? Number(turnEvent.turn) : extended.expedition.floorState.turn - 1;
    result = {
      ...result,
      state: applyCoreBreakPressure(extended.expedition, completedTurn),
    };
  } else if (runtime.floor === 23 && result.events.some((event) => event.type === 'TURN_END')) {
    const turnEvent = result.events.find((event) => event.type === 'TURN_END');
    const completedTurn = turnEvent && 'turn' in turnEvent ? Number(turnEvent.turn) : extended.expedition.floorState.turn - 1;
    const vent = applyLavaVentPressure(extended.expedition, completedTurn);
    result = {
      ...result,
      state: vent.state,
      events: [...result.events, ...vent.events],
    };
  } else if (runtime.floor === 25 && result.events.some((event) => event.type === 'TURN_END')) {
    const turnEvent = result.events.find((event) => event.type === 'TURN_END');
    const completedTurn = turnEvent && 'turn' in turnEvent ? Number(turnEvent.turn) : extended.expedition.floorState.turn - 1;
    const migrated = applySafeZoneMigration(extended.expedition, completedTurn);
    const outside = applySafeZoneOutsideDamage(migrated.state);
    result = {
      ...result,
      state: outside.state,
      events: [...result.events, ...migrated.events, ...outside.events],
    };
  } else if (runtime.floor === 27 && result.events.some((event) => event.type === 'TURN_END')) {
    const turnEvent = result.events.find((event) => event.type === 'TURN_END');
    const completedTurn = turnEvent && 'turn' in turnEvent ? Number(turnEvent.turn) : extended.expedition.floorState.turn - 1;
    const tide = applyLavaTideAdvance(extended.expedition, completedTurn);
    result = {
      ...result,
      state: tide.state,
      events: [...result.events, ...tide.events],
    };
  } else if (runtime.floor === 32 && result.events.some((event) => event.type === 'TURN_END')) {
    const turnEvent = result.events.find((event) => event.type === 'TURN_END');
    const completedTurn = turnEvent && 'turn' in turnEvent ? Number(turnEvent.turn) : extended.expedition.floorState.turn - 1;
    const prophecy = applyProphecyEyePressure(extended.expedition, completedTurn);
    result = {
      ...result,
      state: prophecy.state,
      events: [...result.events, ...prophecy.events],
    };
  } else if (runtime.floor === 34 && result.events.some((event) => event.type === 'TURN_END')) {
    const turnEvent = result.events.find((event) => event.type === 'TURN_END');
    const completedTurn = turnEvent && 'turn' in turnEvent ? Number(turnEvent.turn) : extended.expedition.floorState.turn - 1;
    let nextState = extended.expedition;
    let extraEvents: PveEvent[] = [];
    if (nextState.floorState.pendingDestinyRewrite?.removed != null) {
      const resolved = resolveFloorDestinyRewrite(nextState);
      nextState = resolved.state;
      extraEvents = [...extraEvents, ...resolved.events];
    } else if (
      completedTurn > 0
      && completedTurn % CHAPTER5_FATE_REWRITE_INTERVAL === 0
      && !nextState.floorState.pendingDestinyRewrite
    ) {
      const offered = offerFloorDestinyRewrite(nextState);
      nextState = offered.state;
      extraEvents = [...extraEvents, ...offered.events];
    }
    result = {
      ...result,
      state: nextState,
      events: [...result.events, ...extraEvents],
    };
  } else {
    result = { ...result, state: extended.expedition };
  }
  if (result.events.some((event) => event.type === 'SAND_PIT_STEPPED')) {
    const memory = professionRuntime.battleState.minghenMemory;
    const loadout = runtime.config.minghenLoadout;
    const turn = result.state.floorState.turn;
    let refund = 0;
    if (shouldWaiveSandPitStep(loadout, memory, turn)) {
      refund = CHAPTER2_SAND_PIT_MOVE_PENALTY;
      markSandPitStepWaived(memory, turn);
    } else {
      refund = Math.min(CHAPTER2_SAND_PIT_MOVE_PENALTY, sandPitPenaltyReduction(loadout));
    }
    if (refund > 0) {
      result = {
        ...result,
        state: {
          ...result.state,
          floorState: {
            ...result.state.floorState,
            ap: Math.min(result.state.floorState.maxAp, result.state.floorState.ap + refund),
          },
        },
      };
      professionRuntime = {
        ...professionRuntime,
        battleState: { ...professionRuntime.battleState, minghenMemory: memory },
      };
    }
  }
  const definition = getFloorObjective(runtime.floor);
  let objective = runtime.battleState.objective;
  let pendingCommands: ObjectiveCommand[] = [];
  // 第一层：钥匙常由 afterApply 被动拾取。若漏走目标桥，战场 hasKey 与 objective 脱节
  // 会导致已拾钥却不刷通关门。以最终战场为准补齐 KEY_ACQUIRED。
  const objectiveEvents = objectiveEventsFor(runtime, result);
  if (runtime.floor === 1 && objective.kind === 'KEY_EXPLORE' && objective.status === 'ACTIVE') {
    if (result.state.floorState.hasKey && !objective.data.hasKey
      && !objectiveEvents.some((event) => event.type === 'KEY_ACQUIRED')) {
      const keyId = result.state.floorState.entities.find((entity) => entity.type === 'KEY')?.id ?? 'KEY';
      objectiveEvents.unshift({ type: 'KEY_ACQUIRED', keyId });
    }
  }
  if (runtime.floor === 8 && objective.kind === 'KEY_EXPLORE' && objective.status === 'ACTIVE') {
    if (result.state.floorState.hasKey && !objective.data.hasKey
      && !objectiveEvents.some((event) => event.type === 'KEY_ACQUIRED')) {
      const keyId = result.state.floorState.entities.find((entity) => entity.type === 'KEY')?.id ?? 'KEY';
      objectiveEvents.unshift({ type: 'KEY_ACQUIRED', keyId });
    }
  }
  if (runtime.floor === 15 && objective.kind === 'KEY_EXPLORE' && objective.status === 'ACTIVE') {
    if (result.state.floorState.hasKey && !objective.data.hasKey
      && !objectiveEvents.some((event) => event.type === 'KEY_ACQUIRED')) {
      const keyId = result.state.floorState.entities.find((entity) => entity.type === 'KEY')?.id ?? 'KEY';
      objectiveEvents.unshift({ type: 'KEY_ACQUIRED', keyId });
    }
  }
  if (runtime.floor === 22 && objective.kind === 'KEY_EXPLORE' && objective.status === 'ACTIVE') {
    if (result.state.floorState.hasKey && !objective.data.hasKey
      && !objectiveEvents.some((event) => event.type === 'KEY_ACQUIRED')) {
      const keyId = result.state.floorState.entities.find((entity) => entity.type === 'KEY')?.id ?? 'KEY';
      objectiveEvents.unshift({ type: 'KEY_ACQUIRED', keyId });
    }
  }
  if (runtime.floor === 29 && objective.kind === 'KEY_EXPLORE' && objective.status === 'ACTIVE') {
    if (result.state.floorState.hasKey && !objective.data.hasKey
      && !objectiveEvents.some((event) => event.type === 'KEY_ACQUIRED')) {
      const keyId = result.state.floorState.entities.find((entity) => entity.type === 'KEY')?.id ?? 'KEY';
      objectiveEvents.unshift({ type: 'KEY_ACQUIRED', keyId });
    }
  }
  if (runtime.floor === 31 && objective.kind === 'FATE_CHOICE' && objective.status === 'ACTIVE') {
    for (const sealId of F31_SEAL_IDS) {
      const seal = result.state.floorState.entities.find((entity) => entity.id === sealId);
      if (!seal?.consumed || objective.data.chosen) continue;
      if (objectiveEvents.some((event) => event.type === 'FATE_CHOICE_SELECTED' && event.sealId === sealId)) continue;
      objectiveEvents.push({
        type: 'FATE_CHOICE_SELECTED',
        sealId,
        choice: F31_CHOICE_BY_SEAL[sealId],
      });
    }
  }
  if (runtime.floor === 19 && result.events.some((event) => event.type === 'TURN_END')) {
    const pointId = unfinishedControlPointAtPlayer(result.state.floorState);
    if (pointId && !objectiveEvents.some((event) => event.type === 'CONTROL_POINT_TICK' && event.pointId === pointId)) {
      objectiveEvents.push({ type: 'CONTROL_POINT_TICK', pointId });
    }
  }
  for (const event of objectiveEvents) {
    const applied = definition.apply(objective, event);
    objective = applied.state;
    pendingCommands.push(...applied.commands);
  }
  if (runtime.floor === 19 && objective.data.progressByPoint) {
    result = {
      ...result,
      state: {
        ...result.state,
        floorState: syncControlPointProgress(
          result.state.floorState,
          objective.data.progressByPoint as Record<string, number>,
        ),
      },
    };
  }
  // 第 10 层：以战场哨卫死亡状态对账。DoT/漏事件可能导致已清哨却无 KILL，
  // 目标卡在 ACTIVE、传送门不刷。
  if (runtime.floor === 10 && objective.kind === 'PURGE' && objective.status === 'ACTIVE') {
    const sentinelIds = stringArray(objective.data.sentinelIds);
    const ids = sentinelIds.length > 0 ? sentinelIds : ['F10_SENTINEL_1', 'F10_SENTINEL_2'];
    for (const sentinelId of ids) {
      if (!isMonsterDeadOrMissing(result.state.floorState.monsters, sentinelId)) continue;
      const applied = definition.apply(objective, { type: 'ENTITY_KILLED', entityId: sentinelId });
      objective = applied.state;
      pendingCommands.push(...applied.commands);
    }
  }
  if (runtime.floor === 16 && objective.kind === 'BOUNTY_HUNT' && objective.status === 'ACTIVE') {
    const bountyIds = stringArray(objective.data.bountyIds);
    const ids = bountyIds.length > 0 ? bountyIds : [...CHAPTER3_BOUNTY_IDS];
    for (const bountyId of ids) {
      if (!isMonsterDeadOrMissing(result.state.floorState.monsters, bountyId)) continue;
      const applied = definition.apply(objective, { type: 'ENTITY_KILLED', entityId: bountyId });
      objective = applied.state;
      pendingCommands.push(...applied.commands);
    }
  }
  if (runtime.floor === 18 && objective.kind === 'CORE_BREAK' && objective.status === 'ACTIVE') {
    const core = result.state.floorState.entities.find((entity) => entity.id === F18_CORE);
    if (core?.consumed) {
      const applied = definition.apply(objective, { type: 'ENTITY_DESTROYED', entityId: F18_CORE });
      objective = applied.state;
      pendingCommands.push(...applied.commands);
    }
  }
  if (runtime.floor === 23 && objective.kind === 'VENT_SEAL' && objective.status === 'ACTIVE') {
    const sealedIds = stringArray(objective.data.sealed);
    for (const ventId of F23_VENT_IDS) {
      const vent = result.state.floorState.entities.find((entity) => entity.id === ventId);
      if (vent?.consumed && !sealedIds.includes(ventId)) {
        const applied = definition.apply(objective, { type: 'VENT_SEALED', entityId: ventId });
        objective = applied.state;
        pendingCommands.push(...applied.commands);
      }
    }
  }
  if (runtime.floor === 32 && objective.kind === 'PURGE' && objective.status === 'ACTIVE') {
    const eyeIds = stringArray(objective.data.eyeIds);
    const ids = eyeIds.length > 0 ? eyeIds : [...F32_PROPHECY_EYE_IDS];
    for (const eyeId of ids) {
      if (!isMonsterDeadOrMissing(result.state.floorState.monsters, eyeId)) continue;
      const applied = definition.apply(objective, { type: 'ENTITY_KILLED', entityId: eyeId });
      objective = applied.state;
      pendingCommands.push(...applied.commands);
    }
  }
  // 第三层的祭坛是在原战斗链中被消耗的。事件回放在弱网重连或连续操作中
  // 可能漏过此前的击杀事件；以最终战场作为权威补齐已死亡的守卫，保证祭坛
  // 消失且守卫清空时必然进入通关结算，而不会卡在没有下一层弹窗的状态。
  if (runtime.floor === 3) {
    const altar = findChapter1Floor3Altar(result.state, true);
    if (altar?.consumed) {
      const reconciledEvents: ObjectiveEvent[] = [{ type: 'ALTAR_DESTROYED', altarId: altar.id }];
      const objectiveSummonIds = stringArray(objective.data.summonIds);
      const battlefieldSummonIds = result.state.floorState.monsters
        .filter((monster) => monster.id.startsWith('altar_summon_'))
        .map((monster) => monster.id);
      for (const summonId of battlefieldSummonIds) {
        if (!objectiveSummonIds.includes(summonId)) {
          reconciledEvents.push({ type: 'SUMMONED', entityId: summonId, sourceId: altar.id });
        }
      }
      const blockerIds = [
        ...new Set([...CHAPTER1_FLOOR3_BLOCKER_IDS, ...stringArray(objective.data.blockerIds)]),
      ];
      for (const blockerId of blockerIds) {
        if (isMonsterDeadOrMissing(result.state.floorState.monsters, blockerId)) {
          reconciledEvents.push({ type: 'ENTITY_KILLED', entityId: blockerId });
        }
      }
      const trackedSummonIds = [
        ...new Set([
          ...objectiveSummonIds,
          ...battlefieldSummonIds,
        ]),
      ];
      for (const summonId of trackedSummonIds) {
        if (isMonsterDeadOrMissing(result.state.floorState.monsters, summonId)) {
          reconciledEvents.push({ type: 'ENTITY_KILLED', entityId: summonId });
        }
      }
      for (const event of reconciledEvents) {
        const applied = definition.apply(objective, event);
        objective = applied.state;
        pendingCommands.push(...applied.commands);
      }
    }
  }
  const floor3LivingBlockers = runtime.floor === 3
    ? CHAPTER1_FLOOR3_BLOCKER_IDS.filter((id) => !isMonsterDeadOrMissing(result.state.floorState.monsters, id))
    : [];
  const floor3LivingSummons = runtime.floor === 3
    ? stringArray(objective.data.summonIds).filter((id) => !isMonsterDeadOrMissing(result.state.floorState.monsters, id))
    : [];
  if (runtime.floor === 3
    && findChapter1Floor3Altar(result.state, true)
    && objective.status !== 'COMPLETE'
    && floor3LivingBlockers.length === 0
    && floor3LivingSummons.length === 0) {
    console.warn('[PVE][floor3_altar] altar consumed but objective is not complete', {
      objectiveStatus: objective.status,
      objectiveData: objective.data,
      livingBlockers: floor3LivingBlockers,
      livingSummons: floor3LivingSummons,
    });
  }
  if ((runtime.floor === 6 || runtime.floor === 13 || runtime.floor === 20 || runtime.floor === 26)
    && objective.status === 'ACTIVE'
    && objective.kind === 'WAVE_SURVIVAL') {
    const reconciled = reconcileWaveSurvivalObjective(
      runtime.floor === 6 ? 5 : 4,
      objective,
      result.state.floorState.monsters,
      definition,
      pendingCommands,
    );
    objective = reconciled.objective;
    pendingCommands = reconciled.pendingCommands;
  }
  if ((runtime.floor === 6 || runtime.floor === 13 || runtime.floor === 20 || runtime.floor === 26)
    && pendingCommands.some((command) => command.type === 'WARN_WAVE')) {
    const applied = definition.apply(objective, { type: 'PLAYER_TURN_ENDED' });
    objective = applied.state;
    pendingCommands.push(...applied.commands);
  }
  let expedition = result.state;
  const spawnedPresentationEvents: PveEvent[] = [];
  if (runtime.floor === 3 && result.events.some((event) => event.type === 'TURN_END')) {
    const altar = findChapter1Floor3Altar(expedition, false);
    const aliveSummons = stringArray(objective.data.summonIds).filter((id) => expedition.floorState.monsters.some((monster) => monster.id === id && monster.hp > 0 && monster.aiState !== 'DEAD'));
    const completedRounds = Math.max(0, expedition.floorState.turn - 1);
    if (altar && !altar.consumed && completedRounds > 0 && completedRounds % 3 === 0 && aliveSummons.length < 2) {
      const occupied = new Set(expedition.floorState.monsters.filter((monster)=>monster.hp>0&&monster.aiState!=='DEAD').map((monster)=>`${monster.pos.x},${monster.pos.y}`));
      occupied.add(`${expedition.floorState.player.x},${expedition.floorState.player.y}`);
      const candidates=[{x:altar.pos.x-1,y:altar.pos.y},{x:altar.pos.x+1,y:altar.pos.y},{x:altar.pos.x,y:altar.pos.y+1},{x:altar.pos.x,y:altar.pos.y-1}];
      const pos=candidates.find((cell)=>cell.x>=0&&cell.y>=0&&cell.x<expedition.floorState.size&&cell.y<expedition.floorState.size&&!occupied.has(`${cell.x},${cell.y}`));
      if (pos) {
        const summon=createChapter1Monster({id:`altar_summon_${completedRounds}`,kind:'GOBLIN_WARRIOR',pos,rewardEligible:false});
        expedition={...expedition,floorState:{...expedition.floorState,monsters:[...expedition.floorState.monsters,summon]}};
        const applied=definition.apply(objective,{type:'SUMMONED',entityId:summon.id,sourceId:altar.id});
        objective=applied.state;
        pendingCommands.push(...applied.commands);
        spawnedPresentationEvents.push({type:'MONSTER_SPAWNED',monsterId:summon.id,pos:{...summon.pos}});
      }
    }
  }
  const spawnCommand = pendingCommands.find(
    (command): command is Extract<ObjectiveCommand, { type: 'SPAWN_WAVE' }> => command.type === 'SPAWN_WAVE',
  );
  const warnCommand = pendingCommands.find(
    (command): command is Extract<ObjectiveCommand, { type: 'WARN_WAVE' }> => command.type === 'WARN_WAVE',
  );
  if (warnCommand) {
    spawnedPresentationEvents.push({ type: 'WAVE_INCOMING', wave: warnCommand.wave });
    pendingCommands = pendingCommands.filter((command) => command !== warnCommand);
  }
  if (spawnCommand) {
    const spawned = spawnWave({
      ...runtime,
      battleState: { ...runtime.battleState, expedition },
    }, spawnCommand.wave);
    expedition = spawned.expedition;
    const applied = definition.apply(objective, {
      type: 'WAVE_SPAWNED',
      wave: spawnCommand.wave,
      entityIds: spawned.spawnedIds,
    });
    objective = applied.state;
    for (const monster of spawned.expedition.floorState.monsters.filter((entry) => spawned.spawnedIds.includes(entry.id))) {
      spawnedPresentationEvents.push({ type: 'MONSTER_SPAWNED', monsterId: monster.id, pos: { ...monster.pos } });
    }
    pendingCommands = pendingCommands.filter((command) => command !== spawnCommand);
    pendingCommands.push(...applied.commands);
  }
  let status: FloorRuntimeStatus = runtime.status;
  let events = [
    ...result.events.filter((event) => clearByPortal || event.type !== 'FLOOR_CLEARED'),
    ...spawnedPresentationEvents,
  ];
  if (clearByPortal) {
    status = 'CLEAR';
    expedition = {
      ...expedition,
      floorState: { ...expedition.floorState, status: 'CLEARED' },
    };
    if (!events.some((event) => event.type === 'FLOOR_CLEARED')) {
      events.push({ type: 'FLOOR_CLEARED', floor: runtime.floor });
    }
  } else if (objective.status === 'COMPLETE') {
    status = 'ACTIVE';
    expedition = {
      ...expedition,
      floorState: { ...expedition.floorState, status: 'EXPLORING' },
    };
    if (runtime.floor === 10) {
      expedition = dissolveHuntPressure(expedition);
    }
    // 击杀型目标：门刷在「完成本次目标的最后一击」尸体格（怪死哪门在哪），
    // 与第一章精英/追逃层同类；勿写死某一只目标 ID。
    const killTargets = killTargetIdsForFloor(runtime.floor, objective);
    const preferredPortalPos = lastObjectiveKillPos(expedition, result.events, killTargets);
    const opened = openCompletionPortal(expedition, preferredPortalPos, objective);
    expedition = opened.expedition;
    events = [...events, ...opened.events];
    if (runtime.floor === 3 && !opened.events.some((event) => event.type === 'PORTAL_SPAWNED')) {
      console.warn('[PVE][floor3_altar] objective complete but completion portal was not spawned', {
        entities: expedition.floorState.entities.map((entity) => ({
          id: entity.id,
          type: entity.type,
          consumed: entity.consumed,
          pos: entity.pos,
        })),
      });
    }
  } else if (objective.status === 'FAILED') {
    status = expedition.status === 'DEAD' || expedition.floorState.status === 'DEAD' ? 'DEAD' : 'WITHDRAW';
  }
  let nextRuntime: PersistentExpeditionRuntime = {
    ...professionRuntime,
    status,
    completedOptionalObjectiveIds: status === 'CLEAR'
      ? [...runtime.battleState.rewardCatalog.optionalObjectiveIds]
      : runtime.completedOptionalObjectiveIds,
    battleState: {
      ...professionRuntime.battleState,
      expedition,
      objective,
      pendingCommands,
      profession: professionRuntime.profession,
    },
    updatedAt: now,
  };
  nextRuntime = syncRuntimeFromExpedition(nextRuntime, expedition, now);
  return { runtime: nextRuntime, result: { state: expedition, events } };
}

export function ensurePartnerBattle(runtime: PersistentExpeditionRuntime): PersistentExpeditionRuntime {
  if (runtime.battleState.partnerBattle) return runtime;
  const partnerId = runtime.config.partnerId;
  if (!partnerId) {
    return {
      ...runtime,
      battleState: { ...runtime.battleState, partnerBattle: null },
    };
  }
  const partnerBattle = createPartnerBattleState(
    partnerId,
    runtime.config.partnerEvolutionStage ?? 1,
  );
  return {
    ...runtime,
    battleState: { ...runtime.battleState, partnerBattle },
  };
}

export function applyPartnerSkillToRuntime(
  runtime: PersistentExpeditionRuntime,
  opts: { targetCell?: Coord; targetMonsterId?: string; phase?: 'PLAYER_INPUT' | 'OTHER' } = {},
): { runtime: PersistentExpeditionRuntime; result: PartnerSkillResult } {
  const ensured = ensurePartnerBattle(runtime);
  const partnerBattle = ensured.battleState.partnerBattle;
  if (!partnerBattle) {
    return { runtime: ensured, result: { ok: false, reason: 'PARTNER_NONE' } };
  }
  const skillResult = usePartnerSkill({
    expedition: ensured.battleState.expedition,
    partnerBattle,
    phase: opts.phase ?? 'PLAYER_INPUT',
    resources: {
      hp: ensured.resources.hp,
      maxHp: ensured.resources.maxHp,
      shield: ensured.resources.shield,
      spirit: ensured.resources.spirit,
      ap: ensured.resources.ap,
      maxAp: ensured.resources.maxAp,
    },
    targetCell: opts.targetCell,
    targetMonsterId: opts.targetMonsterId,
  });
  if (skillResult.ok === false) return { runtime: ensured, result: skillResult };
  if (skillResult.needCellTarget || skillResult.needEnemyTarget) {
    return { runtime: ensured, result: skillResult };
  }
  let next: PersistentExpeditionRuntime = {
    ...ensured,
    resources: {
      ...ensured.resources,
      hp: skillResult.resources.hp,
      maxHp: skillResult.resources.maxHp,
      shield: skillResult.resources.shield,
      spirit: skillResult.resources.spirit,
      ap: skillResult.resources.ap,
      maxAp: skillResult.resources.maxAp,
    },
    battleState: {
      ...ensured.battleState,
      expedition: skillResult.expedition,
      partnerBattle: skillResult.partnerBattle,
    },
  };
  next = syncRuntimeFromExpedition(next, skillResult.expedition);
  return { runtime: next, result: skillResult };
}

export type { PartnerBattleState };
