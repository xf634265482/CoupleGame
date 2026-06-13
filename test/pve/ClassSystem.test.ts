import { applyClassAdvance, applyClassAwaken, getAwakenEligible, pickFragment } from '../../assets/scripts/pve/core/ClassSystem';
import {
  AWAKEN_FORMS,
  AWAKEN_REQUIRED_CHAPTER,
  AWAKEN_SECONDARY_TOTAL,
  CLASS_FRAGMENTS_TO_ADVANCE,
  CLASS_FRAGMENTS_TO_AWAKEN,
} from '../../assets/scripts/pve/core/PveConstants';
import { makeEntity, makeExpeditionState, makeRunPlayer } from './helpers';

describe('ClassSystem — 职业碎片与进阶（AC-15 M2）', () => {
  describe('pickFragment', () => {
    it('站在碎片格：消耗实体、classFragments 计数 +1、emit FRAGMENT_PICKED', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 3, y: 3 },
          entities: [makeEntity('frag1', 'FRAGMENT', { x: 3, y: 3 }, { fragmentClass: 'BERSERKER' })],
        },
      });

      const result = pickFragment(state, 'frag1');
      expect(result.state.player.classFragments['BERSERKER']).toBe(1);
      expect(result.state.floorState.entities.find((e) => e.id === 'frag1')?.consumed).toBe(true);
      expect(result.events).toEqual([
        { type: 'FRAGMENT_PICKED', entityId: 'frag1', classId: 'BERSERKER', totalFragments: 1 },
      ]);
    });

    it('不在碎片格 / 已消耗时为 no-op', () => {
      const notHere = makeExpeditionState({
        floorOverrides: {
          player: { x: 0, y: 0 },
          entities: [makeEntity('frag', 'FRAGMENT', { x: 5, y: 5 }, { fragmentClass: 'ARCHER' })],
        },
      });
      expect(pickFragment(notHere, 'frag').events).toEqual([]);

      const consumed = makeExpeditionState({
        floorOverrides: {
          player: { x: 5, y: 5 },
          entities: [makeEntity('frag', 'FRAGMENT', { x: 5, y: 5 }, { fragmentClass: 'ARCHER', consumed: true })],
        },
      });
      expect(pickFragment(consumed, 'frag').events).toEqual([]);
    });

    it(`集齐 ${CLASS_FRAGMENTS_TO_ADVANCE} 个同职业碎片后 emit CLASS_CAN_ADVANCE`, () => {
      // 已有 阈值-1 个，再拾 1 个恰好达到阈值
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 3, y: 3 },
          entities: [makeEntity('frag3', 'FRAGMENT', { x: 3, y: 3 }, { fragmentClass: 'ROGUE' })],
        },
        playerOverrides: { classFragments: { ROGUE: CLASS_FRAGMENTS_TO_ADVANCE - 1 } },
      });

      const result = pickFragment(state, 'frag3');
      const advEvent = result.events.find((e) => e.type === 'CLASS_CAN_ADVANCE');
      expect(advEvent).toBeDefined();
      expect(advEvent?.type === 'CLASS_CAN_ADVANCE' && advEvent.available).toContain('ROGUE');
    });

    it('当前职业碎片达到阈值时不触发 CLASS_CAN_ADVANCE（无需进阶自身）', () => {
      // 玩家已是 BERSERKER，再收集 BERSERKER 碎片满足阈值，应不触发
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 3, y: 3 },
          entities: [makeEntity('frag', 'FRAGMENT', { x: 3, y: 3 }, { fragmentClass: 'BERSERKER' })],
        },
        playerOverrides: {
          classId: 'BERSERKER',
          classFragments: { BERSERKER: CLASS_FRAGMENTS_TO_ADVANCE - 1 },
        },
      });

      const result = pickFragment(state, 'frag');
      expect(result.events.find((e) => e.type === 'CLASS_CAN_ADVANCE')).toBeUndefined();
    });
  });

  describe('applyClassAdvance', () => {
    it(`碎片充足时进阶：classId 变更、碎片消耗 ${CLASS_FRAGMENTS_TO_ADVANCE} 个（多余保留）、emit CLASS_ADVANCED`, () => {
      const state = makeExpeditionState({
        playerOverrides: {
          classFragments: { ARCHER: CLASS_FRAGMENTS_TO_ADVANCE + 1 }, // 阈值+1 个，进阶消耗阈值，剩 1
        },
      });

      const result = applyClassAdvance(state, 'ARCHER');
      expect(result.state.player.classId).toBe('ARCHER');
      expect(result.state.player.classFragments['ARCHER']).toBe(1); // (阈值+1) - 阈值 = 1
      expect(result.events).toEqual([{ type: 'CLASS_ADVANCED', classId: 'ARCHER', hpCost: 0 }]);
    });

    it('进阶 BERSERKER：扣当前 HP 一半（下取整），最少扣 30，不低于 1HP', () => {
      const state = makeExpeditionState({
        playerOverrides: {
          hp: 50,
          maxHp: 200,
          classFragments: { BERSERKER: CLASS_FRAGMENTS_TO_ADVANCE },
        },
      });

      const result = applyClassAdvance(state, 'BERSERKER');
      // hp=50: max(30, floor(50/2))=max(30,25)=30，newHp=max(1, 50-30)=20
      expect(result.state.player.hp).toBe(20);
      expect(result.events).toEqual([{ type: 'CLASS_ADVANCED', classId: 'BERSERKER', hpCost: 30 }]);
    });

    it('BERSERKER 进阶时 HP 只有 1 → 保留 1 不至死（不低于 1 保护）', () => {
      const state = makeExpeditionState({
        playerOverrides: { hp: 1, maxHp: 200, classFragments: { BERSERKER: CLASS_FRAGMENTS_TO_ADVANCE } },
      });
      const result = applyClassAdvance(state, 'BERSERKER');
      expect(result.state.player.hp).toBe(1);
    });

    it('碎片不足时为 no-op', () => {
      const state = makeExpeditionState({
        playerOverrides: { classFragments: { ROGUE: CLASS_FRAGMENTS_TO_ADVANCE - 1 } },
      });
      expect(applyClassAdvance(state, 'ROGUE').events).toEqual([]);
    });

    it('已是该职业时为 no-op', () => {
      const state = makeExpeditionState({
        playerOverrides: { classId: 'ARCHER', classFragments: { ARCHER: CLASS_FRAGMENTS_TO_ADVANCE } },
      });
      expect(applyClassAdvance(state, 'ARCHER').events).toEqual([]);
    });

    it('确定性：相同种子 + 相同碎片状态 → 相同结果（AC-13）', () => {
      const make = () =>
        makeExpeditionState({ playerOverrides: { classFragments: { ROGUE: CLASS_FRAGMENTS_TO_ADVANCE } } });
      expect(applyClassAdvance(make(), 'ROGUE').state.player.classId)
        .toBe(applyClassAdvance(make(), 'ROGUE').state.player.classId);
    });
  });

  describe('getAwakenEligible / applyClassAwaken（design §七 二阶觉醒）', () => {
    it('本职业碎片不足 CLASS_FRAGMENTS_TO_AWAKEN 时不满足', () => {
      const player = makeRunPlayer({
        classId: 'BERSERKER',
        classFragments: { BERSERKER: CLASS_FRAGMENTS_TO_AWAKEN - 1, ARCHER: AWAKEN_SECONDARY_TOTAL },
        maxChapterCleared: AWAKEN_REQUIRED_CHAPTER,
      });
      expect(getAwakenEligible(player)).toBe(false);
    });

    it('另外两职业碎片合计不足 AWAKEN_SECONDARY_TOTAL 时不满足', () => {
      const player = makeRunPlayer({
        classId: 'BERSERKER',
        classFragments: { BERSERKER: CLASS_FRAGMENTS_TO_AWAKEN, ARCHER: AWAKEN_SECONDARY_TOTAL - 1 },
        maxChapterCleared: AWAKEN_REQUIRED_CHAPTER,
      });
      expect(getAwakenEligible(player)).toBe(false);
    });

    it('未击败第三章 Boss（maxChapterCleared 不足）时不满足', () => {
      const player = makeRunPlayer({
        classId: 'BERSERKER',
        classFragments: { BERSERKER: CLASS_FRAGMENTS_TO_AWAKEN, ARCHER: AWAKEN_SECONDARY_TOTAL },
        maxChapterCleared: AWAKEN_REQUIRED_CHAPTER - 1,
      });
      expect(getAwakenEligible(player)).toBe(false);
    });

    it('已觉醒过（awakenForm 已有值）时不再满足', () => {
      const player = makeRunPlayer({
        classId: 'BERSERKER',
        classFragments: { BERSERKER: CLASS_FRAGMENTS_TO_AWAKEN, ARCHER: AWAKEN_SECONDARY_TOTAL },
        maxChapterCleared: AWAKEN_REQUIRED_CHAPTER,
        awakenForm: 'BERSERKER_1',
      });
      expect(getAwakenEligible(player)).toBe(false);
    });

    it('全部条件满足时 getAwakenEligible 为 true', () => {
      const player = makeRunPlayer({
        classId: 'BERSERKER',
        classFragments: { BERSERKER: CLASS_FRAGMENTS_TO_AWAKEN, ARCHER: AWAKEN_SECONDARY_TOTAL },
        maxChapterCleared: AWAKEN_REQUIRED_CHAPTER,
      });
      expect(getAwakenEligible(player)).toBe(true);
    });

    it('applyClassAwaken：副职业 ARCHER > ROGUE 时觉醒为 BERSERKER_1（破阵型）', () => {
      const state = makeExpeditionState({
        playerOverrides: {
          classId: 'BERSERKER',
          classFragments: { BERSERKER: CLASS_FRAGMENTS_TO_AWAKEN, ARCHER: 5, ROGUE: 2 },
          maxChapterCleared: AWAKEN_REQUIRED_CHAPTER,
        },
      });

      const result = applyClassAwaken(state);
      const form = AWAKEN_FORMS.BERSERKER_1;
      expect(result.state.player.awakenForm).toBe('BERSERKER_1');
      expect(result.state.player.classTraits).toEqual([form.statTrait, form.traitId]);
      expect(result.state.player.classFragments['BERSERKER']).toBe(0);
      expect(result.events).toEqual([{ type: 'CLASS_AWAKENED', classId: 'BERSERKER', form: 'BERSERKER_1' }]);
    });

    it('applyClassAwaken：副职业 ROGUE > ARCHER 时觉醒为 BERSERKER_2（嗜杀型）', () => {
      const state = makeExpeditionState({
        playerOverrides: {
          classId: 'BERSERKER',
          classFragments: { BERSERKER: CLASS_FRAGMENTS_TO_AWAKEN, ARCHER: 2, ROGUE: 5 },
          maxChapterCleared: AWAKEN_REQUIRED_CHAPTER,
        },
      });

      const result = applyClassAwaken(state);
      expect(result.state.player.awakenForm).toBe('BERSERKER_2');
      expect(result.events).toEqual([{ type: 'CLASS_AWAKENED', classId: 'BERSERKER', form: 'BERSERKER_2' }]);
    });

    it('条件不满足时 applyClassAwaken 为 no-op', () => {
      const state = makeExpeditionState({
        playerOverrides: {
          classId: 'BERSERKER',
          classFragments: { BERSERKER: CLASS_FRAGMENTS_TO_AWAKEN - 1, ARCHER: AWAKEN_SECONDARY_TOTAL },
          maxChapterCleared: AWAKEN_REQUIRED_CHAPTER,
        },
      });
      expect(applyClassAwaken(state).events).toEqual([]);
    });

    it('pickFragment：满足觉醒条件时拾取碎片应 emit CLASS_CAN_AWAKEN', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 3, y: 3 },
          entities: [makeEntity('frag', 'FRAGMENT', { x: 3, y: 3 }, { fragmentClass: 'BERSERKER' })],
        },
        playerOverrides: {
          classId: 'BERSERKER',
          classFragments: { BERSERKER: CLASS_FRAGMENTS_TO_AWAKEN - 1, ARCHER: AWAKEN_SECONDARY_TOTAL },
          maxChapterCleared: AWAKEN_REQUIRED_CHAPTER,
        },
      });

      const result = pickFragment(state, 'frag');
      expect(result.events.find((e) => e.type === 'CLASS_CAN_AWAKEN')).toEqual({
        type: 'CLASS_CAN_AWAKEN',
        classId: 'BERSERKER',
      });
    });
  });
});
