import { canAfford, costOf, isExhausted, rollAp, spend } from '../../assets/scripts/pve/core/ApSystem';
import { createRng } from '../../assets/scripts/pve/core/rng';
import { AP_COST } from '../../assets/scripts/pve/core/PveConstants';

describe('ApSystem — 行动点（AC-2, AC-3）', () => {
  it('rollAp：dice ∈ [1,6]，AP = 8 + dice ∈ [9,14]', () => {
    const rng = createRng(2024);
    for (let i = 0; i < 200; i++) {
      const { dice, ap } = rollAp(rng);
      expect(dice).toBeGreaterThanOrEqual(1);
      expect(dice).toBeLessThanOrEqual(6);
      expect(ap).toBe(8 + dice);
      expect(ap).toBeGreaterThanOrEqual(9);
      expect(ap).toBeLessThanOrEqual(14);
    }
  });

  it('rollAp 同种子序列确定可复现', () => {
    const a = rollAp(createRng(777));
    const b = rollAp(createRng(777));
    expect(a).toEqual(b);
  });

  it('costOf 返回 PveConstants.AP_COST 中的固定值', () => {
    expect(costOf('MOVE')).toBe(AP_COST.MOVE);
    expect(costOf('ATTACK')).toBe(AP_COST.ATTACK);
    expect(costOf('OPEN_CHEST')).toBe(AP_COST.OPEN_CHEST);
    expect(costOf('OPEN_EXIT')).toBe(AP_COST.OPEN_EXIT);
    expect(costOf('USE_IDOL')).toBe(AP_COST.USE_IDOL);
    expect(costOf('USE_ALTAR')).toBe(AP_COST.USE_ALTAR);
  });

  it('canAfford / spend：足够时正常扣减', () => {
    expect(canAfford(2, 'MOVE')).toBe(true);
    expect(spend(2, 'MOVE')).toBe(0);
    expect(canAfford(5, 'ATTACK')).toBe(true);
    expect(spend(5, 'ATTACK')).toBe(2); // AP_COST.ATTACK = 3，5-3=2
  });

  it('canAfford：不足时返回 false', () => {
    expect(canAfford(1, 'MOVE')).toBe(false);
    expect(canAfford(0, 'ATTACK')).toBe(false);
  });

  it('spend：AP 不足时抛错，不允许出现负值', () => {
    expect(() => spend(1, 'MOVE')).toThrow();
    expect(() => spend(0, 'ATTACK')).toThrow();
  });

  it('isExhausted：AP 低于最小行动消耗时判定耗尽', () => {
    expect(isExhausted(0)).toBe(true);
    expect(isExhausted(1)).toBe(false); // OPEN_CHEST/EXIT/IDOL 等消耗 1，仍可行动（ATTACK 消耗 3）
    expect(isExhausted(2)).toBe(false);
  });
});
