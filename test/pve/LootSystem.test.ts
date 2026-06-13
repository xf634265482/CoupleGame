import {
  applyMonsterKillDrop,
  openChest,
  rollEliteMonsterDrop,
  rollNormalMonsterDrop,
} from '../../assets/scripts/pve/core/LootSystem';
import { createRng } from '../../assets/scripts/pve/core/rng';
import { EMPTY_TREE_BONUSES } from '../../assets/scripts/pve/core/DestinyTreeSystem';
import { ELITE_MONSTER_DROP, NORMAL_MONSTER_DROP, TREE_C2_CHEST_GOLD_BONUS_PCT } from '../../assets/scripts/pve/core/PveConstants';
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

    it('3% 概率额外掉落 COMMON 装备（design §11.3 普通怪极低概率）', () => {
      const rng = createRng(20260608);
      let equipDrops = 0;
      for (let i = 0; i < 3000; i++) {
        const drop = rollNormalMonsterDrop(rng);
        if (drop.equip) {
          expect(drop.equip.quality).toBe('COMMON'); // 必须是 COMMON 品质
          equipDrops++;
        }
      }
      // 名义 3%，允许统计误差 [1%, 6%]
      expect(equipDrops / 3000).toBeGreaterThan(0.01);
      expect(equipDrops / 3000).toBeLessThan(0.06);
    });

    it('同种子序列确定可复现', () => {
      const a = rollNormalMonsterDrop(createRng(42));
      const b = rollNormalMonsterDrop(createRng(42));
      expect(a).toEqual(b);
    });
  });

  describe('rollEliteMonsterDrop — 职业碎片对', () => {
    it('FRAGMENT_PAIR 概率为 5%（配置值）', () => {
      expect(ELITE_MONSTER_DROP.FRAGMENT_PAIR).toBe(0.05);
    });

    it('5% 概率掉落职业碎片对（统计验证）', () => {
      const rng = createRng(20260608);
      let pairDrops = 0;
      for (let i = 0; i < 3000; i++) {
        const drop = rollEliteMonsterDrop(rng);
        if (drop.fragmentPair) pairDrops++;
      }
      // 名义 5%，允许统计误差 [2%, 10%]
      expect(pairDrops / 3000).toBeGreaterThan(0.02);
      expect(pairDrops / 3000).toBeLessThan(0.10);
    });

    it('职业碎片对掉落时不携带 gold/anima/equip，且为 2 个不同职业', () => {
      const rng = createRng(20260608);
      for (let i = 0; i < 3000; i++) {
        const drop = rollEliteMonsterDrop(rng);
        if (drop.fragmentPair) {
          expect(drop.gold).toBeUndefined();
          expect(drop.anima).toBeUndefined();
          expect(drop.equip).toBeUndefined();
          expect(drop.fragmentPair).toHaveLength(2);
          expect(drop.fragmentPair[0]).not.toBe(drop.fragmentPair[1]);
          break;
        }
      }
    });

    it('职业碎片对经 applyMonsterKillDrop 落地：2 个不同职业各 +1 碎片', () => {
      // 找到一个会掉落职业碎片对的 rngState
      let pairRngState: number | null = null;
      const probe = createRng(99999);
      for (let i = 0; i < 5000 && pairRngState === null; i++) {
        const saved = probe.state();
        const drop = rollEliteMonsterDrop(probe);
        if (drop.fragmentPair) pairRngState = saved;
      }
      expect(pairRngState).not.toBeNull();

      const state = makeExpeditionState({
        floorOverrides: {
          rngState: pairRngState!,
          monsters: [makeMonster('e1', { x: 2, y: 2 }, { type: 'ELITE', aiState: 'DEAD' })],
        },
      });
      const result = applyMonsterKillDrop(state, 'e1');
      // 应有 LOOT 事件携带 fragmentPair: 2 个职业
      const lootEv = result.events.find((e) => e.type === 'LOOT');
      expect(lootEv).toBeDefined();
      if (lootEv && lootEv.type === 'LOOT' && lootEv.fragmentPair) {
        expect(lootEv.fragmentPair).toHaveLength(2);
        const frags = result.state.player.classFragments;
        for (const cls of lootEv.fragmentPair) {
          expect(frags[cls] ?? 0).toBeGreaterThanOrEqual(1);
        }
      }
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

    it('灵气掉落经由 AnimaSystem 累积进度，跨阈值时连锁产生 ANIMA_STRENGTHEN', () => {
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

      if (expectedDrop.anima !== undefined && 95 + expectedDrop.anima >= 100) {
        expect(result.events.some((e) => e.type === 'ANIMA_STRENGTHEN')).toBe(true);
      } else {
        expect(result.events.some((e) => e.type === 'ANIMA_STRENGTHEN')).toBe(false);
      }
    });

    it('命运树 C2 宝箱老手：宝箱金币额外 +20%（取整）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 3, y: 3 },
          ap: 10,
          entities: [makeEntity('chest1', 'CHEST', { x: 3, y: 3 })],
        },
        playerOverrides: {
          treeBonuses: { ...EMPTY_TREE_BONUSES, chestGoldBonusPct: TREE_C2_CHEST_GOLD_BONUS_PCT },
        },
      });

      const expectedDrop = rollNormalMonsterDrop(createRng(state.floorState.rngState));
      const result = openChest(state, 'chest1');

      if (expectedDrop.gold) {
        const boosted = Math.round(expectedDrop.gold * (1 + TREE_C2_CHEST_GOLD_BONUS_PCT));
        expect((result.events[1] as { gold?: number }).gold).toBe(boosted);
        expect(result.state.player.gold).toBe(state.player.gold + boosted);
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

  describe('applyMonsterKillDrop — 章节 2-5 Boss 通用掉落', () => {
    const CHAPTER_QUALITY: Array<{ chapter: number; quality: EquipQuality }> = [
      { chapter: 2, quality: 'FINE' },
      { chapter: 3, quality: 'RARE' },
      { chapter: 4, quality: 'EPIC' },
      { chapter: 5, quality: 'LEGENDARY' },
    ];

    CHAPTER_QUALITY.forEach(({ chapter, quality }) => {
      it(`章节 ${chapter} Boss 掉落 10 金 + ${quality} 品质装备`, () => {
        const bossId = ['SANDWORM_QUEEN', 'FROST_GIANT', 'LAVA_LORD', 'FATE_GUARDIAN'][chapter - 2];
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
          expect(loot.gold).toBe(10);
          expect(loot.equip).toBeDefined();
          expect(loot.equip!.quality).toBe(quality);
        }
        expect(result.state.player.gold).toBe(state.player.gold + 10);
      });
    });

    it('章节 1 GOBLIN_CHIEF 仍走专属掉落路径（含专属武器）', () => {
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
        expect(loot.equip?.slot).toBe('WEAPON');
      }
    });
  });
});
