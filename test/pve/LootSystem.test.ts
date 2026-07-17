import {
  applyMonsterKillDrop,
  openChest,
  rollNormalMonsterDrop,
} from '../../assets/scripts/pve/core/LootSystem';
import { createRng } from '../../assets/scripts/pve/core/rng';
import { NORMAL_MONSTER_DROP } from '../../assets/scripts/pve/core/PveConstants';
import { makeEntity, makeExpeditionState, makeMonster } from './helpers';
import type { EquipQuality } from '../../assets/scripts/pve/core/PveTypes';

describe('LootSystem — 掉落与宝箱（AC-6）', () => {
  describe('rollNormalMonsterDrop', () => {
    it('三种基础形态（金币/灵气/两者）概率约 50/25/25，数值在配置区间内；装备为独立附加', () => {
      const rng = createRng(20260608);
      const [goldMin, goldMax] = NORMAL_MONSTER_DROP.goldSmall;
      const [animaMin, animaMax] = NORMAL_MONSTER_DROP.animaSmall;
      let goldOnly = 0;
      let animaOnly = 0;
      let both = 0;

      for (let i = 0; i < 2000; i++) {
        const drop = rollNormalMonsterDrop(rng);
        const hasGold = drop.gold !== undefined;
        const hasAnima = drop.anima !== undefined;
        // 基础掉落：金币或灵气至少有一个
        expect(hasGold || hasAnima).toBe(true);
        if (hasGold) {
          expect(drop.gold).toBeGreaterThanOrEqual(goldMin);
          expect(drop.gold).toBeLessThanOrEqual(goldMax);
        }
        if (hasAnima) {
          expect(drop.anima).toBeGreaterThanOrEqual(animaMin);
          expect(drop.anima).toBeLessThanOrEqual(animaMax);
        }
        // 统计基础形态（不计装备附加）
        if (hasGold && !hasAnima) goldOnly++;
        else if (!hasGold && hasAnima) animaOnly++;
        else both++;
      }

      // 名义概率 50/25/25，允许统计误差
      expect(goldOnly / 2000).toBeGreaterThan(0.4);
      expect(goldOnly / 2000).toBeLessThan(0.6);
      expect(animaOnly / 2000).toBeGreaterThan(0.15);
      expect(animaOnly / 2000).toBeLessThan(0.35);
      expect(both / 2000).toBeGreaterThan(0.15);
      expect(both / 2000).toBeLessThan(0.35);
    });

    it('ch1 总装备掉率约 4%（COMMON≈2.7% + FINE≈1.3%，单次掷骰 Phase 4）', () => {
      const rng = createRng(20260608);
      let equipDrops = 0;
      for (let i = 0; i < 3000; i++) {
        const drop = rollNormalMonsterDrop(rng, 1);
        if (drop.equip) {
          // Phase 4：ch1 只出 COMMON 或 FINE，不出 RARE+
          expect(['COMMON', 'FINE']).toContain(drop.equip.quality);
          equipDrops++;
        }
      }
      // 名义约 4%，允许统计误差
      expect(equipDrops / 3000).toBeGreaterThan(0.02);
      expect(equipDrops / 3000).toBeLessThan(0.08);
    });

    it('同种子序列确定可复现', () => {
      const a = rollNormalMonsterDrop(createRng(42));
      const b = rollNormalMonsterDrop(createRng(42));
      expect(a).toEqual(b);
    });
  });

  describe('openChest', () => {
    it('成功开箱：扣 1 点 AP、标记已消耗、按掉落表结算并产生 OPEN_CHEST→LOOT 事件', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 3, y: 3 },
          ap: 10,
          entities: [makeEntity('chest1', 'CHEST', { x: 3, y: 3 })],
        },
      });

      const expectedDrop = rollNormalMonsterDrop(createRng(state.floorState.rngState));
      const result = openChest(state, 'chest1');

      expect(result.state.floorState.ap).toBe(9);
      expect(result.state.floorState.entities.find((e) => e.id === 'chest1')?.consumed).toBe(true);
      expect(result.events[0]).toEqual({ type: 'OPEN_CHEST', entityId: 'chest1' });
      // AC-17：openChest 有 10% 概率额外带 equip 字段；用 toMatchObject 只验核心字段
      expect(result.events[1]).toMatchObject({
        type: 'LOOT',
        gold: expectedDrop.gold,
        anima: expectedDrop.anima,
        source: 'chest1',
      });
      expect(result.state.player.gold).toBe(state.player.gold + (expectedDrop.gold ?? 0));
      expect(result.state.player.anima).toBe(state.player.anima + (expectedDrop.anima ?? 0));
    });

    it('灵气掉落经 AnimaSystem 累积进度，不 emit 强化事件', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 3, y: 3 },
          ap: 10,
          entities: [makeEntity('chest1', 'CHEST', { x: 3, y: 3 })],
        },
        playerOverrides: { animaProgress: 95 },
      });

      const expectedDrop = rollNormalMonsterDrop(createRng(state.floorState.rngState));
      const result = openChest(state, 'chest1');

      expect(result.events[0]?.type).toBe('OPEN_CHEST');
      expect(result.events.some((e) => e.type === 'LOOT')).toBe(true);
      expect(result.events.every((e) => (e.type as string) !== 'ANIMA_STRENGTHEN')).toBe(true);
      if (expectedDrop.anima !== undefined) {
        expect(result.state.player.animaProgress).toBe(95 + expectedDrop.anima);
      }
    });


    it('已开启的宝箱不能重复开启（no-op）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 3, y: 3 },
          ap: 10,
          entities: [makeEntity('chest1', 'CHEST', { x: 3, y: 3 }, { consumed: true })],
        },
      });

      const result = openChest(state, 'chest1');
      expect(result.state).toBe(state);
      expect(result.events).toEqual([]);
    });

    it('玩家不在宝箱所在格时拒绝开启（no-op）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 0, y: 0 },
          ap: 10,
          entities: [makeEntity('chest1', 'CHEST', { x: 3, y: 3 })],
        },
      });

      const result = openChest(state, 'chest1');
      expect(result.state).toBe(state);
      expect(result.events).toEqual([]);
    });

    it('AP 不足时拒绝开启（no-op）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 3, y: 3 },
          ap: 0,
          entities: [makeEntity('chest1', 'CHEST', { x: 3, y: 3 })],
        },
      });

      const result = openChest(state, 'chest1');
      expect(result.state).toBe(state);
      expect(result.events).toEqual([]);
    });

    it('实体不存在或类型不是宝箱时拒绝开启（no-op）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 3, y: 3 },
          ap: 10,
          entities: [makeEntity('key1', 'KEY', { x: 3, y: 3 })],
        },
      });

      expect(openChest(state, 'key1').events).toEqual([]);
      expect(openChest(state, 'unknown').events).toEqual([]);
    });
  });

  describe('applyMonsterKillDrop — Boss 三层掉落（design Boss设计V1）', () => {
    // 各章节 BOSS_SPOILS 的品质（均统一一档：ch1=RARE / ch2-3=EPIC / ch4-5=LEGENDARY）
    const CHAPTER_BOSS: Array<{ chapter: number; bossId: string; quality: EquipQuality }> = [
      { chapter: 2, bossId: 'QUICKSAND_SCORPION', quality: 'EPIC' },
      { chapter: 3, bossId: 'FROST_GIANT', quality: 'EPIC' },
      { chapter: 4, bossId: 'LAVA_LORD', quality: 'LEGENDARY' },
      { chapter: 5, bossId: 'FATE_GUARDIAN', quality: 'LEGENDARY' },
    ];

    CHAPTER_BOSS.forEach(({ chapter, bossId, quality }) => {
      it(`章节 ${chapter} Boss 掉落通用奖励 + 1 件 ${quality} 专属装备`, () => {
        const state = makeExpeditionState({
          chapter,
          floorOverrides: {
            monsters: [makeMonster('boss1', { x: 1, y: 1 }, { type: 'BOSS', bossId, aiState: 'DEAD' })],
          },
        });

        const result = applyMonsterKillDrop(state, 'boss1');
        const loot = result.events.find((e) => e.type === 'LOOT');
        expect(loot).toBeDefined();
        if (loot && loot.type === 'LOOT') {
          // 通用奖励：金币按 bossDropScaled 缩放（>0）
          expect(loot.gold ?? 0).toBeGreaterThan(0);
          // 专属：必定一件装备，品质按 BOSS_SPOILS 表
          expect(loot.equip).toBeDefined();
          expect(loot.equip!.quality).toBe(quality);
        }
        // 实际金币入账
        expect(result.state.player.gold).toBeGreaterThan(state.player.gold);
      });
    });

    it('章节 1 GOBLIN_CHIEF 掉落：3 件专属中 1 件（RARE 品质）', () => {
      const state = makeExpeditionState({
        chapter: 1,
        floorOverrides: {
          monsters: [makeMonster('boss1', { x: 1, y: 1 }, { type: 'BOSS', bossId: 'GOBLIN_CHIEF', aiState: 'DEAD' })],
        },
      });
      const result = applyMonsterKillDrop(state, 'boss1');
      const loot = result.events.find((e) => e.type === 'LOOT');
      expect(loot).toBeDefined();
      if (loot && loot.type === 'LOOT') {
        expect(loot.equip).toBeDefined();
        expect(loot.equip!.quality).toBe('RARE');
        expect(['哥布林酋长战斧', '战争号角', '破旧王冠']).toContain(loot.equip!.name);
      }
    });

    it('稀有掉落：多次击杀不再产生旧碎片、卷轴或遗物', () => {
      const goblinChiefSlotBlockers = {
        WEAPON: { id: 'stub_w', name: '铁制长剑', slot: 'WEAPON' as const, quality: 'COMMON' as const, baseStat: 10 },
        HELMET: { id: 'stub_h', name: '皮革头盔', slot: 'HELMET' as const, quality: 'COMMON' as const, baseStat: 10 },
        TRINKET: { id: 'stub_t', name: '幸运铜币', slot: 'TRINKET' as const, quality: 'COMMON' as const, baseStat: 5 },
      };
      for (let seed = 1; seed <= 100; seed++) {
        const state = makeExpeditionState({
          seed,
          chapter: 1,
          playerOverrides: { equipment: goblinChiefSlotBlockers },
          floorOverrides: {
            monsters: [makeMonster('boss1', { x: 1, y: 1 }, { type: 'BOSS', bossId: 'GOBLIN_CHIEF', aiState: 'DEAD' })],
          },
        });
        const result = applyMonsterKillDrop(state, 'boss1');
        expect(result.events.every((e) => (e.type as string) !== 'SHARDS_PICKUP')).toBe(true);
        expect(result.events.every((e) => (e.type as string) !== 'SCROLL_PICKUP')).toBe(true);
        expect(result.events.every((e) => (e.type as string) !== 'RELIC_PICKUP')).toBe(true);
      }
    });

    it('永久逐层 Boss 掉落专属战利品（RARE 哥布林池），非楼层传说池', () => {
      const state = makeExpeditionState({
        chapter: 1,
        floor: 7,
        persistentFloorMode: true,
        floorOverrides: {
          monsters: [makeMonster('boss1', { x: 1, y: 1 }, { type: 'BOSS', bossId: 'GOBLIN_CHIEF', aiState: 'DEAD' })],
        },
        playerOverrides: {
          equipment: {},
        },
      });
      const result = applyMonsterKillDrop(state, 'boss1');
      const lootEvents = result.events.filter((e) => e.type === 'LOOT');
      expect(lootEvents.length).toBeGreaterThanOrEqual(1);
      const spoilLoot = lootEvents[0];
      expect(spoilLoot && spoilLoot.type === 'LOOT' && spoilLoot.equip).toBeTruthy();
      if (spoilLoot && spoilLoot.type === 'LOOT' && spoilLoot.equip) {
        expect(spoilLoot.equip.quality).toBe('RARE');
        expect(['哥布林酋长战斧', '战争号角', '破旧王冠']).toContain(spoilLoot.equip.name);
        expect(spoilLoot.equip.name).not.toBe('命运之刃');
      }
    });
  });
});
