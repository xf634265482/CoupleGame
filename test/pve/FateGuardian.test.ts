import {
  fateGuardianAttack,
  fateProphecyStep,
  isProphecyTurn,
} from '../../assets/scripts/pve/core/bosses/FateGuardian';
import { FATE_PROPHECY_INTERVAL } from '../../assets/scripts/pve/core/PveConstants';
import { makeExpeditionState, makeMonster } from './helpers';
import type { Coord } from '../../assets/scripts/pve/core/PveTypes';

function makeBossState(
  playerHp: number,
  playerMaxHp = 200,
  turn = 1,
  fateProphecy?: { center: Coord },
) {
  return makeExpeditionState({
    chapter: 5,
    floorOverrides: {
      player: { x: 4, y: 4 },
      ap: 10,
      turn,
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
      ...(fateProphecy ? { fateProphecy } : {}),
    },
    playerOverrides: { hp: playerHp, maxHp: playerMaxHp },
  });
}

describe('FateGuardian', () => {
  describe('fateGuardianAttack — 高血双倍（保留）', () => {
    it('玩家 HP > 50% 时造成 2 倍有效伤害', () => {
      const state = makeBossState(200, 200); // HP = 100%
      const result = fateGuardianAttack(state, 'boss');
      const damaged = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
      expect(damaged && damaged.type === 'PLAYER_DAMAGED' ? damaged.damage : 0).toBe(60);
    });

    it('玩家 HP ≤ 50% 时造成普通伤害', () => {
      const state = makeBossState(100, 200); // HP = 50%
      const result = fateGuardianAttack(state, 'boss');
      const damaged = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
      expect(damaged && damaged.type === 'PLAYER_DAMAGED' ? damaged.damage : 0).toBe(30);
    });
  });

  describe('命运预言（反风筝，替代随机闪避）', () => {
    it(`isProphecyTurn 每 ${FATE_PROPHECY_INTERVAL} 回合触发`, () => {
      expect(isProphecyTurn(0)).toBe(false);
      expect(isProphecyTurn(FATE_PROPHECY_INTERVAL)).toBe(true);
      expect(isProphecyTurn(FATE_PROPHECY_INTERVAL * 2)).toBe(true);
      expect(isProphecyTurn(FATE_PROPHECY_INTERVAL + 1)).toBe(false);
    });

    it('预言回合无待定预言 → 标记玩家当前格（PROPHECY_MARKED + 写入 fateProphecy）', () => {
      const state = makeBossState(200, 200, FATE_PROPHECY_INTERVAL);
      const result = fateProphecyStep(state, 'boss');
      expect(result.events).toEqual([{ type: 'PROPHECY_MARKED', center: { x: 4, y: 4 } }]);
      expect(result.state.floorState.fateProphecy).toEqual({ center: { x: 4, y: 4 } });
    });

    it('存在待定预言且玩家仍在 3×3 内 → 结算 attack×1 伤害 + PROPHECY_RESOLVED，清空预言', () => {
      const state = makeBossState(200, 200, FATE_PROPHECY_INTERVAL + 1, { center: { x: 4, y: 4 } });
      const result = fateProphecyStep(state, 'boss');
      expect(result.events.some((e) => e.type === 'PROPHECY_RESOLVED')).toBe(true);
      const dmg = result.events.find((e) => e.type === 'PLAYER_DAMAGED');
      expect(dmg && dmg.type === 'PLAYER_DAMAGED' ? dmg.damage : 0).toBe(30); // 30 × 1.0
      expect(result.state.player.hp).toBe(170);
      expect(result.state.floorState.fateProphecy).toBeUndefined();
    });

    it('结算时玩家已走出 3×3 → 仅 PROPHECY_RESOLVED，无伤害', () => {
      const state = makeBossState(200, 200, FATE_PROPHECY_INTERVAL + 1, { center: { x: 0, y: 0 } });
      const result = fateProphecyStep(state, 'boss');
      expect(result.events).toEqual([{ type: 'PROPHECY_RESOLVED', center: { x: 0, y: 0 } }]);
      expect(result.state.player.hp).toBe(200);
      expect(result.state.floorState.fateProphecy).toBeUndefined();
    });

    it('非预言回合且无待定预言 → no-op', () => {
      const state = makeBossState(200, 200, 1);
      const result = fateProphecyStep(state, 'boss');
      expect(result.events).toEqual([]);
      expect(result.state.floorState.fateProphecy).toBeUndefined();
    });
  });
});
