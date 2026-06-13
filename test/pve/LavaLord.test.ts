import { lavaLordAttack } from '../../assets/scripts/pve/core/bosses/LavaLord';
import { LAVA_LORD_BURN_TICKS } from '../../assets/scripts/pve/core/PveConstants';
import { endTurn } from '../../assets/scripts/pve/core/ExpeditionState';
import { makeExpeditionState, makeMonster } from './helpers';

function makeBossState(playerHp = 200) {
  return makeExpeditionState({
    chapter: 4,
    floorOverrides: {
      player: { x: 4, y: 4 },
      ap: 10,
      turn: 1,
      monsters: [
        makeMonster('boss', { x: 4, y: 5 }, {
          type: 'BOSS',
          bossId: 'LAVA_LORD',
          hp: 1000,
          maxHp: 1000,
          attack: 40,
          range: 1,
          aggroRadius: 99,
        }),
      ],
    },
    playerOverrides: { hp: playerHp, maxHp: 200 },
  });
}

describe('LavaLord', () => {
  describe('lavaLordAttack', () => {
    it('攻击命中后施加灼烧，emit BURN_APPLIED，playerBurnRemaining += LAVA_LORD_BURN_TICKS', () => {
      const state = makeBossState(200);
      const result = lavaLordAttack(state, 'boss');

      expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(true);
      expect(result.events.some((e) => e.type === 'BURN_APPLIED')).toBe(true);
      expect(result.state.floorState.playerBurnRemaining).toBe(LAVA_LORD_BURN_TICKS);
    });

    it('灼烧叠加：第二次攻击后 playerBurnRemaining = TICKS × 2', () => {
      const state = makeBossState(200);
      const r1 = lavaLordAttack(state, 'boss');
      const r2 = lavaLordAttack(r1.state, 'boss');
      expect(r2.state.floorState.playerBurnRemaining).toBe(LAVA_LORD_BURN_TICKS * 2);
    });
  });

  describe('endTurn 灼烧 tick', () => {
    it('playerBurnRemaining > 0 时每回合扣 10 HP（×10基准），emit BURN_TICK，remaining--', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          turn: 1,
          player: { x: 0, y: 0 },
          monsters: [],
          playerBurnRemaining: 3,
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });

      const result = endTurn(state);
      const burnTick = result.events.find((e) => e.type === 'BURN_TICK');
      expect(burnTick).toBeDefined();
      if (burnTick && burnTick.type === 'BURN_TICK') {
        expect(burnTick.damage).toBe(10);
        expect(burnTick.hp).toBe(190);
      }
      expect(result.state.player.hp).toBe(190);
      expect(result.state.floorState.playerBurnRemaining).toBe(2);
    });

    it('灼烧耗尽后 playerBurnRemaining 清为 undefined', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          turn: 1,
          player: { x: 0, y: 0 },
          monsters: [],
          playerBurnRemaining: 1,
        },
        playerOverrides: { hp: 20, maxHp: 20 },
      });

      const result = endTurn(state);
      expect(result.state.floorState.playerBurnRemaining).toBeUndefined();
    });

    it('灼烧致死时 emit PLAYER_DEAD，状态置 DEAD', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          turn: 1,
          player: { x: 0, y: 0 },
          monsters: [],
          playerBurnRemaining: 5,
        },
        playerOverrides: { hp: 1, maxHp: 20 },
      });

      const result = endTurn(state);
      expect(result.events.some((e) => e.type === 'PLAYER_DEAD')).toBe(true);
      expect(result.state.status).toBe('DEAD');
    });
  });
});
