import { playerAttackPower } from '../../assets/scripts/pve/core/CombatSystem';
import { makeRunPlayer } from './helpers';

describe('playerAttackPower GM balance', () => {
  test('uses GM baseAttack and range when snapshot provided', () => {
    const player = makeRunPlayer({ classId: 'BERSERKER', equipment: {} });
    const balance = {
      globalConfig: { player: { baseAttack: 100, baseAttackRange: 4 } },
      chapterConfigs: {},
      unitConfigs: {},
    };
    const withGm = playerAttackPower(player, balance, 1);
    expect(withGm.damage).toBe(100);
    expect(withGm.range).toBe(4);
    const without = playerAttackPower(player);
    expect(without.damage).toBe(13);
    expect(without.range).toBe(1);
  });
});
