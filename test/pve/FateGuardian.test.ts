import { fateGuardianAttack, fateGuardianEvade } from '../../assets/scripts/pve/core/bosses/FateGuardian';
import { makeExpeditionState, makeMonster } from './helpers';

function makeBossState(playerHp: number, playerMaxHp = 200) {
  return makeExpeditionState({
    chapter: 5,
    floorOverrides: {
      player: { x: 4, y: 4 },
      ap: 10,
      turn: 1,
      monsters: [
        makeMonster('boss', { x: 4, y: 5 }, {
          type: 'BOSS',
          bossId: 'FATE_GUARDIAN',
          hp: 1200,
          maxHp: 1200,
          attack: 30,
          range: 1,
          aggroRadius: 99,
        }),
      ],
    },
    playerOverrides: { hp: playerHp, maxHp: playerMaxHp },
  });
}

describe('FateGuardian', () => {
  describe('fateGuardianAttack — 双倍伤害（HP > 50%）', () => {
    it('玩家 HP > 50% 时造成 2 倍有效伤害', () => {
      const state = makeBossState(200, 200); // HP = 100%
      const result = fateGuardianAttack(state, 'boss');

      const damaged = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
      expect(damaged).toBeDefined();
      if (damaged && damaged.type === 'PLAYER_DAMAGED') {
        // boss.attack=30, 无护甲 → 正常 30, 双倍 60
        expect(damaged.damage).toBe(60);
      }
    });

    it('玩家 HP ≤ 50% 时造成普通伤害', () => {
      const state = makeBossState(100, 200); // HP = 50%
      const result = fateGuardianAttack(state, 'boss');

      const damaged = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
      expect(damaged).toBeDefined();
      if (damaged && damaged.type === 'PLAYER_DAMAGED') {
        // boss.attack=30, 无护甲 → 正常 30
        expect(damaged.damage).toBe(30);
      }
    });
  });

  describe('fateGuardianEvade', () => {
    it('玩家 HP > 50% 时不触发闪避', () => {
      const state = makeBossState(200, 200);
      const result = fateGuardianEvade(state, 'boss');
      expect(result.dodged).toBe(false);
    });

    it('玩家 HP ≤ 50% 时存在闪避概率（确定性：相同种子→相同结果）', () => {
      const stateA = makeBossState(100, 200);
      const stateB = makeBossState(100, 200);
      const rA = fateGuardianEvade(stateA, 'boss');
      const rB = fateGuardianEvade(stateB, 'boss');
      // 确定性：同种子同状态→同结果
      expect(rA.dodged).toBe(rB.dodged);
    });

    it('BOSS 不存在或已死亡时不触发闪避', () => {
      const state = makeBossState(100, 200);
      const r = fateGuardianEvade(state, 'nonexistent');
      expect(r.dodged).toBe(false);
    });
  });
});
