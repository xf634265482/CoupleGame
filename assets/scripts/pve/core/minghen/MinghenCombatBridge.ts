import type { ProfessionAttackResolution } from '../professions/ProfessionActionSystem';
import type { ExpeditionState, FixedEntity, FloorState, PveEvent } from '../PveTypes';
import type { MinghenLoadoutEntry } from '../PveProgressionTypes';
import { resolveMinghenEffects, type MinghenTriggerMemory } from './MinghenEffects';
import {
  emptyMinghenEffectResult,
  type MinghenEffectResult,
  type MinghenEventContext,
  type MinghenStatus,
} from './MinghenEventContext';
import { playerOnExtraMoveCostTerrain, playerOnSandPit } from './SandMinghenBridge';
import {
  countAdjacentEntities,
  countEntitiesInChebyshevRange,
  isAdjacentToAny,
  type GridPos,
} from './MinghenSpatialQuery';

export interface MinghenAttackPreview {
  profession: ProfessionAttackResolution;
  memory: MinghenTriggerMemory;
}

export interface MinghenAttackResolution {
  expedition: ExpeditionState;
  memory: MinghenTriggerMemory;
  apDelta: number;
  spiritGain: number;
  shieldGain: number;
}

export interface MinghenPlayerResources {
  shield: number;
  maxHp: number;
}

const BLOCKING_ENTITY_TYPES = new Set<FixedEntity['type']>(['ROCK', 'ICE_WALL', 'FREEZE_WALL']);

function isBlockingEntity(entity: FixedEntity): boolean {
  return !entity.consumed && BLOCKING_ENTITY_TYPES.has(entity.type);
}

function livingMonsterPositions(floor: FloorState): GridPos[] {
  return floor.monsters.filter((monster) => monster.aiState !== 'DEAD').map((monster) => monster.pos);
}

function blockingEntityPositions(floor: FloorState): GridPos[] {
  return floor.entities.filter(isBlockingEntity).map((entity) => entity.pos);
}

/** Shared spatial + terrain tags for Minghen hooks (attack, move, damage, turn). */
export function buildMinghenSpatialContext(
  expedition: ExpeditionState,
  targetId?: string,
  playerPos: GridPos = expedition.floorState.player,
): Pick<
  MinghenEventContext,
  | 'adjacentEnemyCount'
  | 'targetAdjacentEnemyCount'
  | 'enemiesInRange2'
  | 'adjacentToBlocking'
  | 'targetAdjacentToBlocking'
  | 'onExtraMoveCostTerrain'
  | 'attackerOnSandPit'
  | 'targetHasArmor'
  | 'targetTier'
  | 'inTaskObjectiveZone'
  | 'isTaskInteract'
  | 'escortUnitInRange2'
  | 'damageTargetIsEscort'
  | 'inAttackWarningZone'
  | 'inDangerTerrain'
> {
  const floor = expedition.floorState;
  const livingPositions = livingMonsterPositions(floor);
  const blockers = blockingEntityPositions(floor);
  const target = targetId ? floor.monsters.find((entry) => entry.id === targetId) : undefined;
  const onExtraTerrain = playerOnExtraMoveCostTerrain(floor.entities, playerPos);
  const targetAdjacentPositions = target
    ? floor.monsters
      .filter((monster) => monster.aiState !== 'DEAD' && monster.id !== target.id)
      .map((monster) => monster.pos)
    : [];

  return {
    adjacentEnemyCount: countAdjacentEntities(playerPos, livingPositions),
    targetAdjacentEnemyCount: target
      ? countAdjacentEntities(target.pos, targetAdjacentPositions)
      : undefined,
    enemiesInRange2: countEntitiesInChebyshevRange(playerPos, livingPositions, 2),
    adjacentToBlocking: isAdjacentToAny(playerPos, blockers),
    targetAdjacentToBlocking: target ? isAdjacentToAny(target.pos, blockers) : undefined,
    onExtraMoveCostTerrain: onExtraTerrain,
    attackerOnSandPit: playerOnSandPit(floor.entities, playerPos),
    targetHasArmor: target ? (target.armor ?? 0) > 0 : undefined,
    targetTier: target?.type,
    inTaskObjectiveZone: false,
    isTaskInteract: false,
    escortUnitInRange2: false,
    damageTargetIsEscort: false,
    inAttackWarningZone: false,
    inDangerTerrain: onExtraTerrain,
  };
}

