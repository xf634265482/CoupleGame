import {
  HEAVY_STRIKE_INTERVAL,
  HEAVY_STRIKE_MULTIPLIER,
  HORN_INTERVAL_ENRAGED,
  HORN_INTERVAL_NORMAL,
  goblinChiefAttack,
  isHeavyStrikeTurn,
  isHornTurn,
  rollGuaranteedDrop,
} from '../../assets/scripts/pve/core/bosses/GoblinChief';
import { HEAVY_AOE_SLOW_ROUNDS } from '../../assets/scripts/pve/core/PveConstants';
import { createRng } from '../../assets/scripts/pve/core/rng';
import { makeExpeditionState, makeMonster } from './helpers';

function bossState(turn: number, overrides: { attack?: number; hp?: number } = {}) {
  return makeExpeditionState({
    floorOverrides: {
      player: { x: 4, y: 4 },
      turn,
      monsters: [
        makeMonster('boss1', { x: 4, y: 5 }, {
          type: 'BOSS',
          bossId: 'GOBLIN_CHIEF',
          attack: overrides.attack ?? 30,
          range: 1,
          hp: overrides.hp ?? 300,
          maxHp: 300,
        }),
      ],
    },
    playerOverrides: { hp: 200, maxHp: 200 },
  });
}

describe('GoblinChief — 第一章 Boss 专属机制（AC-10）', () => {
  describe('isHeavyStrikeTurn', () => {
    it('每隔 HEAVY_STRIKE_INTERVAL 个回合触发一次蓄力重击', () => {
      expect(isHeavyStrikeTurn(0)).toBe(false);
      expect(isHeavyStrikeTurn(1)).toBe(false);
      expect(isHeavyStrikeTurn(HEAVY_STRIKE_INTERVAL)).toBe(true);
      expect(isHeavyStrikeTurn(HEAVY_STRIKE_INTERVAL * 2)).toBe(true);
      expect(isHeavyStrikeTurn(HEAVY_STRIKE_INTERVAL + 1)).toBe(false);
    });
  });

  describe('isHornTurn', () => {
    it('非狂暴时每 HORN_INTERVAL_NORMAL（3）回合触发一次', () => {
      expect(isHornTurn(0, false)).toBe(false);
      expect(isHornTurn(1, false)).toBe(false);
      expect(isHornTurn(2, false)).toBe(false);
      expect(isHornTurn(HORN_INTERVAL_NORMAL, false)).toBe(true);
      expect(isHornTurn(HORN_INTERVAL_NORMAL * 2, false)).toBe(true);
      expect(isHornTurn(HORN_INTERVAL_NORMAL + 1, false)).toBe(false);
    });

    it('狂暴时每 HORN_INTERVAL_ENRAGED（2）回合触发一次', () => {
      expect(isHornTurn(0, true)).toBe(false);
      expect(isHornTurn(HORN_INTERVAL_ENRAGED, true)).toBe(true);
      expect(isHornTurn(HORN_INTERVAL_ENRAGED * 2, true)).toBe(true);
      expect(isHornTurn(HORN_INTERVAL_ENRAGED + 1, true)).toBe(false);
      // 狂暴时 3 回合不再触发（与非狂暴的 3 回合周期不同）
      expect(isHornTurn(HORN_INTERVAL_NORMAL, true)).toBe(false);
    });
  });

  describe('goblinChiefAttack', () => {
    it('普通回合造成基础伤害（不再附带预警事件）', () => {
      const state = bossState(1, { attack: 30 }); // turn=1：普通攻击（非重击回合）
      const result = goblinChiefAttack(state, 'boss1');
      expect(result.state.player.hp).toBe(170);
      expect(result.events).toEqual([
        { type: 'PLAYER_DAMAGED', damage: 30, hp: 170, sourceId: 'boss1' },
      ]);
    });

    it('蓄力重击回合造成 HEAVY_STRIKE_MULTIPLIER 倍伤害，并标记实际命中范围（HEAVY_STRIKE_RESOLVED）', () => {
      const state = bossState(HEAVY_STRIKE_INTERVAL, { attack: 30 });
      const result = goblinChiefAttack(state, 'boss1');
      const expectedDamage = 30 * HEAVY_STRIKE_MULTIPLIER;
      expect(result.events).toEqual([
        { type: 'HEAVY_STRIKE_RESOLVED', bossId: 'boss1', center: { x: 4, y: 5 } },
        { type: 'PLAYER_DAMAGED', damage: expectedDamage, hp: 200 - expectedDamage, sourceId: 'boss1' },
        { type: 'MOVE_PENALTY_APPLIED', rounds: HEAVY_AOE_SLOW_ROUNDS },
      ]);
    });

    it('重击致死时产生 PLAYER_DEAD 并标记远征/楼层为 DEAD', () => {
      const state = bossState(HEAVY_STRIKE_INTERVAL, { attack: 150 });
      const result = goblinChiefAttack(state, 'boss1');
      expect(result.state.player.hp).toBe(0);
      expect(result.state.status).toBe('DEAD');
      expect(result.state.floorState.status).toBe('DEAD');
      expect(result.events.map((e) => e.type)).toEqual(['HEAVY_STRIKE_RESOLVED', 'PLAYER_DAMAGED', 'PLAYER_DEAD']);
    });

    it('超出攻击范围时无伤害；已死亡 / 非哥布林酋长 时为 no-op', () => {
      // turn=1（非重击回合）：超出攻击范围 → 无伤害，无事件
      const far = makeExpeditionState({
        floorOverrides: {
          player: { x: 0, y: 0 },
          turn: 1,
          monsters: [makeMonster('boss1', { x: 7, y: 7 }, { type: 'BOSS', bossId: 'GOBLIN_CHIEF', range: 1 })],
        },
      });
      expect(goblinChiefAttack(far, 'boss1').events).toEqual([]);

      // turn=HEAVY_STRIKE_INTERVAL（重击回合）：超出 HEAVY_STRIKE_RANGE → 仍标记 HEAVY_STRIKE_RESOLVED，但无伤害
      const farHeavy = makeExpeditionState({
        floorOverrides: {
          player: { x: 0, y: 0 },
          turn: HEAVY_STRIKE_INTERVAL,
          monsters: [makeMonster('boss1', { x: 7, y: 7 }, { type: 'BOSS', bossId: 'GOBLIN_CHIEF', range: 1 })],
        },
      });
      expect(goblinChiefAttack(farHeavy, 'boss1').events).toEqual([
        { type: 'HEAVY_STRIKE_RESOLVED', bossId: 'boss1', center: { x: 7, y: 7 } },
      ]);

      const dead = bossState(1);
      const deadState = {
        ...dead,
        floorState: {
          ...dead.floorState,
          monsters: dead.floorState.monsters.map((m) => ({ ...m, aiState: 'DEAD' as const })),
        },
      };
      expect(goblinChiefAttack(deadState, 'boss1').events).toEqual([]);

      const wrongBoss = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          turn: 1,
          monsters: [makeMonster('boss2', { x: 4, y: 5 }, { type: 'BOSS', bossId: 'SANDWORM_QUEEN', range: 1 })],
        },
      });
      expect(goblinChiefAttack(wrongBoss, 'boss2').events).toEqual([]);
    });
  });

  describe('rollGuaranteedDrop', () => {
    it('产出固定武器位的必掉装备（M1 占位）', () => {
      const item = rollGuaranteedDrop(createRng(2024));
      expect(item.slot).toBe('WEAPON');
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.baseStat).toBeGreaterThan(0);
    });

    it('多次调用 id 不重复（依赖 rng 推进）', () => {
      const rng = createRng(2024);
      const a = rollGuaranteedDrop(rng);
      const b = rollGuaranteedDrop(rng);
      expect(a.id).not.toBe(b.id);
    });
  });
});
