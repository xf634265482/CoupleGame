export type ArcherTechnique = 'NORMAL' | 'PIERCING' | 'WEAK_POINT' | 'SUPPRESSING';

export interface ArcherTurnState { aimLevel: number; movedThisTurn: boolean; }

export function createArcherState(aimLevel = 0): ArcherTurnState {
  return { aimLevel: Math.max(0, Math.min(3, Math.floor(aimLevel))), movedThisTurn: false };
}

export function onArcherMove(state: ArcherTurnState, forced = false): ArcherTurnState {
  return forced ? state : { aimLevel: Math.max(0, state.aimLevel - 1), movedThisTurn: true };
}

export function endArcherTurn(state: ArcherTurnState): ArcherTurnState {
  return { aimLevel: state.movedThisTurn ? state.aimLevel : Math.min(3, state.aimLevel + 1), movedThisTurn: false };
}

export function previewArcherAttack(input: { aimLevel: number; masteryLevel: number; technique?: ArcherTechnique; weaponApCost: number; availableAp: number; straightProjectile?: boolean }) {
  const technique = input.technique ?? 'NORMAL';
  const requiredLevel = technique === 'PIERCING' ? 3 : technique === 'WEAK_POINT' ? 5 : technique === 'SUPPRESSING' ? 7 : 1;
  if (input.masteryLevel < requiredLevel) return { valid: false as const, reason: 'TECHNIQUE_LOCKED' as const };
  if (technique === 'PIERCING' && (!input.straightProjectile || input.aimLevel < 2)) return { valid: false as const, reason: 'AIM_OR_SHAPE_INVALID' as const };
  if (technique === 'WEAK_POINT' && input.aimLevel < 3) return { valid: false as const, reason: 'AIM_NOT_ENOUGH' as const };
  if (technique === 'SUPPRESSING' && input.aimLevel < 2) return { valid: false as const, reason: 'AIM_NOT_ENOUGH' as const };
  const apCost = input.weaponApCost + (technique === 'WEAK_POINT' ? 1 : 0);
  if (apCost > input.availableAp) return { valid: false as const, reason: 'AP_NOT_ENOUGH' as const };
  const aimDamage = [0, 0.1, 0.2, 0.3][Math.max(0, Math.min(3, input.aimLevel))];
  return {
    valid: true as const, apCost,
    damageMultiplier: 1 + aimDamage + (technique === 'WEAK_POINT' ? 0.35 : 0) - (technique === 'PIERCING' ? 0.1 : 0) - (technique === 'SUPPRESSING' ? 0.2 : 0),
    armorPenetration: (input.aimLevel >= 3 ? 0.2 : input.aimLevel >= 2 ? 0.1 : 0),
    rangeBonus: input.aimLevel >= 3 ? 1 : 0,
    secondaryMultiplier: technique === 'PIERCING' ? 0.5 : 0,
    suppression: technique === 'SUPPRESSING',
  };
}
