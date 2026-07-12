import type { FloorChallengeRuntimeState } from '../FloorChallengeState';
import { previewArcherAttack, type ArcherTechnique } from './ArcherSystem';
import { recordRangerAction, useRangerFinisher, type RangerFinisher } from './RangerSystem';
import { previewWarriorAttack, type WarriorTechnique } from './WarriorSystem';

export type ProfessionAttackChoice =
  | { professionId: 'WARRIOR'; extraChargeAp: number; technique?: WarriorTechnique }
  | { professionId: 'ARCHER'; technique?: ArcherTechnique; straightProjectile?: boolean }
  | { professionId: 'RANGER' };

export interface ProfessionAttackResolution {
  valid: boolean;
  reason?: string;
  apCost: number;
  damageMultiplier: number;
  armorPenetration: number;
  rangeBonus: number;
  knockback: number;
  secondaryMultiplier: number;
  suppression: boolean;
  chargeLevel: number;
}

function invalid(reason: string): ProfessionAttackResolution {
  return { valid: false, reason, apCost: 0, damageMultiplier: 1, armorPenetration: 0, rangeBonus: 0, knockback: 0, secondaryMultiplier: 0, suppression: false, chargeLevel: 0 };
}

export function previewProfessionAttack<T>(
  state: FloorChallengeRuntimeState<T>,
  weapon: { apCost: number; knockback?: number; hasSweep?: boolean; straightProjectile?: boolean },
  masteryLevel: number,
  choice: ProfessionAttackChoice,
): ProfessionAttackResolution {
  const professionId = state.config.professionId;
  if (choice.professionId !== professionId) return invalid('PROFESSION_CHOICE_MISMATCH');
  if (professionId === 'WARRIOR' && choice.professionId === 'WARRIOR') {
    const result = previewWarriorAttack({ availableAp: state.resources.ap, weaponApCost: weapon.apCost, extraChargeAp: choice.extraChargeAp, masteryLevel, technique: choice.technique, weaponKnockback: weapon.knockback, weaponHasSweep: weapon.hasSweep });
    return result.valid
      ? { valid: true, apCost: result.totalApCost, damageMultiplier: result.damageMultiplier, armorPenetration: result.armorPenetration, rangeBonus: 0, knockback: result.knockback, secondaryMultiplier: result.sweepMultiplier, suppression: false, chargeLevel: choice.extraChargeAp }
      : invalid(result.reason ?? 'INVALID_ATTACK');
  }
  if (professionId === 'ARCHER' && choice.professionId === 'ARCHER') {
    const result = previewArcherAttack({ aimLevel: state.profession.archerAimLevel, masteryLevel, technique: choice.technique, weaponApCost: weapon.apCost, availableAp: state.resources.ap, straightProjectile: choice.straightProjectile ?? weapon.straightProjectile });
    return result.valid
      ? { valid: true, apCost: result.apCost, damageMultiplier: result.damageMultiplier, armorPenetration: result.armorPenetration, rangeBonus: result.rangeBonus, knockback: weapon.knockback ?? 0, secondaryMultiplier: result.secondaryMultiplier, suppression: result.suppression, chargeLevel: 0 }
      : invalid(result.reason);
  }
  if (professionId === 'RANGER' && choice.professionId === 'RANGER') {
    if (weapon.apCost > state.resources.ap) return invalid('AP_NOT_ENOUGH');
    return { valid: true, apCost: weapon.apCost, damageMultiplier: state.profession.rangerPendingAttackMultiplier, armorPenetration: state.profession.rangerPendingArmorPenetration, rangeBonus: 0, knockback: weapon.knockback ?? 0, secondaryMultiplier: 0, suppression: false, chargeLevel: 0 };
  }
  return invalid('PROFESSION_NOT_SUPPORTED');
}

