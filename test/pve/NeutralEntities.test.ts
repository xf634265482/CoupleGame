import { upgradeEquip, useAltar, useHotSpring, useIdol } from '../../assets/scripts/pve/core/NeutralEntities';
import {
  ALTAR_ANIMA_MAX,
  ALTAR_ANIMA_MIN,
  BLACKSMITH_UPGRADE_COST,
  HOT_SPRING_HEAL_RATIO,
  IDOL_MAX_HP_BONUS,
  IDOL_ATTACK_BONUS,
  IDOL_ARMOR_BONUS,
} from '../../assets/scripts/pve/core/PveConstants';
import { makeEntity, makeExpeditionState } from './helpers';
import { CHAPTER1_FLOOR3_BLOCKER_IDS } from '../../assets/scripts/pve/core/chapter1/Chapter1FloorCatalog';

describe('NeutralEntities — 中立交互实体（M1 新增）', () => {
  describe('useIdol（神像 · 三选一随机）', () => {
    it('扣 AP、consumed=true、emit IDOL_BLESSING，多次调用覆盖全部 3 种 effect', () => {
      // 用不同 rngState 种子遍历，确保 MAX_HP / ATTACK / ARMOR 都能被命中
      const effects = new Set<string>();
      for (let seed = 0; seed < 30; seed++) {
        const state = makeExpeditionState({
          floorOverrides: {
            player: { x: 3, y: 3 },
            ap: 5,
            entities: [makeEntity('idol1', 'IDOL', { x: 3, y: 3 })],
            rngState: seed,
          },
          playerOverrides: { hp: 15, maxHp: 20 },
        });
        const result = useIdol(state, 'idol1');
        expect(result.state.floorState.ap).toBe(4);
        expect(result.state.floorState.entities.find((e) => e.id === 'idol1')?.consumed).toBe(true);
        expect(result.state.floorState.playerExposedTurns).toBe(2);
        expect(result.events).toHaveLength(2);
        const ev = result.events[0];
        expect(ev.type).toBe('IDOL_BLESSING');
        expect(result.events[1]).toEqual({ type: 'PLAYER_EXPOSED', source: 'INTERACTION', turns: 2 });
        if (ev.type === 'IDOL_BLESSING') {
          effects.add(ev.effect);
          if (ev.effect === 'MAX_HP') {
            expect(result.state.player.maxHp).toBe(20 + IDOL_MAX_HP_BONUS);
            expect(result.state.player.hp).toBe(15 + IDOL_MAX_HP_BONUS);
          } else if (ev.effect === 'ATTACK') {
            expect(result.state.player.idolAttackBonus).toBe(IDOL_ATTACK_BONUS);
          } else {
            expect(result.state.player.idolArmorBonus).toBe(IDOL_ARMOR_BONUS);
          }
        }
      }
      expect(effects).toContain('MAX_HP');
      expect(effects).toContain('ATTACK');
      expect(effects).toContain('ARMOR');
    });

    it('不在神像格 / AP 不足 / 已消耗 时为 no-op', () => {
      const notHere = makeExpeditionState({
        floorOverrides: {
          player: { x: 0, y: 0 },
          ap: 5,
          entities: [makeEntity('i', 'IDOL', { x: 3, y: 3 })],
        },
      });
      expect(useIdol(notHere, 'i').events).toEqual([]);

      const noAp = makeExpeditionState({
        floorOverrides: {
          player: { x: 3, y: 3 },
          ap: 0,
          entities: [makeEntity('i', 'IDOL', { x: 3, y: 3 })],
        },
      });
      expect(useIdol(noAp, 'i').events).toEqual([]);

      const consumed = makeExpeditionState({
        floorOverrides: {
          player: { x: 3, y: 3 },
          ap: 5,
          entities: [makeEntity('i', 'IDOL', { x: 3, y: 3 }, { consumed: true })],
        },
      });
      expect(useIdol(consumed, 'i').events).toEqual([]);
    });
  });

  describe('useHotSpring（温泉 · 恢复 maxHp 的 50%）', () => {
    it('玩家受伤后泡温泉：扣 AP、HP 恢复 50% maxHp、emit HOT_SPRING_HEAL', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 5,
          entities: [makeEntity('s1', 'HOT_SPRING', { x: 4, y: 4 })],
        },
        playerOverrides: { hp: 5, maxHp: 20 },
      });

      // 50% × 20 = 10，hp: 5 → 15，healed = 10
      const result = useHotSpring(state, 's1');
      expect(result.state.player.hp).toBe(15);
      expect(result.state.floorState.ap).toBe(4);
      const heal = result.events.find((e) => e.type === 'HOT_SPRING_HEAL');
      expect(heal && heal.type === 'HOT_SPRING_HEAL' && heal.healed).toBe(10);
      expect(HOT_SPRING_HEAL_RATIO).toBeGreaterThan(0);
    });

    it('满血时为 no-op（不浪费 AP）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 5,
          entities: [makeEntity('s1', 'HOT_SPRING', { x: 4, y: 4 })],
        },
        playerOverrides: { hp: 20, maxHp: 20 },
      });
      const result = useHotSpring(state, 's1');
      expect(result.state).toBe(state);
      expect(result.events).toEqual([]);
    });

    it('不在温泉格 / AP 不足 / 已消耗 时为 no-op', () => {
      const noAp = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 0,
          entities: [makeEntity('s', 'HOT_SPRING', { x: 4, y: 4 })],
        },
        playerOverrides: { hp: 5, maxHp: 20 },
      });
      expect(useHotSpring(noAp, 's').events).toEqual([]);

      const consumed = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 5,
          entities: [makeEntity('s', 'HOT_SPRING', { x: 4, y: 4 }, { consumed: true })],
        },
        playerOverrides: { hp: 5, maxHp: 20 },
      });
      expect(useHotSpring(consumed, 's').events).toEqual([]);
    });
  });

  describe('useAltar（祭坛）', () => {
    it('永久逐层第 3 层仍有封锁怪时不能关闭祭坛', () => {
      const state = makeExpeditionState({
        floor: 3,
        floorOverrides: {
          player: { x: 4, y: 1 },
          ap: 5,
          entities: [makeEntity('ALTAR_1', 'ALTAR', { x: 4, y: 1 })],
          monsters: CHAPTER1_FLOOR3_BLOCKER_IDS.map((id, index) => ({
            id,
            type: 'NORMAL' as const,
            pos: { x: 4, y: 4 - Math.min(index, 2) },
            hp: 35,
            maxHp: 35,
            attack: 8,
            range: 1,
            aggroRadius: 5,
            aiState: 'IDLE' as const,
          })),
        },
      });
      state.persistentFloorMode = true;

      const blocked = useAltar(state, 'ALTAR_1');

      expect(blocked.state).toBe(state);
      expect(blocked.events).toEqual([]);
      expect(blocked.state.floorState.entities[0]?.consumed).toBe(false);
    });

    it('永久逐层第 6 层 WAVE_ALTAR 禁止交互（刷怪源不可消耗）', () => {
      const state = makeExpeditionState({
        floor: 6,
        floorOverrides: {
          floor: 6,
          player: { x: 0, y: 0 },
          ap: 8,
          entities: [makeEntity('WAVE_ALTAR_1', 'ALTAR', { x: 0, y: 0 })],
        },
      });
      state.persistentFloorMode = true;

      const result = useAltar(state, 'WAVE_ALTAR_1');
      expect(result.events).toEqual([]);
      expect(result.state.floorState.entities[0]?.consumed).toBe(false);
      expect(result.state.floorState.ap).toBe(8);
    });

    it('永久逐层第 6 层 WAVE_SPAWN 标记禁止当作祭坛消耗', () => {
      const state = makeExpeditionState({
        floor: 6,
        floorOverrides: {
          floor: 6,
          player: { x: 0, y: 0 },
          ap: 8,
          entities: [makeEntity('WAVE_SPAWN_1', 'ALTAR', { x: 0, y: 0 })],
        },
      });
      state.persistentFloorMode = true;

      const result = useAltar(state, 'WAVE_SPAWN_1');
      expect(result.events).toEqual([]);
      expect(result.state.floorState.entities[0]?.consumed).toBe(false);
    });

    it('永久逐层关闭祭坛不发放旧灵气进度', () => {
      const state = makeExpeditionState({
        floor: 3,
        floorOverrides: {
          floor: 3,
          player: { x: 4, y: 1 },
          ap: 5,
          entities: [makeEntity('ALTAR_1', 'ALTAR', { x: 4, y: 1 })],
          monsters: [],
        },
        playerOverrides: { anima: 0, animaProgress: 90 },
      });
      state.persistentFloorMode = true;

      const result = useAltar(state, 'ALTAR_1');
      expect(result.events[0]).toEqual({ type: 'ALTAR_USED', entityId: 'ALTAR_1', anima: 0 });
      expect(result.state.floorState.entities[0]?.consumed).toBe(true);
      expect(result.state.player.animaProgress).toBe(90);
      expect(result.state.player.anima).toBe(0);
    });

    it('非永久模式：玩家站在祭坛格 + AP ≥ 1 + 未消耗：扣 AP、消耗实体、灵气在 [MIN,MAX] 范围内、emit ALTAR_USED', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 2, y: 2 },
          ap: 5,
          entities: [makeEntity('altar1', 'ALTAR', { x: 2, y: 2 })],
        },
        playerOverrides: { hp: 15, maxHp: 20, anima: 0, animaProgress: 0 },
      });

      const result = useAltar(state, 'altar1');
      expect(result.events[0].type).toBe('ALTAR_USED');
      const ev = result.events[0];
      if (ev.type === 'ALTAR_USED') {
        expect(ev.anima).toBeGreaterThanOrEqual(ALTAR_ANIMA_MIN);
        expect(ev.anima).toBeLessThanOrEqual(ALTAR_ANIMA_MAX);
      }
      expect(result.state.floorState.ap).toBe(4);
      expect(result.state.floorState.entities.find((e) => e.id === 'altar1')?.consumed).toBe(true);
      expect(result.state.player.anima).toBeGreaterThan(0);
    });

    it('确定性：相同 rngState 下祭坛掉落相同灵气', () => {
      const base = makeExpeditionState({
        floorOverrides: {
          player: { x: 2, y: 2 },
          ap: 5,
          entities: [makeEntity('a', 'ALTAR', { x: 2, y: 2 })],
        },
      });
      const r1 = useAltar(base, 'a');
      const r2 = useAltar(base, 'a');
      const ev1 = r1.events[0];
      const ev2 = r2.events[0];
      expect(ev1.type === 'ALTAR_USED' && ev2.type === 'ALTAR_USED' && ev1.anima).toBe(
        ev2.type === 'ALTAR_USED' ? ev2.anima : undefined,
      );
    });

    it('AP 不足 / 已消耗 / 不在格子 时为 no-op', () => {
      const noAp = makeExpeditionState({
        floorOverrides: { player: { x: 2, y: 2 }, ap: 0, entities: [makeEntity('a', 'ALTAR', { x: 2, y: 2 })] },
      });
      expect(useAltar(noAp, 'a').events).toEqual([]);

      const consumed = makeExpeditionState({
        floorOverrides: {
          player: { x: 2, y: 2 }, ap: 5,
          entities: [makeEntity('a', 'ALTAR', { x: 2, y: 2 }, { consumed: true })],
        },
      });
      expect(useAltar(consumed, 'a').events).toEqual([]);
    });
  });

  describe('upgradeEquip（铁匠强化）', () => {
    it('有装备 + 金币充足：扣 UPGRADE_COST×step 金币，COMMON WEAPON baseStat+1，emit BLACKSMITH_UPGRADE', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 5, y: 5 },
          entities: [makeEntity('smith', 'BLACKSMITH', { x: 5, y: 5 })],
        },
        playerOverrides: {
          gold: 50,
          equipment: { WEAPON: { id: 'w1', slot: 'WEAPON', quality: 'COMMON', name: '铁制长剑', baseStat: 10 } },
        },
      });

      const result = upgradeEquip(state, 'smith', 'WEAPON');
      // COMMON step=1：baseStat 10→11；费用 = 20×1×(0+1) = 20
      expect(result.state.player.equipment.WEAPON?.baseStat).toBe(11);
      expect(result.state.player.gold).toBe(50 - BLACKSMITH_UPGRADE_COST); // 20×1×1=20
      expect(result.state.floorState.playerExposedTurns).toBe(2);
      expect(result.events).toEqual([
        { type: 'BLACKSMITH_UPGRADE', entityId: 'smith', slot: 'WEAPON', newStat: 11, newEnhanceLevel: 1 },
        { type: 'PLAYER_EXPOSED', source: 'INTERACTION', turns: 2 },
      ]);
      // 实体不消耗（铁匠可多次使用）
      expect(result.state.floorState.entities.find((e) => e.id === 'smith')?.consumed).toBe(false);
    });

    it('金币不足 / 槽位空 / 不在格 时为 no-op', () => {
      const noGold = makeExpeditionState({
        floorOverrides: {
          player: { x: 5, y: 5 },
          entities: [makeEntity('s', 'BLACKSMITH', { x: 5, y: 5 })],
        },
        playerOverrides: {
          gold: 5,
          equipment: { WEAPON: { id: 'w', slot: 'WEAPON', quality: 'COMMON', name: '刃', baseStat: 1 } },
        },
      });
      expect(upgradeEquip(noGold, 's', 'WEAPON').events).toEqual([]);

      const noEquip = makeExpeditionState({
        floorOverrides: {
          player: { x: 5, y: 5 },
          entities: [makeEntity('s', 'BLACKSMITH', { x: 5, y: 5 })],
        },
        playerOverrides: { gold: 100, equipment: {} },
      });
      expect(upgradeEquip(noEquip, 's', 'WEAPON').events).toEqual([]);
    });
  });


});
