import { resumeFloorRuntime, startFloorRuntime } from './FloorChallengeLifecycle';
import {
  FLOOR_RUNTIME_VERSION,
  createFreshProfessionState,
  type FloorChallengeRuntimeState,
  type FloorProfessionRuntimeState,
  type FloorRuntimeStatus,
} from './FloorChallengeState';
import { createMinghenTriggerMemory, type MinghenTriggerMemory } from './minghen/MinghenEffects';
import { getChapter1Objective } from './objectives/Chapter1Objectives';
import type { FloorObjectiveState, ObjectiveCommand, ObjectiveEvent } from './objectives/FloorObjective';
import type { ApplyResult, ExpeditionState, PveEvent } from './PveTypes';
import type { FloorChallengeSnapshot, PveProfile } from './PveProgressionTypes';
import { chapterIdForFloor, isFloorContentReady } from './chapterRouting';
import { createChapter1ExpeditionState, createChapter1Monster } from './chapter1/Chapter1ExpeditionFactory';
import { CHAPTER1_FLOOR3_BLOCKER_IDS } from './chapter1/Chapter1FloorCatalog';
import { generateChapter1Floor } from './chapter1/Chapter1FloorGenerator';
import { spawnObjectivePortal } from './FloorRules';
import { commitProfessionMove, endProfessionTurn } from './professions/ProfessionActionSystem';
import { gainSpirit } from './SpiritBurstSystem';
import { resolveMinghenEffects } from './minghen/MinghenEffects';
import type { MinghenEventContext, MinghenHook } from './minghen/MinghenEventContext';
import { rushMonstersTowardPlayer } from './MonsterAI';

/** 第 6 层夜袭：整波刷出后立刻朝玩家冲锋格数。 */
export const WAVE_SPAWN_RUSH_STEPS = 4;

