import type { ProfessionAttackResolution } from '../professions/ProfessionActionSystem';
import type { ExpeditionState, PveEvent } from '../PveTypes';
import type { MinghenLoadoutEntry } from '../PveProgressionTypes';
import { resolveMinghenEffects, type MinghenTriggerMemory } from './MinghenEffects';
import type { MinghenEffectResult, MinghenEventContext, MinghenStatus } from './MinghenEventContext';

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
): MinghenAttackPreview {
  const nextMemory = cloneMinghenMemory(memory);
  const target = targetId ? expedition.floorState.monsters.find((entry) => entry.id === targetId) : undefined;
  const base = attackContext(expedition, targetId, target ? statusesOf(target) : []);
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
  const base = attackContext(before, targetId, beforeTarget ? statusesOf(beforeTarget) : []);
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

function attackContext(expedition: ExpeditionState, targetId: string | undefined, targetStatuses: MinghenStatus[]): MinghenEventContext {
  const floor = expedition.floorState;
  const target = targetId ? floor.monsters.find((entry) => entry.id === targetId) : undefined;
  return {
    eventId: '', hook: 'BEFORE_ATTACK', turn: floor.turn, source: 'ACTIVE_ACTION',
    hp: expedition.player.hp, maxHp: expedition.player.maxHp, apLeft: floor.ap,
    targetId, targetStatuses, targetHasStatus: targetStatuses.length > 0,
    targetHpRatio: target ? target.hp / Math.max(1, target.maxHp) : undefined,
    activeMoveStepsThisTurn: floor.playerStepsThisTurn ?? 0,
    movedThisTurn: (floor.playerStepsThisTurn ?? 0) > 0,
    attackedThisTurn: Boolean(floor.playerAttackedThisTurn),
    hitCount: 1, action: 'ATTACK',
    attackerOnSandPit: floor.entities.some((entity) => entity.type === 'SAND_PIT' && !entity.consumed
      && entity.pos.x === floor.player.x && entity.pos.y === floor.player.y),
  };
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
  }));
}
