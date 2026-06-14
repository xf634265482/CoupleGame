import { frostGiantAttack, isFreezeAttackTurn } from '../../assets/scripts/pve/core/bosses/FrostGiant';
import { applyMove } from '../../assets/scripts/pve/core/MovementSystem';
import { endTurn } from '../../assets/scripts/pve/core/ExpeditionState';
import {
  FROST_GIANT_FREEZE_INTERVAL,
  FROST_GIANT_ICE_DURATION,
} from '../../assets/scripts/pve/core/PveConstants';
import { makeEntity, makeExpeditionState, makeMonster } from './helpers';

function makeBossState(turn = 1) {
  return makeExpeditionState({
    chapter: 3,
    floorOverrides: {
      player: { x: 4, y: 4 },
      ap: 10,
      turn,
      entities: [],
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
    playerOverrides: { hp: 200, maxHp: 200 },
  });
}

describe('FrostGiant — 冰面地形 + 滑行（反风筝）', () => {
  describe('isFreezeAttackTurn', () => {
    it(`每 ${FROST_GIANT_FREEZE_INTERVAL} 回合返回 true`, () => {
      expect(isFreezeAttackTurn(0)).toBe(false);
      expect(isFreezeAttackTurn(FROST_GIANT_FREEZE_INTERVAL)).toBe(true);
      expect(isFreezeAttackTurn(FROST_GIANT_FREEZE_INTERVAL * 2)).toBe(true);
      expect(isFreezeAttackTurn(1)).toBe(false);
    });
  });

  describe('frostGiantAttack', () => {
    it('普通回合只攻击，不铺冰面', () => {
      const state = makeBossState(1);
      const result = frostGiantAttack(state, 'boss');
      expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(true);
      expect(result.events.some((e) => e.type === 'ICE_TIDE_SPAWNED')).toBe(false);
      expect(result.state.floorState.entities.some((e) => e.type === 'ICE_TILE')).toBe(false);
    });

    it(`第 ${FROST_GIANT_FREEZE_INTERVAL} 回合普攻后以玩家为中心铺冰面（emit ICE_TIDE_SPAWNED）`, () => {
      const state = makeBossState(FROST_GIANT_FREEZE_INTERVAL);
      const result = frostGiantAttack(state, 'boss');

      expect(result.events.some((e) => e.type === 'ICE_TIDE_SPAWNED')).toBe(true);
      const iceTiles = result.state.floorState.entities.filter((e) => e.type === 'ICE_TILE');
      expect(iceTiles.length).toBeGreaterThan(0);
      // 冰面以玩家(4,4)为中心、曼哈顿 ≤1，且带 FROST_GIANT_ICE_DURATION 倒计时
      for (const t of iceTiles) {
        expect(Math.abs(t.pos.x - 4) + Math.abs(t.pos.y - 4)).toBeLessThanOrEqual(1);
        expect(t.remaining).toBe(FROST_GIANT_ICE_DURATION);
      }
      // 玩家所在格也铺冰（下回合站在冰上才会滑行）
      expect(iceTiles.some((t) => t.pos.x === 4 && t.pos.y === 4)).toBe(true);
      // boss 所在格(4,5)不铺冰（被存活怪占据）
      expect(iceTiles.some((t) => t.pos.x === 4 && t.pos.y === 5)).toBe(false);
    });
  });

  describe('冰面滑行（MovementSystem.applyMove）', () => {
    function iceLineState(player: { x: number; y: number }, iceCells: { x: number; y: number }[]) {
      return makeExpeditionState({
        chapter: 3,
        floorOverrides: {
          player,
          ap: 10,
          turn: 1,
          monsters: [],
          entities: iceCells.map((pos, i) => makeEntity(`ice${i}`, 'ICE_TILE', pos, { remaining: 2 })),
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });
    }

    it('站在冰面上移动 → 沿方向滑到第一个非冰可走格', () => {
      // 冰排 (4,4)(4,3)(4,2)；玩家站冰上 (4,4) 向上 → 滑过冰面停在第一个非冰格 (4,1)
      const state = iceLineState({ x: 4, y: 4 }, [{ x: 4, y: 4 }, { x: 4, y: 3 }, { x: 4, y: 2 }]);
      const result = applyMove(state, 'UP');
      expect(result.state.floorState.player).toEqual({ x: 4, y: 1 });
      expect(result.events.some((e) => e.type === 'MOVE')).toBe(true);
    });

    it('滑行至地图边界则停在边界格（过冲、丢失精确间距 = 反风筝）', () => {
      // 玩家 (4,2)，上方全是冰直到边界 → 向上滑停在 (4,0)
      const state = iceLineState({ x: 4, y: 2 }, [{ x: 4, y: 2 }, { x: 4, y: 1 }, { x: 4, y: 0 }]);
      const result = applyMove(state, 'UP');
      expect(result.state.floorState.player).toEqual({ x: 4, y: 0 });
    });

    it('玩家不在冰面上 → 普通走一格（不滑），即使前方相邻是冰', () => {
      // 起步格(4,4)非冰 → 普通走一格落在 (4,3)，不继续滑
      const state = iceLineState({ x: 4, y: 4 }, [{ x: 4, y: 3 }, { x: 4, y: 2 }]);
      const result = applyMove(state, 'UP');
      expect(result.state.floorState.player).toEqual({ x: 4, y: 3 });
    });
  });

  describe('endTurn 冰面倒计时', () => {
    it('冰面每回合 remaining-1，归零移除；且不再有冰冻 AP 惩罚', () => {
      const state = makeExpeditionState({
        chapter: 3,
        floorOverrides: {
          turn: 1,
          player: { x: 0, y: 0 },
          monsters: [],
          entities: [makeEntity('ice1', 'ICE_TILE', { x: 5, y: 5 }, { remaining: 1 })],
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });

      const result = endTurn(state);
      // remaining 1 → 0 → 移除
      expect(result.state.floorState.entities.some((e) => e.type === 'ICE_TILE')).toBe(false);
      // AP 正常范围（无冰冻惩罚，至少 9）
      const ap = result.events.find((e) => e.type === 'AP_ROLLED');
      expect(ap && ap.type === 'AP_ROLLED' ? ap.ap : 0).toBeGreaterThanOrEqual(9);
    });
  });
});
