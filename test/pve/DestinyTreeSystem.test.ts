// 命运碎片成长树（design「命运树 V1 数值调整建议」）单测：
// 节点解锁（碎片扣减/同列顺序约束）、效果汇总（getTreeBonuses）、
// 「三选一」待选队列构建与选定（resolveTreeChoice，E2 装备 / E3 词条）。

import {
  applyFragmentBonus,
  buildPendingTreeChoices,
  canUnlockNode,
  deriveTreeRng,
  EMPTY_TREE_BONUSES,
  getNodeDef,
  getTreeBonuses,
  resolveTreeChoice,
  rollEquipChoiceOptions,
  rollTraitChoiceOptions,
  unlockNode,
} from '../../assets/scripts/pve/core/DestinyTreeSystem';
import {
  TREE_A1_HP_BONUS,
  TREE_A2_HP_BONUS,
  TREE_A3_DEATH_GOLD_RETENTION,
  TREE_B1_ATTACK_BONUS,
  TREE_B2_AP_DICE_BONUS,
  TREE_B3_FRAGMENT_BONUS,
  TREE_C1_GOLD_BONUS,
  TREE_C2_CHEST_GOLD_BONUS_PCT,
  TREE_C3_BLACKSMITH_DISCOUNT,
  TREE_D1_ANIMA_BONUS,
  TREE_D2_THRESHOLD_MULT,
  TREE_D3_ANIMA_GAIN_PCT,
  TREE_E1_HP_BONUS,
} from '../../assets/scripts/pve/core/PveConstants';
import type { PveMeta } from '../../assets/scripts/pve/core/PveTypes';
import { makeExpeditionState } from './helpers';

function makeMeta(overrides: Partial<PveMeta> = {}): PveMeta {
  return {
    destinyShards: 100,
    diamond: 0,
    achievements: [],
    codex: { monsters: [], equipment: [] },
    unlockedTreeNodes: [],
    ...overrides,
  };
}

