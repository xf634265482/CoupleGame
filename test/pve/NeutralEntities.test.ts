import { rerollEquipTrait, upgradeEquip, useAltar, useHotSpring, useIdol } from '../../assets/scripts/pve/core/NeutralEntities';
import { EMPTY_TREE_BONUSES } from '../../assets/scripts/pve/core/DestinyTreeSystem';
import {
  ALTAR_ANIMA_MAX,
  ALTAR_ANIMA_MIN,
  BLACKSMITH_REROLL_COST,
  BLACKSMITH_UPGRADE_COST,
  HOT_SPRING_HEAL_RATIO,
  IDOL_MAX_HP_BONUS,
  TREE_C3_BLACKSMITH_DISCOUNT,
} from '../../assets/scripts/pve/core/PveConstants';
import { makeEntity, makeExpeditionState } from './helpers';

describe('NeutralEntities — 中立交互实体（M1 新增）', () => {
  describe('useIdol（神像 · 永久 +1 maxHp）', () => {
    it('玩家站在神像格 + AP ≥ 1 + 未消耗：扣 AP、maxHp 与 hp 同步 +IDOL_MAX_HP_BONUS、emit IDOL_BLESSING', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 3, y: 3 },
          ap: 5,
          entities: [makeEntity('idol1', 'IDOL', { x: 3, y: 3 })],
        },
        playerOverrides: { hp: 15, maxHp: 20 },
      });

      const result = useIdol(state, 'idol1');
      expect(result.state.player.maxHp).toBe(20 + IDOL_MAX_HP_BONUS);
      expect(result.state.player.hp).toBe(15 + IDOL_MAX_HP_BONUS);
      expect(result.state.floorState.ap).toBe(4);
      expect(result.state.floorState.entities.find((e) => e.id === 'idol1')?.consumed).toBe(true);
      expect(result.events).toEqual([
        { type: 'IDOL_BLESSING', entityId: 'idol1', maxHpBonus: IDOL_MAX_HP_BONUS },
      ]);
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

  describe('useHotSpring（温泉 · 恢复 maxHp 的 40%）', () => {
    it('玩家受伤后泡温泉：扣 AP、HP 恢复 40% maxHp、emit HOT_SPRING_HEAL', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          ap: 5,
          entities: [makeEntity('s1', 'HOT_SPRING', { x: 4, y: 4 })],
        },
        playerOverrides: { hp: 5, maxHp: 20 },
      });

      // 30% × 20 = 6，hp: 5 → 11，healed = 6（V3：每章 2 个温泉，削减单次回量）
      const result = useHotSpring(state, 's1');
      expect(result.state.player.hp).toBe(11);
      expect(result.state.floorState.ap).toBe(4);
      const heal = result.events.find((e) => e.type === 'HOT_SPRING_HEAL');
      expect(heal && heal.type === 'HOT_SPRING_HEAL' && heal.healed).toBe(6);
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

  describe('useAltar（祭坛 · 随机灵气 + 可触发强化）', () => {
    it('玩家站在祭坛格 + AP ≥ 1 + 未消耗：扣 AP、消耗实体、灵气在 [MIN,MAX] 范围内、emit ALTAR_USED', () => {
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
          equipment: { WEAPON: { id: 'w1', slot: 'WEAPON', quality: 'COMMON', name: '短刃', baseStat: 10 } },
        },
      });

      const result = upgradeEquip(state, 'smith', 'WEAPON');
      // COMMON step=1：baseStat 10→11；费用 = 20×1×(0+1) = 20
      expect(result.state.player.equipment.WEAPON?.baseStat).toBe(11);
      expect(result.state.player.gold).toBe(50 - BLACKSMITH_UPGRADE_COST); // 20×1×1=20
      expect(result.events).toEqual([
        { type: 'BLACKSMITH_UPGRADE', entityId: 'smith', slot: 'WEAPON', newStat: 11, newEnhanceLevel: 1 },
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

  describe('upgradeEquip — 命运树 C3 铁匠熟客', () => {
    it('解锁 C3 时强化费用减免（最低 1）', () => {
      const cost = BLACKSMITH_UPGRADE_COST - TREE_C3_BLACKSMITH_DISCOUNT;
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 5, y: 5 },
          entities: [makeEntity('smith', 'BLACKSMITH', { x: 5, y: 5 })],
        },
        playerOverrides: {
          gold: cost,
          equipment: { WEAPON: { id: 'w1', slot: 'WEAPON', quality: 'COMMON', name: '短刃', baseStat: 10 } },
          treeBonuses: { ...EMPTY_TREE_BONUSES, blacksmithDiscount: TREE_C3_BLACKSMITH_DISCOUNT },
        },
      });

      const result = upgradeEquip(state, 'smith', 'WEAPON');
      expect(result.state.player.gold).toBe(0);
      // COMMON step=1：baseStat 10→11
      expect(result.state.player.equipment.WEAPON?.baseStat).toBe(11);
    });
  });

  describe('rerollEquipTrait（铁匠洗炼词条）', () => {
    it('EPIC 装备 + 金币充足：扣 REROLL_COST 金币，换新词条，emit BLACKSMITH_REROLL', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 5, y: 5 },
          entities: [makeEntity('smith', 'BLACKSMITH', { x: 5, y: 5 })],
        },
        playerOverrides: {
          gold: 50,
          equipment: {
            ARMOR: { id: 'a1', slot: 'ARMOR', quality: 'EPIC', name: '精英轻甲', baseStat: 3, trait: 'equip_atk_up' },
          },
        },
      });

      const result = rerollEquipTrait(state, 'smith', 'ARMOR');
      expect(result.state.player.gold).toBe(50 - BLACKSMITH_REROLL_COST);
      expect(result.state.player.equipment.ARMOR?.trait).toBeDefined();
      expect(result.events[0].type).toBe('BLACKSMITH_REROLL');
    });

    it('确定性：相同 rngState 下两次洗炼结果相同', () => {
      const base = makeExpeditionState({
        floorOverrides: {
          player: { x: 5, y: 5 },
          entities: [makeEntity('s', 'BLACKSMITH', { x: 5, y: 5 })],
        },
        playerOverrides: {
          gold: 100,
          equipment: { WEAPON: { id: 'w', slot: 'WEAPON', quality: 'LEGENDARY', name: '传说剑', baseStat: 5 } },
        },
      });
      const r1 = rerollEquipTrait(base, 's', 'WEAPON');
      const r2 = rerollEquipTrait(base, 's', 'WEAPON');
      expect(r1.state.player.equipment.WEAPON?.trait).toBe(r2.state.player.equipment.WEAPON?.trait);
    });

    it('金币不足 时为 no-op', () => {
      const noGold = makeExpeditionState({
        floorOverrides: {
          player: { x: 5, y: 5 },
          entities: [makeEntity('s', 'BLACKSMITH', { x: 5, y: 5 })],
        },
        playerOverrides: {
          gold: 10,
          equipment: { WEAPON: { id: 'w', slot: 'WEAPON', quality: 'EPIC', name: '精英剑', baseStat: 3 } },
        },
      });
      expect(rerollEquipTrait(noGold, 's', 'WEAPON').events).toEqual([]);
    });

    it('COMMON / FINE / RARE 品质装备 洗炼为 no-op（品质不足）', () => {
      for (const quality of ['COMMON', 'FINE', 'RARE'] as const) {
        const state = makeExpeditionState({
          floorOverrides: {
            player: { x: 5, y: 5 },
            entities: [makeEntity('s', 'BLACKSMITH', { x: 5, y: 5 })],
          },
          playerOverrides: {
            gold: 100,
            equipment: { WEAPON: { id: 'w', slot: 'WEAPON', quality, name: '刃', baseStat: 1 } },
          },
        });
        expect(rerollEquipTrait(state, 's', 'WEAPON').events).toEqual([]);
      }
    });
  });
});
