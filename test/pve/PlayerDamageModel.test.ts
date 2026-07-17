import {
  applyGroupedPercentBonuses,
  extraAttackDamage,
} from '../../assets/scripts/pve/core/PlayerDamageModel';

describe('PlayerDamageModel', () => {
  it('同类百分比先相加，只取整一次', () => {
    expect(applyGroupedPercentBonuses(101, [
      { active: true, percent: 15 },
      { active: true, percent: 25 },
    ])).toBe(141);
  });

  it('忽略未激活项和负数项', () => {
    expect(applyGroupedPercentBonuses(100, [
      { active: false, percent: 40 },
      { active: true, percent: -20 },
    ])).toBe(100);
  });

  it('追加攻击使用显式比例且至少造成 1 点伤害', () => {
    expect(extraAttackDamage(101, 0.6)).toBe(61);
    expect(extraAttackDamage(0, 0.6)).toBe(1);
  });
});