describe('DestinyTreeSystem — 命运碎片成长树', () => {
  describe('getNodeDef', () => {
    it('按 id 返回节点定义；不存在的 id 返回 undefined', () => {
      expect(getNodeDef('A1')?.name).toBe('坚韧之躯Ⅰ');
      expect(getNodeDef('Z9')).toBeUndefined();
    });
  });

  describe('canUnlockNode / unlockNode', () => {
    it('首节点（order=1）碎片足够时可解锁', () => {
      const meta = makeMeta({ destinyShards: 15 });
      expect(canUnlockNode(meta, 'A1')).toBe(true);
    });

    it('碎片不足时不可解锁', () => {
      const meta = makeMeta({ destinyShards: 10 });
      expect(canUnlockNode(meta, 'A1')).toBe(false);
    });

    it('同列后续节点需先解锁前一节点', () => {
      const meta = makeMeta({ destinyShards: 100, unlockedTreeNodes: [] });
      expect(canUnlockNode(meta, 'A2')).toBe(false);

      const withA1 = makeMeta({ destinyShards: 100, unlockedTreeNodes: ['A1'] });
      expect(canUnlockNode(withA1, 'A2')).toBe(true);
    });

    it('已解锁节点不可重复解锁', () => {
      const meta = makeMeta({ destinyShards: 100, unlockedTreeNodes: ['A1'] });
      expect(canUnlockNode(meta, 'A1')).toBe(false);
    });

    it('unlockNode 扣除碎片并加入 unlockedTreeNodes', () => {
      const meta = makeMeta({ destinyShards: 15 });
      const next = unlockNode(meta, 'A1');
      expect(next.destinyShards).toBe(0);
      expect(next.unlockedTreeNodes).toEqual(['A1']);
    });

    it('不可解锁时 unlockNode 为 no-op，原样返回 meta', () => {
      const meta = makeMeta({ destinyShards: 5 });
      expect(unlockNode(meta, 'A1')).toBe(meta);
    });

    it('不存在的节点 id 为 no-op', () => {
      const meta = makeMeta({ destinyShards: 100 });
      expect(unlockNode(meta, 'Z9')).toBe(meta);
    });
  });

  describe('getTreeBonuses', () => {
    it('未解锁任何节点时返回全零快照', () => {
      expect(getTreeBonuses(undefined)).toEqual(EMPTY_TREE_BONUSES);
      expect(getTreeBonuses([])).toEqual(EMPTY_TREE_BONUSES);
    });

    it('A 列：A1/A2 maxHp 累加，A3 设置死亡金币保留比例', () => {
      const bonuses = getTreeBonuses(['A1', 'A2', 'A3']);
      expect(bonuses.maxHpBonus).toBe(TREE_A1_HP_BONUS + TREE_A2_HP_BONUS);
      expect(bonuses.deathGoldRetentionPct).toBe(TREE_A3_DEATH_GOLD_RETENTION);
    });

    it('B 列：B1 攻击力、B2 骰子上限、B3 碎片加成', () => {
      const bonuses = getTreeBonuses(['B1', 'B2', 'B3']);
      expect(bonuses.attackBonus).toBe(TREE_B1_ATTACK_BONUS);
      expect(bonuses.apDiceBonus).toBe(TREE_B2_AP_DICE_BONUS);
      expect(bonuses.fragmentBonus).toBe(TREE_B3_FRAGMENT_BONUS);
    });

    it('C 列：C1 开局金币、C2 宝箱金币百分比、C3 铁匠折扣', () => {
      const bonuses = getTreeBonuses(['C1', 'C2', 'C3']);
      expect(bonuses.startGoldBonus).toBe(TREE_C1_GOLD_BONUS);
      expect(bonuses.chestGoldBonusPct).toBe(TREE_C2_CHEST_GOLD_BONUS_PCT);
      expect(bonuses.blacksmithDiscount).toBe(TREE_C3_BLACKSMITH_DISCOUNT);
    });

    it('D 列：D1 开局灵气、D2 强化阈值系数、D3 灵气获取百分比', () => {
      const bonuses = getTreeBonuses(['D1', 'D2', 'D3']);
      expect(bonuses.startAnimaBonus).toBe(TREE_D1_ANIMA_BONUS);
      expect(bonuses.strengthenThresholdMult).toBeCloseTo(TREE_D2_THRESHOLD_MULT);
      expect(bonuses.animaGainBonusPct).toBe(TREE_D3_ANIMA_GAIN_PCT);
    });

    it('E 列：E1 maxHp、E2/E3 三选一标记', () => {
      const bonuses = getTreeBonuses(['E1', 'E2', 'E3']);
      expect(bonuses.maxHpBonus).toBe(TREE_E1_HP_BONUS);
      expect(bonuses.hasEquipChoice).toBe(true);
      expect(bonuses.hasTraitChoice).toBe(true);
    });

    it('A1 与 E1 同时解锁时 maxHpBonus 累加', () => {
      const bonuses = getTreeBonuses(['A1', 'E1']);
      expect(bonuses.maxHpBonus).toBe(TREE_A1_HP_BONUS + TREE_E1_HP_BONUS);
    });
  });

  describe('rollEquipChoiceOptions / rollTraitChoiceOptions', () => {
    it('rollEquipChoiceOptions 返回 3 件互不相同槽位的装备', () => {
      const rng = deriveTreeRng(123);
      const options = rollEquipChoiceOptions(rng);
      expect(options).toHaveLength(3);
      const slots = new Set(options.map((o) => o.slot));
      expect(slots.size).toBe(3);
    });

    it('rollTraitChoiceOptions 返回最多 3 个互不相同的词条候选', () => {
      const rng = deriveTreeRng(456);
      const options = rollTraitChoiceOptions(rng, 'BERSERKER');
      expect(options.length).toBeGreaterThan(0);
      expect(options.length).toBeLessThanOrEqual(3);
      expect(new Set(options).size).toBe(options.length);
    });
  });

  describe('buildPendingTreeChoices', () => {
    it('未解锁 E2/E3 时返回空队列', () => {
      const rng = deriveTreeRng(1);
      const { choices, events } = buildPendingTreeChoices(rng, EMPTY_TREE_BONUSES, 'ADVENTURER');
      expect(choices).toEqual([]);
      expect(events).toEqual([]);
    });

    it('解锁 E2 时生成 EQUIP 待选项并产生 TREE_CHOICE_OFFERED 事件', () => {
      const rng = deriveTreeRng(2);
      const bonuses = { ...EMPTY_TREE_BONUSES, hasEquipChoice: true };
      const { choices, events } = buildPendingTreeChoices(rng, bonuses, 'ADVENTURER');
      expect(choices).toHaveLength(1);
      expect(choices[0].source).toBe('E2');
      expect(choices[0].kind).toBe('EQUIP');
      expect(choices[0].equipOptions).toHaveLength(3);
      expect(events).toEqual([{ type: 'TREE_CHOICE_OFFERED', source: 'E2', kind: 'EQUIP' }]);
    });

    it('解锁 E3 时生成 TRAIT 待选项并产生 TREE_CHOICE_OFFERED 事件', () => {
      const rng = deriveTreeRng(3);
      const bonuses = { ...EMPTY_TREE_BONUSES, hasTraitChoice: true };
      const { choices, events } = buildPendingTreeChoices(rng, bonuses, 'BERSERKER');
      expect(choices).toHaveLength(1);
      expect(choices[0].source).toBe('E3');
      expect(choices[0].kind).toBe('TRAIT');
      expect(choices[0].traitOptions!.length).toBeGreaterThan(0);
      expect(events).toEqual([{ type: 'TREE_CHOICE_OFFERED', source: 'E3', kind: 'TRAIT' }]);
    });

    it('同时解锁 E2/E3 时按顺序生成两个待选项', () => {
      const rng = deriveTreeRng(4);
      const bonuses = { ...EMPTY_TREE_BONUSES, hasEquipChoice: true, hasTraitChoice: true };
      const { choices } = buildPendingTreeChoices(rng, bonuses, 'ARCHER');
      expect(choices.map((c) => c.source)).toEqual(['E2', 'E3']);
    });
  });

  describe('resolveTreeChoice', () => {
    it('EQUIP：选定项装入对应槽位，并从队列移除', () => {
      const rng = deriveTreeRng(5);
      const options = rollEquipChoiceOptions(rng);
      const state = makeExpeditionState({});
      const withPending = { ...state, pendingTreeChoices: [{ source: 'E2' as const, kind: 'EQUIP' as const, equipOptions: options }] };

      const result = resolveTreeChoice(withPending, 1);
      const selected = options[1];
      expect(result.state.player.equipment[selected.slot]).toEqual(selected);
      expect(result.state.pendingTreeChoices).toEqual([]);
      expect(result.events).toEqual([
        { type: 'TREE_CHOICE_RESOLVED', source: 'E2', kind: 'EQUIP', selected: selected.name },
      ]);
    });

    it('TRAIT：选定项加入 classTraits，并从队列移除', () => {
      const state = makeExpeditionState({});
      const withPending = {
        ...state,
        pendingTreeChoices: [{ source: 'E3' as const, kind: 'TRAIT' as const, traitOptions: ['life_steal', 'berserk', 'undying'] }],
      };

      const result = resolveTreeChoice(withPending, 0);
      expect(result.state.player.classTraits).toContain('life_steal');
      expect(result.state.pendingTreeChoices).toEqual([]);
      expect(result.events).toEqual([
        { type: 'TREE_CHOICE_RESOLVED', source: 'E3', kind: 'TRAIT', selected: 'life_steal' },
      ]);
    });

    it('已拥有该词条时为去重 no-op（仍移出队列）', () => {
      const state = makeExpeditionState({ playerOverrides: { classTraits: ['life_steal'] } });
      const withPending = {
        ...state,
        pendingTreeChoices: [{ source: 'E3' as const, kind: 'TRAIT' as const, traitOptions: ['life_steal', 'berserk'] }],
      };

      const result = resolveTreeChoice(withPending, 0);
      expect(result.state.player.classTraits).toEqual(['life_steal']);
      expect(result.state.pendingTreeChoices).toEqual([]);
    });

    it('队列为空时为 no-op', () => {
      const state = makeExpeditionState({});
      expect(resolveTreeChoice(state, 0)).toEqual({ state, events: [] });
    });

    it('选择下标越界时为 no-op', () => {
      const state = makeExpeditionState({});
      const withPending = {
        ...state,
        pendingTreeChoices: [{ source: 'E3' as const, kind: 'TRAIT' as const, traitOptions: ['life_steal'] }],
      };
      expect(resolveTreeChoice(withPending, 5)).toEqual({ state: withPending, events: [] });
    });
  });

  describe('applyFragmentBonus', () => {
    it('fragmentBonus<=0 时原样返回 classFragments（同引用）', () => {
      const rng = deriveTreeRng(7);
      const fragments = { BERSERKER: 1 };
      expect(applyFragmentBonus(rng, fragments, 0)).toBe(fragments);
    });

    it('fragmentBonus>0 时随机给一个可进阶职业 +N 碎片', () => {
      const rng = deriveTreeRng(8);
      const result = applyFragmentBonus(rng, {}, TREE_B3_FRAGMENT_BONUS);
      const totals = Object.values(result);
      expect(totals.reduce((a, b) => a + (b ?? 0), 0)).toBe(TREE_B3_FRAGMENT_BONUS);
    });
  });

  describe('deriveTreeRng', () => {
    it('同 runSeed 派生的 rng 状态确定可复现（AC-13）', () => {
      const a = deriveTreeRng(999);
      const b = deriveTreeRng(999);
      expect(a.state()).toBe(b.state());
    });

    it('不同 runSeed 派生不同的 rng 状态', () => {
      const a = deriveTreeRng(1);
      const b = deriveTreeRng(2);
      expect(a.state()).not.toBe(b.state());
    });
  });
});
