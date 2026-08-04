import { resolveProfessionBaseWithBalance } from '../../assets/scripts/pve/core/PveBalance';
import type { PveBalanceSnapshot } from '../../assets/scripts/pve/core/PveTypes';

function snap(player: Record<string, number>): PveBalanceSnapshot {
  return { globalConfig: { player }, chapterConfigs: {}, unitConfigs: {} };
}

describe('resolveProfessionBaseWithBalance', () => {
  test('falls back to warrior profession when snapshot empty', () => {
    expect(resolveProfessionBaseWithBalance('WARRIOR', null, 1)).toEqual({
      maxHp: 320,
      attack: 13,
      apBase: 7,
      attackRange: 1,
    });
  });

  test('overrides only fields present in GM config', () => {
    const base = resolveProfessionBaseWithBalance('WARRIOR', snap({ initialHp: 9999 }), 1);
    expect(base.maxHp).toBe(9999);
    expect(base.attack).toBe(13);
    expect(base.apBase).toBe(7);
    expect(base.attackRange).toBe(1);
  });

  test('overrides attack range and apBase when set', () => {
    const base = resolveProfessionBaseWithBalance(
      'ARCHER',
      snap({ baseAttack: 100, baseAttackRange: 5, apBase: 20 }),
      1,
    );
    expect(base).toMatchObject({ maxHp: 240, attack: 100, apBase: 20, attackRange: 5 });
  });
});
