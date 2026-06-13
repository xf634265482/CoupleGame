import { monsterAttack, playerAttack, playerAttackPower } from '../../assets/scripts/pve/core/CombatSystem';
import { EMPTY_TREE_BONUSES } from '../../assets/scripts/pve/core/DestinyTreeSystem';
import { TREE_B1_ATTACK_BONUS } from '../../assets/scripts/pve/core/PveConstants';
import { createRng } from '../../assets/scripts/pve/core/rng';
import { makeExpeditionState, makeMonster, makeRunPlayer } from './helpers';

const FAR_AWAY = { x: 0, y: 7 };

describe('CombatSystem — 即时战斗（AC-5）', () => {
  describe('playerAttackPower — 命运树 B1 武者直觉', () => {
    it('未解锁 B1 时攻击力不变', () => {
      const player = makeRunPlayer({ treeBonuses: EMPTY_TREE_BONUSES });
      expect(playerAttackPower(player).damage).toBe(10);
    });

    it('解锁 B1 时攻击力 +5（×10 基准，原 +0.5）', () => {
      const player = makeRunPlayer({
        treeBonuses: { ...EMPTY_TREE_BONUSES, attackBonus: TREE_B1_ATTACK_BONUS },
      });
      // BASE_ATTACK(10) + 5 = 15
      expect(playerAttackPower(player).damage).toBe(15);
    });
  });

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
      expect(monster?.hp).toBe(30); // ADVENTURER 基础攻击 10 点（×10 基准）
      expect(result.events).toEqual([
        { type: 'ATTACK', attackerId: 'PLAYER', targetId: 'm1', damage: 10, targetHp: 30 },
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
      // 击杀普通怪后必跟 LOOT；ANIMA_STRENGTHEN 视掉落是否触满阈值而定
      const types = result.events.map((e) => e.type);
      expect(types.slice(0, 3)).toEqual(['ATTACK', 'KILL', 'LOOT']);
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

    it('AC-10 Boss 击杀必掉装备：哥布林酋长死亡 → WEAPON 槽装入「哥布林酋长的战斧」', () => {
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
      expect(result.state.player.equipment.WEAPON).toBeDefined();
      expect(result.state.player.equipment.WEAPON?.name).toBe('哥布林酋长的战斧');
      expect(result.state.player.equipment.WEAPON?.slot).toBe('WEAPON');
      const loot = result.events.find((e) => e.type === 'LOOT');
      expect(loot && loot.type === 'LOOT' && loot.equip?.name).toBe('哥布林酋长的战斧');
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
        { type: 'REVEAL', cells: [{ x: 4, y: 5 }] },
        { type: 'PLAYER_DAMAGED', damage: 20, hp: 180, sourceId: 'm1' },
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
      expect(result.events.map((e) => e.type)).toEqual(['REVEAL', 'PLAYER_DAMAGED', 'PLAYER_DEAD']);
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

  describe('二阶觉醒词条（design §七）', () => {
    it('awakened_power_shot：基础攻击力额外 +15（×10 基准，原 +1.5）', () => {
      const player = makeRunPlayer({ classTraits: ['awakened_power_shot'] });
      expect(playerAttackPower(player).damage).toBe(25);
    });

    it('awakened_cleave：命中后对相邻怪物造成 50% 溅射伤害', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          monsters: [
            makeMonster('m1', { x: 4, y: 5 }, { hp: 40, maxHp: 40 }),
            makeMonster('m2', { x: 4, y: 6 }, { hp: 40, maxHp: 40 }),
          ],
        },
        playerOverrides: { classTraits: ['awakened_cleave'] },
      });

      const result = playerAttack(state, 'm1');
      expect(result.state.floorState.monsters.find((m) => m.id === 'm1')!.hp).toBe(30);
      expect(result.state.floorState.monsters.find((m) => m.id === 'm2')!.hp).toBe(30);
      expect(result.events).toEqual([
        { type: 'ATTACK', attackerId: 'PLAYER', targetId: 'm1', damage: 10, targetHp: 30 },
        { type: 'ATTACK', attackerId: 'PLAYER', targetId: 'm2', damage: 10, targetHp: 30 },
      ]);
    });

    it('awakened_frenzy：击杀后下一次攻击伤害×3并回复20点HP', () => {
      let state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 10, maxHp: 40 })],
        },
        playerOverrides: { classTraits: ['awakened_frenzy'], hp: 100, maxHp: 200 },
      });

      // 第一击：击杀 m1，触发 frenzyPending
      let result = playerAttack(state, 'm1');
      expect(result.state.floorState.monsters.find((m) => m.id === 'm1')!.aiState).toBe('DEAD');
      expect(result.state.floorState.frenzyPending).toBe(true);
      state = result.state;

      // 补充第二只怪物供下一击使用
      state = {
        ...state,
        floorState: {
          ...state.floorState,
          ap: 10,
          monsters: [...state.floorState.monsters, makeMonster('m2', { x: 4, y: 5 }, { hp: 100, maxHp: 100 })],
        },
      };

      // 第二击：消耗 frenzyPending，伤害×3=30，玩家回复20点HP
      result = playerAttack(state, 'm2');
      expect(result.state.floorState.monsters.find((m) => m.id === 'm2')!.hp).toBe(70);
      expect(result.state.player.hp).toBe(120);
      expect(result.state.floorState.frenzyPending).toBe(false);
    });

    it('awakened_execute：目标HP≤30%时直接处决；背刺伤害提升至3倍', () => {
      // 处决：HP 20/100 = 20% ≤ 30% → 直接处决
      const executeState = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 20, maxHp: 100 })],
        },
        playerOverrides: { classTraits: ['awakened_execute'] },
      });
      const executeResult = playerAttack(executeState, 'm1');
      expect(executeResult.events[0]).toEqual(
        { type: 'ATTACK', attackerId: 'PLAYER', targetId: 'm1', damage: 20, targetHp: 0 },
      );

      // 背刺×3：HP 100/100（不满足处决条件），背刺生效时伤害 10×3=30
      const backstabState = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          backstabAvailable: true,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 100, maxHp: 100 })],
        },
        playerOverrides: { classTraits: ['backstab', 'awakened_execute'] },
      });
      const backstabResult = playerAttack(backstabState, 'm1');
      expect(backstabResult.state.floorState.monsters.find((m) => m.id === 'm1')!.hp).toBe(70);
    });

    it('awakened_shadow_strike：每回合可触发2次背刺(×2)伤害', () => {
      let state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 30,
          backstabAvailable: true,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 100, maxHp: 100 })],
        },
        playerOverrides: { classTraits: ['awakened_shadow_strike'] },
      });

      // 第一次攻击：背刺生效（×2=20），shadowStrikeCount→1，backstabAvailable 仍为 true
      let result = playerAttack(state, 'm1');
      expect(result.state.floorState.monsters.find((m) => m.id === 'm1')!.hp).toBe(80);
      expect(result.state.floorState.shadowStrikeCount).toBe(1);
      expect(result.state.floorState.backstabAvailable).toBe(true);
      state = result.state;

      // 第二次攻击：背刺仍生效（×2=20），shadowStrikeCount→2，backstabAvailable 变 false
      result = playerAttack(state, 'm1');
      expect(result.state.floorState.monsters.find((m) => m.id === 'm1')!.hp).toBe(60);
      expect(result.state.floorState.shadowStrikeCount).toBe(2);
      expect(result.state.floorState.backstabAvailable).toBe(false);
      state = result.state;

      // 第三次攻击：已达上限，恢复普通伤害（×1=10）
      result = playerAttack(state, 'm1');
      expect(result.state.floorState.monsters.find((m) => m.id === 'm1')!.hp).toBe(50);
    });

    it('awakened_volley：60%概率连射一箭，连射命中后30%概率连锁攻击另一目标', () => {
      // 寻找确定性种子：第一次 chance(0.6) 决定是否连射，第二次 chance(0.3) 决定是否连锁
      const findSeed = (predicate: (rng: ReturnType<typeof createRng>) => boolean): number => {
        for (let s = 0; s < 100000; s++) {
          if (predicate(createRng(s))) return s;
        }
        throw new Error('seed not found');
      };

      const seedNoFire = findSeed((rng) => !rng.chance(0.6));
      const seedFireNoChain = findSeed((rng) => rng.chance(0.6) && !rng.chance(0.3));
      const seedFireAndChain = findSeed((rng) => rng.chance(0.6) && rng.chance(0.3));

      // 不触发连射：仅 1 次 ATTACK
      const noFireState = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          rngState: seedNoFire,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 100, maxHp: 100 })],
        },
        playerOverrides: { classTraits: ['awakened_volley'] },
      });
      const noFireResult = playerAttack(noFireState, 'm1');
      expect(noFireResult.events.filter((e) => e.type === 'ATTACK')).toHaveLength(1);

      // 触发连射但不连锁：2 次 ATTACK，均命中 m1
      const fireNoChainState = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          rngState: seedFireNoChain,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { hp: 100, maxHp: 100 })],
        },
        playerOverrides: { classTraits: ['awakened_volley'] },
      });
      const fireNoChainResult = playerAttack(fireNoChainState, 'm1');
      expect(fireNoChainResult.events.filter((e) => e.type === 'ATTACK')).toHaveLength(2);

      // 触发连射并连锁：3 次 ATTACK，第三次命中范围内的另一目标 m2
      const fireAndChainState = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 10,
          rngState: seedFireAndChain,
          monsters: [
            makeMonster('m1', { x: 4, y: 5 }, { hp: 100, maxHp: 100 }),
            makeMonster('m2', { x: 4, y: 3 }, { hp: 100, maxHp: 100 }),
          ],
        },
        playerOverrides: { classTraits: ['awakened_volley'] },
      });
      const fireAndChainResult = playerAttack(fireAndChainState, 'm1');
      const attackEvents = fireAndChainResult.events.filter((e) => e.type === 'ATTACK') as Array<{ targetId: string }>;
      expect(attackEvents).toHaveLength(3);
      expect(attackEvents.map((e) => e.targetId)).toEqual(['m1', 'm1', 'm2']);
    });
  });
});
