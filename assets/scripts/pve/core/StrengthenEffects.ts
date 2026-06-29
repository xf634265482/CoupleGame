// 灵气强化词条池扩展（260613-m2-systems-depth 阶段2，AC-404~407）：
// BERSERKER/ARCHER/ROGUE 各新增 10 词条，10 种机制按职业各用不同 id 复用同一实现。
// 详见 specs/260613-m2-systems-depth/design.md §一 与 plan.md T2.4。

import { traitCount } from './AnimaSystem';
import type { FloorState, Monster, RunPlayer } from './PveTypes';

/** HP ≤ 25% 时攻击 ×2（绝境一击 / 致命狩猎 / 暗影突袭）。 */
export const LOW_HP_X2_TRAITS = [] as const;
/** 进阶：HP ≤ 30% 时攻击 ×1.5（可与 LOW_HP_X2 叠乘）。 */
export const LOW_HP_X1_5_TRAITS = [] as const;
/** 受到怪物攻击后，下次主动攻击 +5 伤害（一次性消耗，floor.vengeanceReady）。 */
export const VENGEANCE_TRAITS = ['vengeance'] as const;
/** 攻击命中后对相邻 1 格存活敌人造成 50% 溅射伤害。 */
export const CLEAVE_TRAITS = ['cleave', 'scatter_shot'] as const;
/** 受到的怪物伤害（护甲减伤+倍率后）≥5 时再 -2。 */
export const PAIN_TOLERANCE_TRAITS = ['pain_tolerance'] as const;
/** 攻击 HP ≤ 20% 的目标时 +3 伤害。 */
export const EXECUTIONER_TRAITS = [] as const;
/** 可叠加（上限 5）：选中时立即 maxHp/hp +3。 */
export const IRON_SKIN_STACK_TRAITS = ['iron_skin_stack', 'quiver_stack', 'nimble_stack'] as const;
/** 可叠加（上限 5）：击杀目标时回复等同已选层数的 HP。 */
export const BLOODLUST_STACK_TRAITS = ['bloodlust_stack'] as const;
/** 可叠加（上限 5）：攻击力 + 已选层数 × 0.5（向上取整）。 */
export const RAGE_STRIKE_STACK_TRAITS = [] as const;
/** 进阶 oneShot：本层 HP 首次 ≤30% maxHp 时 AP +3（每层限一次，floor.finalChargeAvailable）。 */
export const FINAL_CHARGE_TRAITS = ['final_charge'] as const;

function hasAny(traits: readonly string[], list: readonly string[]): boolean {
  return list.some((id) => traits.includes(id));
}

function stackTotal(traits: readonly string[], list: readonly string[]): number {
  let total = 0;
  for (const id of list) total += traitCount(traits, id);
  return total;
}

/** 低 HP 攻击倍率：LOW_HP_X2（HP≤25%）与 LOW_HP_X1_5（HP≤30%）可叠乘。 */
export function lowHpAttackMultiplier(traits: readonly string[], player: RunPlayer): number {
  const ratio = player.hp / player.maxHp;
  let mult = 1;
  if (ratio <= 0.25 && hasAny(traits, LOW_HP_X2_TRAITS)) mult *= 2;
  if (ratio <= 0.3 && hasAny(traits, LOW_HP_X1_5_TRAITS)) mult *= 1.5;
  return mult;
}

/** 复仇类词条：floor.vengeanceReady 为 true 且玩家持有对应词条时，本次攻击 +5 伤害。 */
export function vengeanceBonus(traits: readonly string[], floor: FloorState): number {
  return hasAny(traits, VENGEANCE_TRAITS) && (floor.vengeanceReady ?? false) ? 1 : 0;
}

export function hasVengeanceTrait(traits: readonly string[]): boolean {
  return hasAny(traits, VENGEANCE_TRAITS);
}

export function hasCleave(traits: readonly string[]): boolean {
  return hasAny(traits, CLEAVE_TRAITS);
}

/** 怪物造成的伤害（护甲减伤+倍率后）≥5 时返回 2（再减免），否则 0。 */
export function painToleranceReduction(traits: readonly string[], damage: number): number {
  return hasAny(traits, PAIN_TOLERANCE_TRAITS) && damage >= 20 ? Math.round(damage * 0.15) : 0;
}

/** 处决类词条：目标 HP ≤ 20% maxHp 时 +3 伤害。 */
export function executionerBonus(traits: readonly string[], target: Monster): number {
  return hasAny(traits, EXECUTIONER_TRAITS) && target.hp / target.maxHp <= 0.2 ? 3 : 0;
}

/** 击杀回复：已选层数（1~5）即为回复 HP 数值。 */
export function bloodlustStackHeal(traits: readonly string[]): number {
  return stackTotal(traits, BLOODLUST_STACK_TRAITS) * 5;
}

/** 攻击力加成：已选层数 × 0.5（向上取整）。 */
export function rageStrikeStackBonus(traits: readonly string[]): number {
  return Math.round(stackTotal(traits, RAGE_STRIKE_STACK_TRAITS) * 0.5);
}

export function hasFinalCharge(traits: readonly string[]): boolean {
  return hasAny(traits, FINAL_CHARGE_TRAITS);
}
