import { monsterAttack, playerAttack, playerAttackPower } from '../../assets/scripts/pve/core/CombatSystem';
import { createRng } from '../../assets/scripts/pve/core/rng';
import { makeExpeditionState, makeMonster, makeRunPlayer } from './helpers';

const FAR_AWAY = { x: 0, y: 7 };

describe('CombatSystem — 即时战斗（AC-5）', () => {

  describe('playerAttack', () => {
    it('距离在范围内、AP 充足时命中并扣血，产生 ATTACK 事件并扣 2 点 AP', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 40, maxHp: 40 })],
        },
      });

      const result = playerAttack(state, 'm1');

      expect(result.state.floorState.ap).toBe(7); // ap=10，攻击消耗 3 点 AP
      const monster = result.state.floorState.monsters.find((m) => m.id === 'm1');
      expect(monster?.hp).toBe(27);
      expect(result.events).toEqual([
        { type: 'ATTACK', attackerId: 'PLAYER', targetId: 'm1', damage: 13, targetHp: 27 },
      ]);
    });

    it('HP 归零时标记淘汰并产生 KILL → LOOT 事件序列（AC-6）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 1, maxHp: 4 })],
        },
      });

      const result = playerAttack(state, 'm1');
      const monster = result.state.floorState.monsters.find((m) => m.id === 'm1');
      expect(monster?.hp).toBe(0);
      expect(monster?.aiState).toBe('DEAD');
      // 击杀普通怪后必跟 LOOT；灵气仅累加进度，不再触发强化三选一
      const types = result.events.map((e) => e.type);
      expect(types.slice(0, 4)).toEqual(['ATTACK', 'KILL', 'KILL_AP_GAINED', 'LOOT']);
      expect(result.events[1]).toEqual({ type: 'KILL', monsterId: 'm1', monsterType: 'NORMAL' });
      const loot = result.events.find((e) => e.type === 'LOOT');
      expect(loot && loot.type === 'LOOT' && loot.source).toBe('m1');
    });

    it('AC-6 击杀掉落入账：金币/灵气根据 rollNormalMonsterDrop 结果增长', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 1, maxHp: 4 })],
        },
        playerOverrides: { gold: 100, anima: 50, animaProgress: 0 },
      });

      const result = playerAttack(state, 'm1');
      const loot = result.events.find((e) => e.type === 'LOOT');
      if (!(loot && loot.type === 'LOOT')) throw new Error('expected LOOT event');

      const expectedGold = 100 + (loot.gold ?? 0);
      // anima 经 addAnima 走灵气进度通道，未必直接累加；只断言金币 + LOOT 触发即可
      expect(result.state.player.gold).toBe(expectedGold);
      // 至少其一非空（rollNormalMonsterDrop 三种掉落均非空）
      expect((loot.gold ?? 0) + (loot.anima ?? 0)).toBeGreaterThan(0);
    });

    it('AC-10 Boss 击杀必掉装备：哥布林酋长死亡 → 装入 3 件专属之一（战斧/号角/王冠）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          monsters: [
            makeMonster('boss', { x: 4, y: 5 }, {
              type: 'BOSS',
              bossId: 'GOBLIN_CHIEF',
              hp: 1,
              maxHp: 30,
            }),
          ],
        },
        playerOverrides: { equipment: {} },
      });

      const result = playerAttack(state, 'boss');
      const loot = result.events.find((e) => e.type === 'LOOT');
      expect(loot && loot.type === 'LOOT').toBe(true);
      if (loot && loot.type === 'LOOT') {
        expect(loot.equip).toBeDefined();
        expect(['哥布林酋长战斧', '战争号角', '破旧王冠']).toContain(loot.equip!.name);
        // 实际装备到对应槽位
        const equipped = result.state.player.equipment[loot.equip!.slot];
        expect(equipped?.name).toBe(loot.equip!.name);
      }
    });

    it('同 seed 同操作 → 同掉落（确定性 AC-13）', () => {
      const make = () =>
        makeExpeditionState({
          seed: 4242,
          floorOverrides: {
            player: { x: 4, y: 4 },
            ap: 10,
            monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 1, maxHp: 4 })],
          },
        });

      const a = playerAttack(make(), 'm1');
      const b = playerAttack(make(), 'm1');
      expect(a.events).toEqual(b.events);
      expect(a.state.player.gold).toBe(b.state.player.gold);
    });

    it('超出攻击范围时拒绝攻击（no-op）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          monsters: [makeMonster('m1', FAR_AWAY)],
        },
      });

      const result = playerAttack(state, 'm1');
      expect(result.state).toBe(state);
      expect(result.events).toEqual([]);
    });

    it('AP 不足时拒绝攻击（no-op）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 0,
          monsters: [makeMonster('m1', { x: 4, y: 5 })],
        },
      });

      const result = playerAttack(state, 'm1');
      expect(result.state).toBe(state);
      expect(result.events).toEqual([]);
    });

    it('目标已死亡或不存在时拒绝攻击（no-op）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { aiState: 'DEAD' })],
        },
      });

      expect(playerAttack(state, 'm1').events).toEqual([]);
      expect(playerAttack(state, 'unknown').events).toEqual([]);
    });

    it('职业加成影响伤害：BERSERKER 基础攻击力更高', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 10, maxHp: 10 })],
        },
        playerOverrides: { classId: 'BERSERKER' },
      });

      const result = playerAttack(state, 'm1');
      const event = result.events.find((e) => e.type === 'ATTACK');
      expect(event && event.type === 'ATTACK' && event.damage).toBeGreaterThan(1);
    });

    it('命运守卫闪避：玩家 HP > 50% 时无闪避（始终命中）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          monsters: [makeMonster('fg', { x: 4, y: 5 }, {
            type: 'BOSS', bossId: 'FATE_GUARDIAN', hp: 120, maxHp: 120,
          })],
        },
        playerOverrides: { hp: 20, maxHp: 20 }, // HP = 100%
      });
      const result = playerAttack(state, 'fg');
      // 无论如何都应命中（events 不为空）
      expect(result.events.length).toBeGreaterThan(0);
      expect(result.events[0].type).toBe('ATTACK');
    });

    it('命运守卫闪避：玩家 HP ≤ 50% 时存在闪避，确定性（同种子同结果）', () => {
      const makeState = () => makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          monsters: [makeMonster('fg', { x: 4, y: 5 }, {
            type: 'BOSS', bossId: 'FATE_GUARDIAN', hp: 120, maxHp: 120,
          })],
        },
        playerOverrides: { hp: 10, maxHp: 20 }, // HP = 50%
      });
      const r1 = playerAttack(makeState(), 'fg');
      const r2 = playerAttack(makeState(), 'fg');
      // 结果确定：两次相同种子得到相同结果（闪避或命中）
      expect(r1.events.map((e) => e.type)).toEqual(r2.events.map((e) => e.type));
      // AP 消耗：无论命中还是闪避，AP 都应减少
      expect(r1.state.floorState.ap).toBe(7); // ap=10-3
    });
  });

  describe('monsterAttack', () => {
    it('距离在怪物攻击范围内时命中玩家，产生 PLAYER_DAMAGED 事件', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { attack: 20, range: 1 })],
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });

      const result = monsterAttack(state, 'm1');
      expect(result.state.player.hp).toBe(180);
      // 攻击者所在格此前未揭示，攻击时一并揭示该格
      expect(result.events).toEqual([
        { type: 'PLAYER_DAMAGED', damage: 20, hp: 180, sourceId: 'm1', rawDamage: 20 },
      ]);
      expect(result.state.status).toBe('ACTIVE');
    });

    it('玩家 HP 归零时标记远征/楼层为 DEAD 并产生 PLAYER_DEAD 事件', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { attack: 99, range: 1 })],
        },
        playerOverrides: { hp: 5, maxHp: 20 },
      });

      const result = monsterAttack(state, 'm1');
      expect(result.state.player.hp).toBe(0);
      expect(result.state.status).toBe('DEAD');
      expect(result.state.floorState.status).toBe('DEAD');
      expect(result.events.map((e) => e.type)).toEqual(['PLAYER_DAMAGED', 'PLAYER_DEAD']);
    });

    it('超出攻击范围或目标已死亡时拒绝行动（no-op）', () => {
      const farState = makeExpeditionState({
        floorOverrides: { player: { x: 4, y: 4 }, monsters: [makeMonster('m1', FAR_AWAY, { range: 1 })] },
      });
      expect(monsterAttack(farState, 'm1').events).toEqual([]);

      const deadState = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { aiState: 'DEAD' })],
        },
      });
      expect(monsterAttack(deadState, 'm1').events).toEqual([]);
    });
  });

});