export interface PersistentExpeditionBattleState {
  expedition: ExpeditionState;
  objective: FloorObjectiveState;
  pendingCommands: ObjectiveCommand[];
  profession: FloorProfessionRuntimeState;
  minghenMemory: MinghenTriggerMemory;
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

export function createPersistentFloorRuntime(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
  now = Date.now(),
): PersistentExpeditionRuntime {
  if (!isFloorContentReady(snapshot.floor)) throw new Error('FLOOR_CONTENT_NOT_READY');
  const chapterId = chapterIdForFloor(snapshot.floor);
  if (chapterId === 1) {
    let expedition = createChapter1ExpeditionState(snapshot, profile);
    const map = generateChapter1Floor(snapshot.floor, snapshot.seed, snapshot.mode, false);
    const profession = createFreshProfessionState();
    let objective = getChapter1Objective(snapshot.floor).create();
    if (snapshot.floor === 6) {
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
  throw new Error('CHAPTER2_NOT_WIRED');
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
  let parsed: { version?: unknown; runtime?: { version?: unknown } };
  try {
    parsed = JSON.parse(serialized) as typeof parsed;
  } catch (_err) {
    throw new Error('INVALID_FLOOR_RUNTIME_SAVE');
  }
  if (parsed.version === 1 && parsed.runtime?.version === 1) {
    return createPersistentFloorRuntime(snapshot, profile, now);
  }
  if (parsed.version !== FLOOR_RUNTIME_VERSION || parsed.runtime?.version !== FLOOR_RUNTIME_VERSION) {
    throw new Error('FLOOR_RUNTIME_VERSION_MISMATCH');
  }
  return resumePersistentRuntimeV2(snapshot, serialized);
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
  if (runtime.battleState.minghenMemory.turnKeys.includes(turnKey)) return runtime;
  const memory = {
    eventKeys: [...runtime.battleState.minghenMemory.eventKeys],
    turnKeys: [...runtime.battleState.minghenMemory.turnKeys, turnKey],
    layerKeys: [...runtime.battleState.minghenMemory.layerKeys],
    states: [...runtime.battleState.minghenMemory.states],
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
    else if (event.type === 'PLAYER_DEAD') events.push({ type: 'PLAYER_DIED' });
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

function completionPortalPos(state: ExpeditionState): { x: number; y: number } {
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
  if (state.floor === 6) {
    return { x: Math.floor(floor.size / 2), y: Math.floor(floor.size / 2) };
  }
  if (state.floor === 5) {
    return floor.entities.find((entity) => entity.id === 'F5_BLAST_TARGET')?.pos
      ?? floor.player;
  }
  const targetIdByFloor: Record<number, string> = {
    2: 'FLOOR2_ELITE',
    4: 'GOBLIN_SENTINEL',
    7: 'GOBLIN_CHIEF',
  };
  const targetId = targetIdByFloor[state.floor];
  if (targetId) {
    const target = floor.monsters.find((monster) => monster.id === targetId);
    if (target) return target.pos;
  }
  return floor.entities.find((entity) => entity.type === 'EXIT' && entity.consumed)?.pos
    ?? floor.entities.find((entity) => entity.type === 'EXIT')?.pos
    ?? floor.player;
}

function openCompletionPortal(expedition: ExpeditionState): { expedition: ExpeditionState; events: PveEvent[] } {
  const portal = spawnObjectivePortal(expedition, completionPortalPos(expedition));
  return { expedition: portal.state, events: portal.events };
}

function extendPersistentEvents(
  runtime: PersistentExpeditionRuntime,
  expedition: ExpeditionState,
  events: readonly PveEvent[],
): { runtime: PersistentExpeditionRuntime; expedition: ExpeditionState } {
  let nextRuntime = runtime;
  let nextExpedition = expedition;
  const memory = {
    eventKeys: [...runtime.battleState.minghenMemory.eventKeys],
    turnKeys: [...runtime.battleState.minghenMemory.turnKeys],
    layerKeys: [...runtime.battleState.minghenMemory.layerKeys],
    states: [...runtime.battleState.minghenMemory.states],
  };
  const applyHook = (hook: MinghenHook, event: PveEvent, index: number, targetId?: string): void => {
    const target = targetId
      ? nextExpedition.floorState.monsters.find((monster) => monster.id === targetId)
      : undefined;
    const context: MinghenEventContext = {
      eventId: `${nextExpedition.floorState.turn}:${index}:${event.type}:${hook}`,
      hook,
      turn: nextExpedition.floorState.turn,
      source: event.type === 'PLAYER_DAMAGED' ? 'ENEMY' : 'ACTIVE_ACTION',
      hp: nextExpedition.player.hp,
      maxHp: nextExpedition.player.maxHp,
      apLeft: nextExpedition.floorState.ap,
      targetId,
      targetHpRatio: target ? target.hp / Math.max(1, target.maxHp) : undefined,
      targetHasStatus: target ? Boolean(target.bleedRounds || target.poisonRounds || target.burnRounds || target.frozenRounds) : false,
      movedThisTurn: (nextExpedition.floorState.playerStepsThisTurn ?? 0) > 0,
      attackedThisTurn: Boolean(nextExpedition.floorState.playerAttackedThisTurn),
      actualDamage: event.type === 'PLAYER_DAMAGED' ? event.damage : undefined,
      action: event.type === 'MOVE' ? 'MOVE' : event.type === 'ATTACK' ? 'ATTACK' : undefined,
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
              if (status.id === 'BLEED') patched = { ...patched, bleedRounds: Math.max(patched.bleedRounds ?? 0, status.stacks) };
              if (status.id === 'POISON') patched = { ...patched, poisonRounds: Math.max(patched.poisonRounds ?? 0, status.stacks), poisonDamage: 3 };
              if (status.id === 'BURN') patched = { ...patched, burnRounds: Math.max(patched.burnRounds ?? 0, status.stacks) };
              if (status.id === 'CHILL') patched = { ...patched, frozenRounds: Math.max(patched.frozenRounds ?? 0, status.stacks) };
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

function spawnWave(
  runtime: PersistentExpeditionRuntime,
  wave: number,
): { expedition: ExpeditionState; spawnedIds: string[] } {
  const current = runtime.battleState.expedition;
  const waves: Record<number, string[]> = {
    1: ['GOBLIN_WARRIOR', 'GOBLIN_WARRIOR'],
    2: ['GOBLIN_WARRIOR', 'GOBLIN_ARCHER'],
    3: ['GOBLIN_WARRIOR', 'GOBLIN_WARRIOR', 'GOBLIN_ARCHER'],
    4: ['FROST_GOBLIN', 'GOBLIN_WARRIOR', 'GOBLIN_ARCHER'],
    5: ['FIRE_GOBLIN', 'FROST_GOBLIN', 'GOBLIN_WARRIOR', 'GOBLIN_ARCHER'],
  };
  const markerCells = current.floorState.entities
    .filter(isWaveSpawnMarker)
    .map((entity) => entity.pos);
  const spawnCells = markerCells.length > 0 ? markerCells : [{x:0,y:0},{x:8,y:0},{x:0,y:8},{x:8,y:8}];
  const kinds = waves[wave] ?? [];
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
  const monsters = kinds.map((kind, index) => createChapter1Monster({
    id: `wave${wave}_${index}`,
    kind,
    pos: (() => {
      const preferred = spawnCells[index % spawnCells.length] ?? spawnCells[0]!;
      const selected = [preferred, ...fallbackCells].find((cell) => !blocked.has(`${cell.x},${cell.y}`));
      if (!selected) return { ...preferred };
      blocked.add(`${selected.x},${selected.y}`);
      return { ...selected };
    })(),
    role: wave === 5 && index < 2 ? 'CLIMAX' : 'NORMAL',
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
  return {
    expedition: rush.state,
    spawnedIds,
  };
}

export function applyPersistentBattleResult(
  runtime: PersistentExpeditionRuntime,
  result: ApplyResult,
  now = Date.now(),
): { runtime: PersistentExpeditionRuntime; result: ApplyResult } {
  if (runtime.status !== 'ACTIVE') return { runtime, result };
  let shield = runtime.resources.shield;
  let defendedHp = result.state.player.hp;
  const defendedEvents = result.events.map((event): PveEvent => {
    if (event.type !== 'PLAYER_DAMAGED' || shield <= 0 || event.damage <= 0) return event;
    const absorbed = Math.min(shield, event.damage);
    shield -= absorbed;
    defendedHp = Math.min(result.state.player.maxHp, defendedHp + absorbed);
    return { ...event, damage: event.damage - absorbed, hp: defendedHp };
  });
  if (shield !== runtime.resources.shield) {
    result = {
      state: { ...result.state, player: { ...result.state.player, hp: defendedHp } },
      events: defendedEvents,
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
  const definition = getChapter1Objective(runtime.floor);
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
  for (const event of objectiveEvents) {
    const applied = definition.apply(objective, event);
    objective = applied.state;
    pendingCommands.push(...applied.commands);
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
  // 第六层：以战场为准推进波次。aliveIds 脱节 / DoT 无 KILL / 旧档 preparationTurns
  // 都可能导致清波后不刷怪；此处补齐跟踪、击杀与刷怪命令，并产出 WAVE_INCOMING 提示。
  if (runtime.floor === 6 && objective.status === 'ACTIVE' && objective.kind === 'WAVE_SURVIVAL') {
    const monsters = result.state.floorState.monsters;
    let currentWave = Number(objective.data.currentWave ?? 0);
    if (currentWave === 0) {
      const wave1Ids = monsters.filter((monster) => monster.id.startsWith('wave1_')).map((monster) => monster.id);
      if (wave1Ids.length > 0) {
        const applied = definition.apply(objective, {
          type: 'WAVE_SPAWNED',
          wave: 1,
          entityIds: wave1Ids,
        });
        objective = applied.state;
        pendingCommands.push(...applied.commands);
        currentWave = 1;
      }
    }
    currentWave = Number(objective.data.currentWave ?? 0);
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
      const tracked = stringArray(objective.data.aliveIds);
      // 仅在跟踪脱节且尚未发出刷怪命令时回填，避免 KILL 已清空 aliveIds 后被死尸 ID 再次污染。
      if (
        tracked.length === 0
        && waveIds.length > 0
        && objective.status === 'ACTIVE'
        && !pendingCommands.some((command) => command.type === 'SPAWN_WAVE')
      ) {
        objective = {
          ...objective,
          data: {
            ...objective.data,
            aliveIds: waveIds,
          },
        };
      } else if (livingWaveIds.some((id) => !tracked.includes(id))) {
        objective = {
          ...objective,
          data: {
            ...objective.data,
            aliveIds: [...new Set([...tracked, ...livingWaveIds])],
          },
        };
      }
      for (const aliveId of stringArray(objective.data.aliveIds)) {
        if (isMonsterDeadOrMissing(monsters, aliveId)) {
          const applied = definition.apply(objective, { type: 'ENTITY_KILLED', entityId: aliveId });
          objective = applied.state;
          pendingCommands.push(...applied.commands);
        }
      }
    }
    let preparationTurns = Number(objective.data.preparationTurns ?? 0);
    while (preparationTurns > 0) {
      const applied = definition.apply(objective, { type: 'PLAYER_TURN_ENDED' });
      objective = applied.state;
      pendingCommands.push(...applied.commands);
      preparationTurns = Number(objective.data.preparationTurns ?? 0);
    }
    currentWave = Number(objective.data.currentWave ?? 0);
    const livingCurrent = currentWave >= 1
      ? monsters.filter((monster) => (
        monster.id.startsWith(`wave${currentWave}_`)
        && monster.hp > 0
        && monster.aiState !== 'DEAD'
      ))
      : [];
    if (
      objective.status === 'ACTIVE'
      && currentWave >= 1
      && currentWave < 5
      && livingCurrent.length === 0
      && stringArray(objective.data.aliveIds).length === 0
      && !pendingCommands.some((command) => command.type === 'SPAWN_WAVE')
    ) {
      const nextWave = currentWave + 1;
      const livingNext = monsters.some((monster) => (
        monster.id.startsWith(`wave${nextWave}_`)
        && monster.hp > 0
        && monster.aiState !== 'DEAD'
      ));
      if (!livingNext) {
        pendingCommands.push({ type: 'WARN_WAVE', wave: nextWave });
        pendingCommands.push({ type: 'SPAWN_WAVE', wave: nextWave });
      }
    }
  }
  if (runtime.floor === 6 && pendingCommands.some((command) => command.type === 'WARN_WAVE')) {
    const applied = definition.apply(objective, { type: 'PLAYER_TURN_ENDED' });
    objective = applied.state;
    pendingCommands.push(...applied.commands);
  }
  let expedition = extended.expedition;
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
    const opened = openCompletionPortal(expedition);
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
