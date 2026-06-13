import { frostGiantAttack, isFreezeAttackTurn } from '../../assets/scripts/pve/core/bosses/FrostGiant';
import {
  FROST_GIANT_AP_PENALTY,
  FROST_GIANT_FREEZE_INTERVAL,
  FROST_GIANT_FREEZE_ROUNDS,
} from '../../assets/scripts/pve/core/PveConstants';
import { endTurn } from '../../assets/scripts/pve/core/ExpeditionState';
import { makeExpeditionState, makeMonster } from './helpers';

function makeBossState(turn = 1) {
  return makeExpeditionState({
    chapter: 3,
    floorOverrides: {
      player: { x: 4, y: 4 },
      ap: 10,
      turn,
      monsters: [
        makeMonster('boss', { x: 4, y: 5 }, {
          type: 'BOSS',
          bossId: 'FROST_GIANT',
          hp: 80,
          maxHp: 80,
          attack: 4,
          range: 1,
          aggroRadius: 99,
        }),
      ],
    },
    playerOverrides: { hp: 20, maxHp: 20 },
  });
}

describe('FrostGiant', () => {
  describe('isFreezeAttackTurn', () => {
    it(`每 ${FROST_GIANT_FREEZE_INTERVAL} 回合返回 true`, () => {
      expect(isFreezeAttackTurn(0)).toBe(false);
      expect(isFreezeAttackTurn(FROST_GIANT_FREEZE_INTERVAL)).toBe(true);
      expect(isFreezeAttackTurn(FROST_GIANT_FREEZE_INTERVAL * 2)).toBe(true);
      expect(isFreezeAttackTurn(1)).toBe(false);
    });
  });

  describe('frostGiantAttack — 普通回合', () => {
    it('普通回合只攻击，不施加冰冻', () => {
      const state = makeBossState(1);
      const result = frostGiantAttack(state, 'boss');
      expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(true);
      expect(result.events.some((e) => e.type === 'FREEZE_APPLIED')).toBe(false);
      expect(result.state.floorState.playerFreezeRounds ?? 0).toBe(0);
    });
  });

  describe('frostGiantAttack — 冰冻回合', () => {
    it(`第 ${FROST_GIANT_FREEZE_INTERVAL} 回合施加冰冻并 emit FREEZE_APPLIED`, () => {
      const state = makeBossState(FROST_GIANT_FREEZE_INTERVAL);
      const result = frostGiantAttack(state, 'boss');
      expect(result.events.some((e) => e.type === 'FREEZE_APPLIED')).toBe(true);
      expect(result.state.floorState.playerFreezeRounds).toBe(FROST_GIANT_FREEZE_ROUNDS);
    });
  });

  describe('endTurn 冰冻效果', () => {
    it('冰冻时下回合 AP 减少 FROST_GIANT_AP_PENALTY，且 playerFreezeRounds 归零', () => {
      // 设置 playerFreezeRounds=1，触发 endTurn
      const state = makeExpeditionState({
        floorOverrides: {
          turn: 1,
          player: { x: 0, y: 0 },
          monsters: [],
          playerFreezeRounds: 1,
        },
        playerOverrides: { hp: 20, maxHp: 20 },
      });

      const result = endTurn(state);
      const apEvent = result.events.find((e) => e.type === 'AP_ROLLED');
      expect(apEvent).toBeDefined();
      if (apEvent && apEvent.type === 'AP_ROLLED') {
        // AP 应比正常少 FROST_GIANT_AP_PENALTY（但最低 1）
        expect(apEvent.ap).toBeGreaterThanOrEqual(1);
        // 正常 AP 范围是 9-14，冰冻后是 5-10（最低 1）
        expect(apEvent.ap).toBeLessThanOrEqual(14 - FROST_GIANT_AP_PENALTY + 1);
      }
      // 冻结消耗后归零
      expect(result.state.floorState.playerFreezeRounds ?? 0).toBe(0);
    });
  });
});
