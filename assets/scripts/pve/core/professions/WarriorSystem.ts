export const WARRIOR_MAX_CHARGE_AP = 3 as const;

export type WarriorTechnique = 'HEAVY' | 'ARMOR_BREAK' | 'KNOCKBACK' | 'SWEEP';

export interface WarriorAttackPreview {
  valid: boolean;
  reason?: 'INVALID_CHARGE' | 'AP_NOT_ENOUGH' | 'TECHNIQUE_LOCKED' | 'CHARGE_NOT_ENOUGH';
  totalApCost: number;
  damageMultiplier: number;
  armorPenetration: number;
  knockback: number;
  /** 相对本次主动最终伤害的碰撞伤比例；0 表示无撞碎。 */
  collisionRatio: number;
  sweepMultiplier: number;
}

/** 相对不蓄力单次：×1.00 / ×1.40 / ×1.75 / ×2.10 */
const CHARGE_BONUS = [0, 0.4, 0.75, 1.1] as const;
/** 蓄力阶梯击退（与武器击退相加，上限另算） */
const CHARGE_KNOCKBACK = [0, 1, 1, 2] as const;
/** 撞到墙/石/敌人时的碰撞伤比例 */
const CHARGE_COLLISION = [0, 0.25, 0.4, 0.55] as const;

const TECHNIQUE_LEVEL: Record<WarriorTechnique, number> = {
  HEAVY: 1,
  ARMOR_BREAK: 3,
  KNOCKBACK: 5,
  SWEEP: 7,
};

export function warriorChargeCollisionRatio(extraChargeAp: number): number {
  if (!Number.isInteger(extraChargeAp) || extraChargeAp < 0 || extraChargeAp > WARRIOR_MAX_CHARGE_AP) return 0;
  return CHARGE_COLLISION[extraChargeAp] ?? 0;
}

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
  const base = {
    totalApCost: input.weaponApCost + input.extraChargeAp,
    armorPenetration: 0,
    knockback: input.weaponKnockback ?? 0,
    collisionRatio: 0,
    sweepMultiplier: 0,
  };
  if (!Number.isInteger(input.extraChargeAp) || input.extraChargeAp < 0 || input.extraChargeAp > WARRIOR_MAX_CHARGE_AP) {
    return { ...base, valid: false, reason: 'INVALID_CHARGE', damageMultiplier: 1 };
  }
  if (base.totalApCost > input.availableAp) return { ...base, valid: false, reason: 'AP_NOT_ENOUGH', damageMultiplier: 1 };
  if (input.masteryLevel < TECHNIQUE_LEVEL[technique]) return { ...base, valid: false, reason: 'TECHNIQUE_LOCKED', damageMultiplier: 1 };
  if (technique !== 'HEAVY' && input.extraChargeAp < 2) return { ...base, valid: false, reason: 'CHARGE_NOT_ENOUGH', damageMultiplier: 1 };

  let bonus = CHARGE_BONUS[input.extraChargeAp] ?? 0;
  let armorPenetration = 0;
  const weaponKb = input.weaponKnockback ?? 0;
  let knockback = Math.min(3, weaponKb + (CHARGE_KNOCKBACK[input.extraChargeAp] ?? 0));
  const collisionRatio = CHARGE_COLLISION[input.extraChargeAp] ?? 0;
  let sweepMultiplier = 0;
  if (technique === 'ARMOR_BREAK') { bonus -= 0.15; armorPenetration = 0.45; }
  if (technique === 'KNOCKBACK') {
    bonus -= 0.2;
    // 震退式：在武器基础上按「额外 AP - 1」击退，并与蓄力撞碎击退取较大值
    knockback = Math.min(3, Math.max(knockback, weaponKb + Math.max(1, input.extraChargeAp - 1)));
  }
  if (technique === 'SWEEP') { bonus -= 0.25; sweepMultiplier = input.weaponHasSweep ? 0.15 : 0.55; }
  return {
    valid: true,
    totalApCost: base.totalApCost,
    damageMultiplier: Math.round((1 + bonus) * 100) / 100,
    armorPenetration,
    knockback,
    collisionRatio,
    sweepMultiplier,
  };
}

export function resolveWarriorKnockback(
  requested: number,
  spacesUntilObstacle: number,
  boss: boolean,
): { moved: number; stagger: number; collided: boolean } {
  const amount = Math.max(0, Math.floor(requested));
  if (boss) return { moved: 0, stagger: amount, collided: amount > 0 };
  const free = Math.max(0, Math.floor(spacesUntilObstacle));
  const moved = Math.min(amount, free);
  return { moved, stagger: 0, collided: amount > free };
}