export function buildAttackContext(
  expedition: ExpeditionState,
  targetId: string | undefined,
  targetStatuses: MinghenStatus[],
  options?: { shield?: number },
): MinghenEventContext {
  const floor = expedition.floorState;
  const target = targetId ? floor.monsters.find((entry) => entry.id === targetId) : undefined;
  return {
    eventId: '',
    hook: 'BEFORE_ATTACK',
    turn: floor.turn,
    source: 'ACTIVE_ACTION',
    hp: expedition.player.hp,
    maxHp: expedition.player.maxHp,
    apLeft: floor.ap,
    shield: options?.shield,
    targetId,
    targetStatuses,
    targetHasStatus: targetStatuses.length > 0,
    targetHpRatio: target ? target.hp / Math.max(1, target.maxHp) : undefined,
    activeMoveStepsThisTurn: floor.playerStepsThisTurn ?? 0,
    movedThisTurn: (floor.playerStepsThisTurn ?? 0) > 0,
    attackedThisTurn: Boolean(floor.playerAttackedThisTurn),
    hitCount: 1,
    action: 'ATTACK',
    ...buildMinghenSpatialContext(expedition, targetId),
  };
}

export function applyOverflowDamageMitigation(
  maxHp: number,
  actualDamage: number,
  overflowDamageReductionRatio: number,
): number {
  const threshold = maxHp * 0.2;
  if (actualDamage <= threshold) return actualDamage;
  return threshold + (actualDamage - threshold) * (1 - overflowDamageReductionRatio);
}

export function applyDamageReduction(actualDamage: number, damageReductionRatio: number): number {
  return Math.max(0, actualDamage * (1 - damageReductionRatio));
}

export function applyMinghenEffectToResources(
  resources: MinghenPlayerResources | undefined,
  effect: MinghenEffectResult,
): MinghenPlayerResources | undefined {
  if (!resources || effect.shield === 0) return resources;
  return {
    ...resources,
    shield: Math.min(resources.maxHp, resources.shield + Math.round(effect.shield)),
  };
}

export function cloneMinghenMemory(memory: MinghenTriggerMemory): MinghenTriggerMemory {
  return {
    eventKeys: [...memory.eventKeys], turnKeys: [...memory.turnKeys],
    layerKeys: [...memory.layerKeys], states: [...memory.states],
  };
}

export function previewMinghenAttack(
  expedition: ExpeditionState,
  loadout: readonly MinghenLoadoutEntry[],
  memory: MinghenTriggerMemory,
  profession: ProfessionAttackResolution,
  targetId?: string,
  options?: { shield?: number },
): MinghenAttackPreview {
  const nextMemory = cloneMinghenMemory(memory);
  const target = targetId ? expedition.floorState.monsters.find((entry) => entry.id === targetId) : undefined;
  const base = buildAttackContext(expedition, targetId, target ? statusesOf(target) : [], options);
  const beforeAttack = resolveMinghenEffects(loadout, {
    ...base, eventId: `${base.turn}:attack:${targetId ?? 'preview'}:before-attack`, hook: 'BEFORE_ATTACK',
  }, nextMemory);
  const beforeHit = resolveMinghenEffects(loadout, {
    ...base, eventId: `${base.turn}:attack:${targetId ?? 'preview'}:before-hit`, hook: 'BEFORE_HIT',
  }, nextMemory);
  const effect = mergeEffects(beforeAttack, beforeHit);
  return {
    memory: nextMemory,
    profession: {
      ...profession,
      apCost: Math.max(1, profession.apCost + effect.apDelta),
      damageMultiplier: profession.damageMultiplier * Math.max(0, 1 + effect.damageMultiplierBonus),
      armorPenetration: Math.min(1, profession.armorPenetration + effect.armorPenetrationBonus),
      rangeBonus: profession.rangeBonus + effect.rangeBonus,
    },
  };
}

export function resolveMinghenAttack(
  before: ExpeditionState,
  after: ExpeditionState,
  events: readonly PveEvent[],
  loadout: readonly MinghenLoadoutEntry[],
  memory: MinghenTriggerMemory,
  targetId: string,
  apCost: number,
  options?: { shield?: number },
): MinghenAttackResolution {
  let expedition = after;
  let apDelta = 0;
  let spiritGain = 0;
  let shieldGain = 0;
  const attack = events.find((event): event is Extract<PveEvent, { type: 'ATTACK' }> => event.type === 'ATTACK' && event.attackerId === 'PLAYER' && event.targetId === targetId);
  if (!attack) return { expedition, memory, apDelta, spiritGain, shieldGain };
  const beforeTarget = before.floorState.monsters.find((entry) => entry.id === targetId);
  const killed = events.some((event) => event.type === 'KILL' && event.monsterId === targetId);
  const hitCount = events.filter((event) => event.type === 'ATTACK' && event.attackerId === 'PLAYER').length;
  const base = buildAttackContext(before, targetId, beforeTarget ? statusesOf(beforeTarget) : [], options);
  const hooks = ['AFTER_HIT', 'AFTER_ATTACK', ...(killed ? ['KILL'] as const : [])] as const;
  hooks.forEach((hook, index) => {
    const effect = resolveMinghenEffects(loadout, {
      ...base,
      eventId: `${base.turn}:attack:${targetId}:${hook}:${index}`,
      hook,
      apCost,
      actualDamage: attack.damage,
      hitCount,
      killed,
      overkill: killed && beforeTarget ? Math.max(0, attack.damage - beforeTarget.hp) : 0,
      targetHpRatio: beforeTarget ? beforeTarget.hp / Math.max(1, beforeTarget.maxHp) : undefined,
    }, memory);
    expedition = applyEffectToExpedition(expedition, targetId, effect);
    apDelta += effect.apDelta;
    spiritGain += effect.spiritGain;
    shieldGain += effect.shield;
  });
  return { expedition, memory, apDelta, spiritGain, shieldGain };
}

