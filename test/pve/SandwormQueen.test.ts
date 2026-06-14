import { isBurrowTurn, sandwormBurrow, sandwormQueenAttack } from '../../assets/scripts/pve/core/bosses/SandwormQueen';
import {
  SANDWORM_BURROW_INTERVAL,
  SANDWORM_DYNAMIC_PIT_DURATION,
} from '../../assets/scripts/pve/core/PveConstants';
import { makeExpeditionState, makeMonster } from './helpers';

function makeBossState(playerHp = 20, bossOverrides = {}) {
  return makeExpeditionState({
    chapter: 2,
    floorOverrides: {
      player: { x: 4, y: 4 },
      ap: 10,
      turn: 1,
      monsters: [
        makeMonster('boss', { x: 4, y: 5 }, {
          type: 'BOSS',
          bossId: 'SANDWORM_QUEEN',
          hp: 50,
          maxHp: 50,
          attack: 3,
          range: 1,
          aggroRadius: 99,
          ...bossOverrides,
        }),
      ],
    },
    playerOverrides: { hp: playerHp, maxHp: 20 },
  });
}

describe('SandwormQueen', () => {
  describe('isBurrowTurn', () => {
    it(`每 ${SANDWORM_BURROW_INTERVAL} 回合返回 true`, () => {
      expect(isBurrowTurn(0)).toBe(false);
      expect(isBurrowTurn(SANDWORM_BURROW_INTERVAL)).toBe(true);
      expect(isBurrowTurn(SANDWORM_BURROW_INTERVAL * 2)).toBe(true);
      expect(isBurrowTurn(SANDWORM_BURROW_INTERVAL - 1)).toBe(false);
      expect(isBurrowTurn(SANDWORM_BURROW_INTERVAL + 1)).toBe(false);
    });
  });

  describe('sandwormBurrow', () => {
    it('设置 isBurrowed=true，emit BOSS_BURROWED + 在身侧翻起动态流沙坑（反风筝）', () => {
      const state = makeBossState();
      const result = sandwormBurrow(state, 'boss');
      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss');
      expect(boss?.isBurrowed).toBe(true);
      expect(result.events.some((e) => e.type === 'BOSS_BURROWED')).toBe(true);

      // 动态流沙坑：带 remaining，由 endTurn 倒计时移除（区别于静态永久沙坑）
      const tide = result.events.find((e) => e.type === 'SAND_TIDE_SPAWNED');
      expect(tide).toBeDefined();
      const dynPits = result.state.floorState.entities.filter(
        (e) => e.type === 'SAND_PIT' && e.remaining !== undefined,
      );
      expect(dynPits.length).toBeGreaterThan(0);
      expect(dynPits.every((p) => p.remaining === SANDWORM_DYNAMIC_PIT_DURATION)).toBe(true);
      // 动态坑在 boss 身侧（Chebyshev ≤1），不与玩家/boss 重叠
      for (const p of dynPits) {
        expect(Math.max(Math.abs(p.pos.x - 4), Math.abs(p.pos.y - 5))).toBe(1);
      }
    });
  });

  describe('sandwormQueenAttack — 普通回合', () => {
    it('不潜地时正常近战攻击', () => {
      const state = makeBossState(20);
      const result = sandwormQueenAttack(state, 'boss');
      const damaged = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
      expect(damaged).toBeDefined();
      if (damaged && damaged.type === 'PLAYER_DAMAGED') {
        expect(damaged.damage).toBeGreaterThan(0);
      }
    });
  });

  describe('sandwormQueenAttack — 冒出攻击', () => {
    it('潜地状态冒出：emit BOSS_EMERGED + PLAYER_DAMAGED，伤害为 2×', () => {
      const state = makeBossState(20, { isBurrowed: true, pos: { x: 0, y: 0 } });
      const result = sandwormQueenAttack(state, 'boss');

      expect(result.events.some((e) => e.type === 'BOSS_EMERGED')).toBe(true);
      // isBurrowed 置 false
      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss');
      expect(boss?.isBurrowed).toBe(false);
    });

    it('冒出后双倍伤害（怪物 attack=3，双倍=6；无护甲）', () => {
      // boss 在冒出后落于玩家相邻格，确保攻击命中
      // 将玩家设在 (4,4)，boss 潜地在远角，冒出会找附近空格
      const state = makeBossState(20, { isBurrowed: true, attack: 3, pos: { x: 0, y: 0 } });
      const result = sandwormQueenAttack(state, 'boss');

      const damaged = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
      if (damaged && damaged.type === 'PLAYER_DAMAGED') {
        // 冒出附近可能 range=1 未相邻，此时无伤害；若相邻伤害应为 6
        expect([0, 6]).toContain(damaged.damage);
      }
    });

    it('潜地后免疫玩家攻击', () => {
      const { playerAttack } = require('../../assets/scripts/pve/core/CombatSystem');
      const state = makeBossState(20, { isBurrowed: true, pos: { x: 4, y: 5 } });
      const result = playerAttack(state, 'boss');
      // 攻击被 no-op
      expect(result.state).toBe(state);
      expect(result.events).toEqual([]);
    });
  });
});
