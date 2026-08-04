/** 玩家伤害的纯数值分组工具。不得读取框架状态或消耗 RNG。 */

export interface PercentBonus {
  active: boolean;
  percent: number;
}

/** 同类百分比先相加，再统一乘算并只取整一次。 */
export function applyGroupedPercentBonuses(baseDamage: number, bonuses: readonly PercentBonus[]): number {
  const totalPercent = bonuses.reduce(
    (sum, bonus) => sum + (bonus.active ? Math.max(0, bonus.percent) : 0),
    0,
  );
  return Math.max(0, Math.round(baseDamage * (1 + totalPercent / 100)));
}

/** 追加攻击只复制指定比例的最终主段伤害，不重新进入完整触发链。 */
export function extraAttackDamage(mainDamage: number, ratio: number): number {
  return Math.max(1, Math.round(mainDamage * Math.max(0, ratio)));
}