function statusesOf(monster: ExpeditionState['floorState']['monsters'][number]): MinghenStatus[] {
  const result: MinghenStatus[] = [];
  if ((monster.bleedRounds ?? 0) > 0) result.push('BLEED');
  if ((monster.poisonRounds ?? 0) > 0) result.push('POISON');
  if ((monster.burnRounds ?? 0) > 0) result.push('BURN');
  if ((monster.frozenRounds ?? 0) > 0) result.push('CHILL');
  return result;
}

function applyEffectToExpedition(state: ExpeditionState, targetId: string, effect: MinghenEffectResult): ExpeditionState {
  const hp = Math.max(1, Math.min(state.player.maxHp, state.player.hp + Math.round(effect.heal)));
  const ap = Math.max(0, Math.min(state.floorState.maxAp, state.floorState.ap + effect.apDelta));
  return {
    ...state,
    player: { ...state.player, hp },
    floorState: {
      ...state.floorState,
      ap,
      monsters: state.floorState.monsters.map((monster) => {
        if (monster.id !== targetId) return monster;
        let patched = monster;
        effect.applyStatuses.forEach((status) => {
          if (status.id === 'BLEED') patched = { ...patched, bleedRounds: (patched.bleedRounds ?? 0) + status.stacks };
          if (status.id === 'POISON') patched = { ...patched, poisonRounds: (patched.poisonRounds ?? 0) + status.stacks, poisonDamage: 3 };
          if (status.id === 'BURN') patched = { ...patched, burnRounds: (patched.burnRounds ?? 0) + status.stacks };
          if (status.id === 'CHILL') patched = { ...patched, frozenRounds: (patched.frozenRounds ?? 0) + status.stacks };
        });
        return patched;
      }),
    },
  };
}

function mergeEffects(...effects: MinghenEffectResult[]): MinghenEffectResult {
  return effects.reduce((merged, effect) => ({
    damageMultiplierBonus: merged.damageMultiplierBonus + effect.damageMultiplierBonus,
    armorPenetrationBonus: merged.armorPenetrationBonus + effect.armorPenetrationBonus,
    apDelta: merged.apDelta + effect.apDelta,
    spiritGain: merged.spiritGain + effect.spiritGain,
    heal: merged.heal + effect.heal,
    shield: merged.shield + effect.shield,
    moveCostReduction: Math.max(merged.moveCostReduction, effect.moveCostReduction),
    rangeBonus: merged.rangeBonus + effect.rangeBonus,
    applyStatuses: [...merged.applyStatuses, ...effect.applyStatuses],
    secondaryDamageRatio: Math.max(merged.secondaryDamageRatio, effect.secondaryDamageRatio),
    flags: [...merged.flags, ...effect.flags],
    damageReductionRatio: Math.max(merged.damageReductionRatio, effect.damageReductionRatio),
    forcedDisplaceReduction: Math.max(merged.forcedDisplaceReduction, effect.forcedDisplaceReduction),
    transferDamageRatio: Math.max(merged.transferDamageRatio, effect.transferDamageRatio),
    transferMaxTargets: Math.max(merged.transferMaxTargets, effect.transferMaxTargets),
    consumeShieldRatioOfMaxHp: Math.max(merged.consumeShieldRatioOfMaxHp, effect.consumeShieldRatioOfMaxHp),
    shieldToDamageRatio: Math.max(merged.shieldToDamageRatio, effect.shieldToDamageRatio),
    refundConsumedShieldRatio: Math.max(merged.refundConsumedShieldRatio, effect.refundConsumedShieldRatio),
    overflowDamageReductionRatio: Math.max(merged.overflowDamageReductionRatio, effect.overflowDamageReductionRatio),
  }), emptyMinghenEffectResult());
}