export function commitProfessionAttack<T>(state: FloorChallengeRuntimeState<T>, resolution: ProfessionAttackResolution, now = Date.now()): FloorChallengeRuntimeState<T> {
  if (state.status !== 'ACTIVE') throw new Error('FLOOR_RUNTIME_NOT_ACTIVE');
  if (!resolution.valid || resolution.apCost < 1 || resolution.apCost > state.resources.ap) throw new Error('INVALID_PROFESSION_ATTACK_COMMIT');
  let profession = { ...state.profession };
  if (state.config.professionId === 'WARRIOR') profession.warriorChargeLevel = resolution.chargeLevel;
  if (state.config.professionId === 'RANGER') {
    const ranger = recordRangerAction({ combo: profession.rangerCombo, lastAction: profession.rangerLastAction, pendingAttackMultiplier: profession.rangerPendingAttackMultiplier, pendingArmorPenetration: profession.rangerPendingArmorPenetration }, 'ATTACK');
    profession = { ...profession, rangerCombo: ranger.combo, rangerLastAction: ranger.lastAction, rangerPendingAttackMultiplier: 1, rangerPendingArmorPenetration: 0 };
  }
  return { ...state, resources: { ...state.resources, ap: state.resources.ap - resolution.apCost }, profession, updatedAt: now };
}

export function commitRangerFinisher<T>(state: FloorChallengeRuntimeState<T>, finisher: RangerFinisher, masteryLevel: number, now = Date.now()) {
  if (state.status !== 'ACTIVE' || state.config.professionId !== 'RANGER') throw new Error('RANGER_FINISHER_NOT_AVAILABLE');
  const result = useRangerFinisher({ combo: state.profession.rangerCombo, lastAction: state.profession.rangerLastAction, pendingAttackMultiplier: state.profession.rangerPendingAttackMultiplier, pendingArmorPenetration: state.profession.rangerPendingArmorPenetration }, finisher, masteryLevel);
  if (!result.valid) return { state, valid: false as const, reason: result.reason };
  return {
    state: { ...state, profession: { ...state.profession, rangerCombo: result.state.combo, rangerLastAction: result.state.lastAction, rangerPendingAttackMultiplier: result.state.pendingAttackMultiplier, rangerPendingArmorPenetration: result.state.pendingArmorPenetration }, updatedAt: now },
    valid: true as const,
    freeMoveRange: result.freeMoveRange,
    shieldMaxHpRatio: result.shieldMaxHpRatio,
    adjacentDamageMultiplier: result.adjacentDamageMultiplier,
  };
}

export function commitProfessionMove<T>(state: FloorChallengeRuntimeState<T>, apCost: number, forced = false, now = Date.now()): FloorChallengeRuntimeState<T> {
  if (state.status !== 'ACTIVE') throw new Error('FLOOR_RUNTIME_NOT_ACTIVE');
  const cost = forced ? 0 : Math.max(1, Math.trunc(apCost));
  if (cost > state.resources.ap) throw new Error('AP_NOT_ENOUGH');
  let profession = { ...state.profession };
  if (state.config.professionId === 'ARCHER' && !forced) {
    profession.archerAimLevel = Math.max(0, profession.archerAimLevel - 1);
    profession.archerMovedThisTurn = true;
  }
  if (state.config.professionId === 'RANGER' && !forced) {
    const ranger = recordRangerAction({ combo: profession.rangerCombo, lastAction: profession.rangerLastAction, pendingAttackMultiplier: profession.rangerPendingAttackMultiplier, pendingArmorPenetration: profession.rangerPendingArmorPenetration }, 'MOVE');
    profession.rangerCombo = ranger.combo;
    profession.rangerLastAction = ranger.lastAction;
  }
  return { ...state, resources: { ...state.resources, ap: state.resources.ap - cost }, profession, updatedAt: now };
}

export function endProfessionTurn<T>(state: FloorChallengeRuntimeState<T>, nextTurnAp: number, now = Date.now()): FloorChallengeRuntimeState<T> {
  if (state.status !== 'ACTIVE') throw new Error('FLOOR_RUNTIME_NOT_ACTIVE');
  const profession = { ...state.profession, warriorChargeLevel: 0 };
  if (state.config.professionId === 'ARCHER') {
    if (!profession.archerMovedThisTurn) profession.archerAimLevel = Math.min(3, profession.archerAimLevel + 1);
    profession.archerMovedThisTurn = false;
  }
  if (state.config.professionId === 'RANGER') {
    profession.rangerCombo = 0; profession.rangerLastAction = null; profession.rangerPendingAttackMultiplier = 1; profession.rangerPendingArmorPenetration = 0;
  }
  const maxAp = Math.max(1, Math.trunc(nextTurnAp));
  return { ...state, turn: state.turn + 1, resources: { ...state.resources, ap: maxAp, maxAp }, profession, updatedAt: now };
}
