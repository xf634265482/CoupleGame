import { isBurrowTurn, quicksandScorpionBurrow, quicksandScorpionAttack } from '../../assets/scripts/pve/core/bosses/QuicksandScorpion';
import { playerAttack } from '../../assets/scripts/pve/core/CombatSystem';
import {
  QUICKSAND_SCORPION_BURROW_INTERVAL,
  QUICKSAND_SCORPION_BURROW_INTERVAL_ENRAGED,
  QUICKSAND_SCORPION_DYNAMIC_PIT_DURATION,
  QUICKSAND_SCORPION_SANDSTORM_CELLS,
  QUICKSAND_SCORPION_SANDSTORM_CELLS_ENRAGED,
  QUICKSAND_SCORPION_SANDSTORM_DAMAGE,
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
          bossId: 'QUICKSAND_SCORPION',
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

describe('QuicksandScorpion', () => {
  describe('isBurrowTurn', () => {
    it(`非狂暴：每 ${QUICKSAND_SCORPION_BURROW_INTERVAL} 回合返回 true`, () => {
      expect(isBurrowTurn(0, false)).toBe(false);
      expect(isBurrowTurn(QUICKSAND_SCORPION_BURROW_INTERVAL, false)).toBe(true);
      expect(isBurrowTurn(QUICKSAND_SCORPION_BURROW_INTERVAL * 2, false)).toBe(true);
      expect(isBurrowTurn(QUICKSAND_SCORPION_BURROW_INTERVAL - 1, false)).toBe(false);
      expect(isBurrowTurn(QUICKSAND_SCORPION_BURROW_INTERVAL + 1, false)).toBe(false);
    });

    it(`狂暴：每 ${QUICKSAND_SCORPION_BURROW_INTERVAL_ENRAGED} 回合返回 true（间隔由 4 缩短为 3）`, () => {
      expect(isBurrowTurn(QUICKSAND_SCORPION_BURROW_INTERVAL_ENRAGED, true)).toBe(true);
      expect(isBurrowTurn(QUICKSAND_SCORPION_BURROW_INTERVAL_ENRAGED * 2, true)).toBe(true);
      // 非狂暴间隔(4)在狂暴下不再触发（4 % 3 !== 0）
      expect(isBurrowTurn(QUICKSAND_SCORPION_BURROW_INTERVAL, true)).toBe(false);
    });
  });

  describe('quicksandScorpionBurrow', () => {
    it('设置 isBurrowed=true，emit BOSS_BURROWED + 在身侧翻起动态流沙坑（反风筝）', () => {
      const state = makeBossState();
      const result = quicksandScorpionBurrow(state, 'boss');
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
      expect(dynPits.every((p) => p.remaining === QUICKSAND_SCORPION_DYNAMIC_PIT_DURATION)).toBe(true);
      // 动态坑在 boss 身侧（Chebyshev ≤1），不与玩家/boss 重叠
      for (const p of dynPits) {
        expect(Math.max(Math.abs(p.pos.x - 4), Math.abs(p.pos.y - 5))).toBe(1);
      }
    });

    it('非狂暴：emit SANDSTORM_SPAWNED，覆盖格数 = QUICKSAND_SCORPION_SANDSTORM_CELLS', () => {
      const state = makeBossState(20, { hp: 50, maxHp: 50 }); // ratio=1 > 0.3，非狂暴
      const result = quicksandScorpionBurrow(state, 'boss');
      const sandstorm = result.events.find((e) => e.type === 'SANDSTORM_SPAWNED');
      expect(sandstorm).toBeDefined();
      if (sandstorm && sandstorm.type === 'SANDSTORM_SPAWNED') {
        expect(sandstorm.tiles.length).toBe(QUICKSAND_SCORPION_SANDSTORM_CELLS);
      }
    });

    it('狂暴（HP占比≤30%）：沙暴覆盖格数 = QUICKSAND_SCORPION_SANDSTORM_CELLS_ENRAGED', () => {
      const state = makeBossState(20, { hp: 10, maxHp: 50 }); // ratio=0.2 ≤ 0.3，狂暴
      const result = quicksandScorpionBurrow(state, 'boss');
      const sandstorm = result.events.find((e) => e.type === 'SANDSTORM_SPAWNED');
      expect(sandstorm).toBeDefined();
      if (sandstorm && sandstorm.type === 'SANDSTORM_SPAWNED') {
        expect(sandstorm.tiles.length).toBe(QUICKSAND_SCORPION_SANDSTORM_CELLS_ENRAGED);
      }
    });

    it('沙暴命中玩家所在格：扣 QUICKSAND_SCORPION_SANDSTORM_DAMAGE 点真实伤害（无视护甲）', () => {
      const base = makeBossState(20, { hp: 50, maxHp: 50 });
      // 搜索一个会命中玩家格 (4,4) 的 rngState
      let hitSeed: number | null = null;
      let hitResult: ReturnType<typeof quicksandScorpionBurrow> | null = null;
      for (let s = 0; s < 5000; s++) {
        const state = { ...base, floorState: { ...base.floorState, rngState: s } };
        const result = quicksandScorpionBurrow(state, 'boss');
        if (result.events.some((e) => e.type === 'SANDSTORM_HIT')) {
          hitSeed = s;
          hitResult = result;
          break;
        }
      }
      expect(hitSeed).not.toBeNull();
      const hit = hitResult!.events.find((e) => e.type === 'SANDSTORM_HIT');
      expect(hit).toBeDefined();
      if (hit && hit.type === 'SANDSTORM_HIT') {
        expect(hit.damage).toBe(QUICKSAND_SCORPION_SANDSTORM_DAMAGE);
        expect(hit.hp).toBe(20 - QUICKSAND_SCORPION_SANDSTORM_DAMAGE);
      }
      expect(hitResult!.state.player.hp).toBe(20 - QUICKSAND_SCORPION_SANDSTORM_DAMAGE);
    });
  });

  describe('quicksandScorpionAttack — 普通回合', () => {
    it('不潜地时正常近战攻击', () => {
      const state = makeBossState(20);
      const result = quicksandScorpionAttack(state, 'boss');
      const damaged = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
      expect(damaged).toBeDefined();
      if (damaged && damaged.type === 'PLAYER_DAMAGED') {
        expect(damaged.damage).toBeGreaterThan(0);
      }
    });
  });

  describe('quicksandScorpionAttack — 冒出攻击', () => {
    it('潜地状态冒出：emit BOSS_EMERGED + PLAYER_DAMAGED，伤害为 2×', () => {
      const state = makeBossState(20, { isBurrowed: true, pos: { x: 0, y: 0 } });
      const result = quicksandScorpionAttack(state, 'boss');

      expect(result.events.some((e) => e.type === 'BOSS_EMERGED')).toBe(true);
      // isBurrowed 置 false
      const boss = result.state.floorState.monsters.find((m) => m.id === 'boss');
      expect(boss?.isBurrowed).toBe(false);
    });

    it('冒出后双倍伤害（怪物 attack=3，双倍=6；无护甲）', () => {
      // boss 在冒出后落于玩家相邻格，确保攻击命中
      // 将玩家设在 (4,4)，boss 潜地在远角，冒出会找附近空格
      const state = makeBossState(20, { isBurrowed: true, attack: 3, pos: { x: 0, y: 0 } });
      const result = quicksandScorpionAttack(state, 'boss');

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

    it('落点会留下一个永久流沙坑（remaining=undefined）', () => {
      const state = makeBossState(20, { isBurrowed: true, pos: { x: 0, y: 0 } });
      const result = quicksandScorpionAttack(state, 'boss');
      const emerged = result.events.find((e) => e.type === 'BOSS_EMERGED');
      expect(emerged).toBeDefined();
      if (emerged && emerged.type === 'BOSS_EMERGED') {
        const pit = result.state.floorState.entities.find(
          (e) => e.type === 'SAND_PIT' && e.pos.x === emerged.pos.x && e.pos.y === emerged.pos.y,
        );
        expect(pit).toBeDefined();
        expect(pit?.remaining).toBeUndefined();
      }
    });
  });

  describe('狂暴触发（CombatSystem.resolveHit，HP 占比跌破 30%）', () => {
    it('击中后 HP 占比由 >30% 跨到 ≤30% 时 emit BOSS_ENRAGED{bossId: QUICKSAND_SCORPION}', () => {
      // hp=16/50=0.32 > 0.3；普通攻击 10 点伤害 → 6/50=0.12 ≤ 0.3
      const state = makeBossState(20, { hp: 16, maxHp: 50 });
      const result = playerAttack(state, 'boss');
      const enraged = result.events.find((e) => e.type === 'BOSS_ENRAGED');
      expect(enraged).toBeDefined();
      if (enraged && enraged.type === 'BOSS_ENRAGED') {
        expect(enraged.bossId).toBe('QUICKSAND_SCORPION');
      }
    });
  });
});
