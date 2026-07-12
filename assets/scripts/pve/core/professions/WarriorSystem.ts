export const WARRIOR_MAX_CHARGE_AP = 3 as const;

export type WarriorTechnique = 'HEAVY' | 'ARMOR_BREAK' | 'KNOCKBACK' | 'SWEEP';

export interface WarriorAttackPreview {
  valid: boolean;
  reason?: 'INVALID_CHARGE' | 'AP_NOT_ENOUGH' | 'TECHNIQUE_LOCKED' | 'CHARGE_NOT_ENOUGH';
  totalApCost: number;
  damageMultiplier: number;
  armorPenetration: number;
  knockback: number;
  sweepMultiplier: number;
}

const CHARGE_BONUS = [0, 0.25, 0.5, 0.8] as const;
const TECHNIQUE_LEVEL: Record<WarriorTechnique, number> = {
  HEAVY: 1,
  ARMOR_BREAK: 3,
  KNOCKBACK: 5,
  SWEEP: 7,
};

export function previewWarriorAttack(input: {
  availableAp: number;
  weaponApCost: number;
  extraChargeAp: number;
  masteryLevel: number;
  technique?: WarriorTechnique;
  weaponKnockback?: number;
  weaponHasSweep?: boolean;
}): WarriorAttackPreview {
  const technique = input.technique ?? 'HEAVY';
  const base = { totalApCost: input.weaponApCost + input.extraChargeAp, armorPenetration: 0, knockback: input.weaponKnockback ?? 0, sweepMultiplier: 0 };
  if (!Number.isInteger(input.extraChargeAp) || input.extraChargeAp < 0 || input.extraChargeAp > WARRIOR_MAX_CHARGE_AP) {
    return { ...base, valid: false, reason: 'INVALID_CHARGE', damageMultiplier: 1 };
  }
  if (base.totalApCost > input.availableAp) return { ...base, valid: false, reason: 'AP_NOT_ENOUGH', damageMultiplier: 1 };
  if (input.masteryLevel < TECHNIQUE_LEVEL[technique]) return { ...base, valid: false, reason: 'TECHNIQUE_LOCKED', damageMultiplier: 1 };
  if (technique !== 'HEAVY' && input.extraChargeAp < 2) return { ...base, valid: false, reason: 'CHARGE_NOT_ENOUGH', damageMultiplier: 1 };

  let bonus = CHARGE_BONUS[input.extraChargeAp];
  let armorPenetration = 0;
  let knockback = input.weaponKnockback ?? 0;
  let sweepMultiplier = 0;
  if (technique === 'ARMOR_BREAK') { bonus -= 0.15; armorPenetration = 0.45; }
  if (technique === 'KNOCKBACK') { bonus -= 0.2; knockback = Math.min(3, knockback + input.extraChargeAp - 1); }
  if (technique === 'SWEEP') { bonus -= 0.25; sweepMultiplier = input.weaponHasSweep ? 0.15 : 0.55; }
  return { valid: true, totalApCost: base.totalApCost, damageMultiplier: 1 + bonus, armorPenetration, knockback, sweepMultiplier };
}

export function resolveWarriorKnockback(requested: number, spacesUntilObstacle: number, boss: boolean): { moved: number; stagger: number } {
  const amount = Math.max(0, Math.floor(requested));
  if (boss) return { moved: 0, stagger: amount };
  return { moved: Math.min(amount, Math.max(0, Math.floor(spacesUntilObstacle))), stagger: 0 };
}
