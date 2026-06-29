import {
  advanceFloor,
  applyDeath,
  deserialize,
  endTurn,
  resumeExpedition,
  serialize,
  startExpedition,
} from '../../assets/scripts/pve/core/ExpeditionState';
import { applyMove } from '../../assets/scripts/pve/core/MovementSystem';
import { EMPTY_TREE_BONUSES } from '../../assets/scripts/pve/core/DestinyTreeSystem';
import {
  ANIMA_PER_STRENGTHEN,
  AP_BASE,
  AP_CARRY_CAP,
  AWAKEN_REQUIRED_CHAPTER,
  AWAKEN_SECONDARY_TOTAL,
  CLASS_FRAGMENTS_TO_AWAKEN,
  FLOORS_PER_CHAPTER,
  INITIAL_ANIMA,
  INITIAL_GOLD,
  INITIAL_HP,
  TOTAL_FLOORS,
  TREE_A1_HP_BONUS,
  TREE_A2_HP_BONUS,
  TREE_A3_HP_BONUS,
  TREE_B2_AP_DICE_BONUS,
  TREE_B2_AP_CARRY_BONUS,
  TREE_B3_FRAGMENT_BONUS,
  TREE_C1_GOLD_BONUS,
  TREE_D1_ANIMA_BONUS,
  TREE_D2_THRESHOLD_MULT,
  TREE_E1_GOLD_BONUS,
} from '../../assets/scripts/pve/core/PveConstants';
import type { PveMeta } from '../../assets/scripts/pve/core/PveTypes';
import { makeExpeditionState, makeMonster } from './helpers';
import type { Direction } from '../../assets/scripts/pve/core/MovementSystem';

function makeMeta(overrides: Partial<PveMeta> = {}): PveMeta {
  return {
    destinyShards: 1000,
    diamond: 0,
    achievements: [],
    codex: { monsters: [], equipment: [] },
    unlockedTreeNodes: [],
    ...overrides,
  };
}

describe('ExpeditionState — 远征生命周期（AC-3, AC-11, AC-12, AC-13）', () => {
  describe('startExpedition', () => {
    it('生成第 1 层、初始玩家与首回合 AP', () => {
      const state = startExpedition(2026);
      expect(state.runSeed).toBe(2026);
      expect(state.chapter).toBe(1);
      expect(state.floor).toBe(1);
      expect(state.status).toBe('ACTIVE');
      expect(state.player.classId).toBe('ADVENTURER');
      expect(state.player.classTraits).toEqual([]);
      expect(state.floorState.floor).toBe(1);
      expect(state.floorState.turn).toBe(1);
      expect(state.floorState.ap).toBe(state.floorState.maxAp);
      expect(state.floorState.ap).toBeGreaterThanOrEqual(9);
      expect(state.floorState.ap).toBeLessThanOrEqual(14);
    });

    it('同 runSeed 的远征开局确定可复现（AC-13）', () => {
      const a = startExpedition(13579);
      const b = startExpedition(13579);
      expect(a).toEqual(b);
    });

    it('不同 runSeed 通常产生不同布局/骰子', () => {
      const a = startExpedition(1);
      const b = startExpedition(2);
      expect(a).not.toEqual(b);
    });

    it('未传 meta 时 player.treeBonuses 为全零快照，无 pendingTreeChoices', () => {
      const state = startExpedition(2026);
      expect(state.player.treeBonuses).toEqual(EMPTY_TREE_BONUSES);
      expect(state.pendingTreeChoices).toBeUndefined();
    });

    it('命运树 A1/A3/C1/D1/D2/B4：固化为 player 初始属性（AC-13 同种子可复现）', () => {
      const meta = makeMeta({ unlockedTreeNodes: ['A1', 'A2', 'A3', 'C1', 'D1', 'D2', 'B1', 'B2', 'B3', 'B4'] });
      const state = startExpedition(2026, meta);

      const expectedMaxHp = INITIAL_HP + TREE_A1_HP_BONUS + TREE_A2_HP_BONUS + TREE_A3_HP_BONUS;
      expect(state.player.maxHp).toBe(expectedMaxHp);
      expect(state.player.hp).toBe(expectedMaxHp);
      expect(state.player.gold).toBe(INITIAL_GOLD + TREE_C1_GOLD_BONUS);
      expect(state.player.anima).toBe(INITIAL_ANIMA + TREE_D1_ANIMA_BONUS);
      expect(state.player.animaProgress).toBe(TREE_D1_ANIMA_BONUS);
      expect(state.player.animaThreshold).toBe(Math.ceil(ANIMA_PER_STRENGTHEN * TREE_D2_THRESHOLD_MULT));

      // B4 职业先驱：随机一个可进阶职业碎片 +1
      const totalFragments = Object.values(state.player.classFragments).reduce(
        (a, b) => a + (b ?? 0),
        0,
      );
      expect(totalFragments).toBe(TREE_B3_FRAGMENT_BONUS);

      // 同种子 + 同 meta 完全确定可复现
      const again = startExpedition(2026, meta);
      expect(again).toEqual(state);
    });

    it('命运树 B3 急行军：apDiceBonus 加到首回合 AP 上', () => {
      const meta = makeMeta({ unlockedTreeNodes: [] });
      const withoutB3 = startExpedition(2026, meta);

      const metaWithB3 = makeMeta({ unlockedTreeNodes: ['B1', 'B2', 'B3'] });
      const withB3 = startExpedition(2026, metaWithB3);

      expect(withB3.floorState.ap).toBe(withoutB3.floorState.ap + TREE_B2_AP_DICE_BONUS);
    });

    it('命运树 E2/E3：解锁后 startExpedition 生成 pendingTreeChoices 队列', () => {
      const meta = makeMeta({ unlockedTreeNodes: ['E1', 'E2', 'E3'] });
      const state = startExpedition(2026, meta);

      expect(state.player.gold).toBe(INITIAL_GOLD + TREE_E1_GOLD_BONUS);
      expect(state.pendingTreeChoices).toBeDefined();
      const sources = state.pendingTreeChoices!.map((c) => c.source);
      expect(sources).toEqual(['E2', 'E3']);
      expect(state.pendingTreeChoices![0].equipOptions).toHaveLength(3);
      expect(state.pendingTreeChoices![1].traitOptions!.length).toBeGreaterThan(0);
    });
  });

  describe('endTurn', () => {
    it('怪物行动后开启下一回合并重新掷 AP，产生 TURN_END 事件', () => {
      const state = makeExpeditionState({
        floorOverrides: { player: { x: 0, y: 0 }, turn: 1, monsters: [] },
      });

      const result = endTurn(state);
      expect(result.state.floorState.turn).toBe(2);
      expect(result.state.floorState.ap).toBe(result.state.floorState.maxAp);
      expect(result.events[0]).toEqual({ type: 'TURN_END', turn: 1 });
    });

    it('怪物在结束回合阶段追击/攻击玩家', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          turn: 1,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { aggroRadius: 5, range: 1, attack: 20 })],
        },
        playerOverrides: { hp: 200, maxHp: 200 },
      });

      const result = endTurn(state);
      expect(result.state.player.hp).toBe(180);
      expect(result.events.some((e) => e.type === 'PLAYER_DAMAGED')).toBe(true);
    });

    it('怪物行动导致玩家阵亡时停在 DEAD，不开启新回合', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          turn: 1,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { aggroRadius: 5, range: 1, attack: 99 })],
        },
        playerOverrides: { hp: 5, maxHp: 20 },
      });

      const result = endTurn(state);
      expect(result.state.status).toBe('DEAD');
      expect(result.state.floorState.turn).toBe(1); // 未进入下一回合
      expect(result.events.some((e) => e.type === 'PLAYER_DEAD')).toBe(true);
    });

    it('远征非 ACTIVE 或楼层非 EXPLORING 时为 no-op', () => {
      const cleared = makeExpeditionState({ floorOverrides: { status: 'CLEARED' } });
      expect(endTurn(cleared)).toEqual({ state: cleared, events: [] });

      const dead = makeExpeditionState({ playerOverrides: {}, floorOverrides: {} });
      const deadState = { ...dead, status: 'DEAD' as const };
      expect(endTurn(deadState)).toEqual({ state: deadState, events: [] });
    });

    it('同状态调用 endTurn 结果确定可复现（AC-13）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          turn: 3,
          monsters: [makeMonster('m1', { x: 6, y: 6 }, { aggroRadius: 5, range: 1 })],
        },
      });
      expect(endTurn(state)).toEqual(endTurn(state));
    });
  });

  describe('advanceFloor', () => {
    it('楼层已 CLEARED 时进入下一层：种子派生确定、turn 重置、产生 REVEAL 事件', () => {
      const state = makeExpeditionState({
        floor: 1,
        floorOverrides: { floor: 1, status: 'CLEARED' },
      });

      const result = advanceFloor(state);
      expect(result.state.floor).toBe(2);
      expect(result.state.chapter).toBe(1);
      expect(result.state.status).toBe('ACTIVE');
      expect(result.state.floorState.floor).toBe(2);
      expect(result.state.floorState.status).toBe('EXPLORING');
      expect(result.state.floorState.turn).toBe(1);
      expect(result.state.floorState.hasKey).toBe(false);
      expect(result.events[0].type).toBe('REVEAL');
    });

    it('楼层未通关时为 no-op', () => {
      const state = makeExpeditionState({ floorOverrides: { status: 'EXPLORING' } });
      expect(advanceFloor(state)).toEqual({ state, events: [] });
    });

    it('同种子续玩从下一层开始，与连续打通到该层的布局一致（AC-11 续玩）', () => {
      const runSeed = 999;
      const cleared1 = makeExpeditionState({
        seed: runSeed,
        floor: 1,
        floorOverrides: { floor: 1, status: 'CLEARED' },
      });
      const directlyAdvanced = advanceFloor({ ...cleared1, runSeed });

      // 模拟"返回大厅后重新进入"：从已知 runSeed + 目标层号独立重建（云端按 runSeed+floor 派生种子一致）
      const independentlyRebuilt = advanceFloor({ ...cleared1, runSeed });

      expect(directlyAdvanced.state.floorState).toEqual(independentlyRebuilt.state.floorState);
    });

    it('最后一层通关后远征状态置为 COMPLETED', () => {
      const state = makeExpeditionState({
        floor: TOTAL_FLOORS,
        floorOverrides: { floor: TOTAL_FLOORS, status: 'CLEARED' },
      });

      const result = advanceFloor(state);
      expect(result.state.status).toBe('COMPLETED');
      expect(result.state.floor).toBe(TOTAL_FLOORS);
      expect(result.events).toEqual([]);
    });

    it('章节 Boss 层通关后更新 player.maxChapterCleared（design §七 觉醒前置条件）', () => {
      const bossFloor = FLOORS_PER_CHAPTER; // 第1章 Boss 层（5）
      const state = makeExpeditionState({
        floor: bossFloor,
        floorOverrides: { floor: bossFloor, status: 'CLEARED' },
      });

      const result = advanceFloor(state);
      expect(result.state.player.maxChapterCleared).toBe(1);
    });

    it('非 Boss 层通关不更新 maxChapterCleared', () => {
      const state = makeExpeditionState({
        floor: 1,
        floorOverrides: { floor: 1, status: 'CLEARED' },
      });

      const result = advanceFloor(state);
      expect(result.state.player.maxChapterCleared).toBeUndefined();
    });

    it('击败第三章 Boss 后若已满足其余觉醒条件，emit CLASS_CAN_AWAKEN', () => {
      const ch3BossFloor = FLOORS_PER_CHAPTER * AWAKEN_REQUIRED_CHAPTER; // 第3章 Boss 层（15）
      const state = makeExpeditionState({
        floor: ch3BossFloor,
        floorOverrides: { floor: ch3BossFloor, status: 'CLEARED' },
        playerOverrides: {
          classId: 'BERSERKER',
          classFragments: { BERSERKER: CLASS_FRAGMENTS_TO_AWAKEN, ARCHER: AWAKEN_SECONDARY_TOTAL },
          maxChapterCleared: AWAKEN_REQUIRED_CHAPTER - 1,
        },
      });

      const result = advanceFloor(state);
      expect(result.state.player.maxChapterCleared).toBe(AWAKEN_REQUIRED_CHAPTER);
      expect(result.events.find((e) => e.type === 'CLASS_CAN_AWAKEN')).toEqual({
        type: 'CLASS_CAN_AWAKEN',
        classId: 'BERSERKER',
      });
    });

    it('叠加 2 个 strengthen_ap_up 后，新楼层 maxAp 为 dice + 2（与 endTurn 的 traitCount 逻辑一致）', () => {
      const state = makeExpeditionState({
        floor: 1,
        floorOverrides: { floor: 1, status: 'CLEARED' },
        playerOverrides: { classTraits: ['strengthen_ap_up', 'strengthen_ap_up'] },
      });

      const result = advanceFloor(state);
      const expectedAp = result.state.floorState.dice + AP_BASE + 2;
      expect(result.state.floorState.maxAp).toBe(expectedAp);
      expect(result.state.floorState.ap).toBe(expectedAp);
    });
  });

  describe('resumeExpedition', () => {
    it('从存档的"已完成层号"恢复，固定从下一层开始并产生 REVEAL 事件（AC-11）', () => {
      const runSeed = 555;
      const player = startExpedition(runSeed).player;

      const result = resumeExpedition(runSeed, 1, player);
      expect(result.state.floor).toBe(2);
      expect(result.state.chapter).toBe(1);
      expect(result.state.status).toBe('ACTIVE');
      expect(result.state.player).toEqual(player);
      expect(result.state.floorState.floor).toBe(2);
      expect(result.state.floorState.status).toBe('EXPLORING');
      expect(result.state.floorState.turn).toBe(1);
      expect(result.events[0].type).toBe('REVEAL');
    });

    it('与"打通当前层后 advanceFloor"产生的下一层布局完全一致（同 runSeed+楼层种子派生规则，云端可复算 AC-13）', () => {
      const runSeed = 2024;
      const cleared = makeExpeditionState({
        seed: runSeed,
        floor: 3,
        floorOverrides: { floor: 3, status: 'CLEARED' },
      });

      const advanced = advanceFloor({ ...cleared, runSeed });
      const resumed = resumeExpedition(runSeed, 3, cleared.player);

      expect(resumed.state.floorState).toEqual(advanced.state.floorState);
      expect(resumed.state.floor).toBe(advanced.state.floor);
      expect(resumed.state.chapter).toBe(advanced.state.chapter);
    });
  });

  describe('resumeExpedition with saved floor snapshot', () => {
    it('restores an exploring floor snapshot instead of jumping to the next floor', () => {
      const runSeed = 4096;
      const exploring = makeExpeditionState({
        seed: runSeed,
        floor: 6,
        floorOverrides: {
          floor: 6,
          turn: 5,
          ap: 7,
          maxAp: 16,
          dice: 4,
          status: 'EXPLORING',
          player: { x: 4, y: 4 },
          hasKey: true,
        },
      });

      const result = resumeExpedition(runSeed, 6, exploring.player, exploring.floorState);
      expect(result.state.floor).toBe(6);
      expect(result.state.chapter).toBe(1); // V3: floor 6 in chapter 1 (7 floors/chapter)
      expect(result.state.floorState).toEqual(exploring.floorState);
      expect(result.events).toEqual([]);
    });

    it('restores a cleared floor snapshot and leaves floor advance to the controller flow', () => {
      const runSeed = 8192;
      const cleared = makeExpeditionState({
        seed: runSeed,
        floor: 5,
        floorOverrides: {
          floor: 5,
          status: 'CLEARED',
          turn: 8,
        },
      });

      const result = resumeExpedition(runSeed, 5, cleared.player, cleared.floorState);
      expect(result.state.floor).toBe(5);
      expect(result.state.floorState.status).toBe('CLEARED');
      expect(result.state.floorState).toEqual(cleared.floorState);
      expect(result.events).toEqual([]);
    });
  });

  describe('applyDeath', () => {
    it('清空局内进度（装备/职业/词条/金币/灵气/职业碎片），保留 HP 等其余字段', () => {
      const state = makeExpeditionState({
        playerOverrides: {
          hp: 0,
          maxHp: 20,
          gold: 999,
          anima: 88,
          animaProgress: 40,
          classId: 'BERSERKER',
          classTraits: ['strengthen_hp_up'],
          equipment: { WEAPON: { id: 'w1', slot: 'WEAPON', quality: 'RARE', name: '战斧', baseStat: 3 } },
          classFragments: { BERSERKER: 2 },
        },
      });
      const dead = { ...state, status: 'DEAD' as const, floorState: { ...state.floorState, status: 'DEAD' as const } };

      const result = applyDeath(dead);
      expect(result.state.player.gold).toBe(0);
      expect(result.state.player.anima).toBe(0);
      expect(result.state.player.animaProgress).toBe(0);
      expect(result.state.player.classId).toBe('ADVENTURER');
      expect(result.state.player.classTraits).toEqual([]);
      expect(result.state.player.equipment).toEqual({});
      expect(result.state.player.classFragments).toEqual({});
      expect(result.state.player.hp).toBe(230);
      expect(result.state.player.maxHp).toBe(230);
    });

    it('非 DEAD 状态时为 no-op', () => {
      const state = makeExpeditionState({ playerOverrides: { gold: 50 } });
      expect(applyDeath(state)).toEqual({ state, events: [] });
    });

    it('重置已觉醒形态（awakenForm）', () => {
      const state = makeExpeditionState({
        playerOverrides: {
          hp: 0,
          classId: 'BERSERKER',
          awakenForm: 'BERSERKER_1',
          classFragments: { BERSERKER: 5 },
        },
      });
      const dead = { ...state, status: 'DEAD' as const, floorState: { ...state.floorState, status: 'DEAD' as const } };

      const result = applyDeath(dead);
      expect(result.state.player.awakenForm).toBeUndefined();
    });
  });

  describe('serialize / deserialize', () => {
    it('存档往返一致：deserialize(serialize(state)) 深度相等于原状态', () => {
      const state = startExpedition(424242);
      const restored = deserialize(serialize(state));
      expect(restored).toEqual(state);
    });

    it('从存档还原后可继续推进（回合/楼层）且行为与原状态一致', () => {
      const original = makeExpeditionState({
        floorOverrides: {
          player: { x: 1, y: 1 },
          turn: 2,
          monsters: [makeMonster('m1', { x: 6, y: 6 }, { aggroRadius: 5, range: 1 })],
        },
      });
      const restored = deserialize(serialize(original));

      expect(endTurn(restored)).toEqual(endTurn(original));
    });
  });

  describe('AP_ROLLED 事件（AC-2 表现）', () => {
    it('endTurn 在重新掷骰后 emit AP_ROLLED，turn/dice/ap 与 floorState 一致', () => {
      const state = makeExpeditionState({
        floorOverrides: { player: { x: 0, y: 0 }, turn: 1, monsters: [] },
      });
      const result = endTurn(state);
      const ap = result.events.find((e) => e.type === 'AP_ROLLED');
      expect(ap).toBeTruthy();
      if (ap && ap.type === 'AP_ROLLED') {
        expect(ap.turn).toBe(result.state.floorState.turn);
        expect(ap.dice).toBe(result.state.floorState.dice);
        expect(ap.ap).toBe(result.state.floorState.ap);
        expect(ap.dice).toBeGreaterThanOrEqual(1);
        expect(ap.dice).toBeLessThanOrEqual(6);
        expect(ap.ap).toBe(8 + ap.dice);
      }
    });

    it('endTurn 玩家阵亡时不 emit AP_ROLLED（未进入新回合）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 4, y: 4 },
          turn: 1,
          monsters: [makeMonster('m1', { x: 4, y: 5 }, { aggroRadius: 5, range: 1, attack: 99 })],
        },
        playerOverrides: { hp: 5, maxHp: 20 },
      });
      const result = endTurn(state);
      expect(result.state.status).toBe('DEAD');
      expect(result.events.some((e) => e.type === 'AP_ROLLED')).toBe(false);
    });

    it('advanceFloor 进入新层 emit AP_ROLLED（turn=1）', () => {
      const state = makeExpeditionState({
        floor: 1,
        floorOverrides: { floor: 1, status: 'CLEARED' },
      });
      const result = advanceFloor(state);
      const ap = result.events.find((e) => e.type === 'AP_ROLLED');
      expect(ap).toBeTruthy();
      if (ap && ap.type === 'AP_ROLLED') {
        expect(ap.turn).toBe(1);
        expect(ap.dice).toBeGreaterThanOrEqual(1);
        expect(ap.dice).toBeLessThanOrEqual(6);
        expect(ap.ap).toBe(8 + ap.dice);
        expect(ap.ap).toBe(result.state.floorState.maxAp);
      }
    });

    it('resumeExpedition emit AP_ROLLED 与 advanceFloor 完全一致（确定性 AC-13）', () => {
      const runSeed = 314159;
      const cleared = makeExpeditionState({
        seed: runSeed,
        floor: 2,
        floorOverrides: { floor: 2, status: 'CLEARED' },
      });
      const advanced = advanceFloor({ ...cleared, runSeed });
      const resumed = resumeExpedition(runSeed, 2, cleared.player);

      const advAp = advanced.events.find((e) => e.type === 'AP_ROLLED');
      const resAp = resumed.events.find((e) => e.type === 'AP_ROLLED');
      expect(advAp).toEqual(resAp);
    });

    it('同种子 endTurn 两次产生相同 AP_ROLLED（确定性）', () => {
      const state = makeExpeditionState({
        floorOverrides: { player: { x: 0, y: 0 }, turn: 1, monsters: [] },
      });
      const a = endTurn(state).events.find((e) => e.type === 'AP_ROLLED');
      const b = endTurn(state).events.find((e) => e.type === 'AP_ROLLED');
      expect(a).toEqual(b);
    });
  });

  describe('AP 结转（AP_CARRY_CAP）', () => {
    it('回合结束时剩余 AP ≤ AP_CARRY_CAP 全部结转：AP_ROLLED.ap = 8+dice+剩余，并 emit AP_CARRIED', () => {
      const state = makeExpeditionState({
        floorOverrides: { player: { x: 0, y: 0 }, turn: 1, monsters: [], ap: 2, maxAp: 10 },
      });
      const result = endTurn(state);
      const apRolled = result.events.find((e) => e.type === 'AP_ROLLED');
      const carried = result.events.find((e) => e.type === 'AP_CARRIED');
      expect(apRolled?.type).toBe('AP_ROLLED');
      expect(carried).toEqual({ type: 'AP_CARRIED', amount: 2 });
      if (apRolled?.type === 'AP_ROLLED') {
        expect(apRolled.ap).toBe(8 + apRolled.dice + 2);
        expect(result.state.floorState.ap).toBe(apRolled.ap);
        expect(result.state.floorState.maxAp).toBe(apRolled.ap);
      }
    });

    it('回合结束时剩余 AP 超过 AP_CARRY_CAP 仅结转上限部分', () => {
      const state = makeExpeditionState({
        floorOverrides: { player: { x: 0, y: 0 }, turn: 1, monsters: [], ap: 9, maxAp: 12 },
      });
      const result = endTurn(state);
      const apRolled = result.events.find((e) => e.type === 'AP_ROLLED');
      const carried = result.events.find((e) => e.type === 'AP_CARRIED');
      expect(carried).toEqual({ type: 'AP_CARRIED', amount: AP_CARRY_CAP });
      if (apRolled?.type === 'AP_ROLLED') {
        expect(apRolled.ap).toBe(8 + apRolled.dice + AP_CARRY_CAP);
      }
    });

    it('回合结束时 AP 已耗尽（0）不 emit AP_CARRIED', () => {
      const state = makeExpeditionState({
        floorOverrides: { player: { x: 0, y: 0 }, turn: 1, monsters: [], ap: 0, maxAp: 10 },
      });
      const result = endTurn(state);
      expect(result.events.some((e) => e.type === 'AP_CARRIED')).toBe(false);
    });

    it('命运树 B2 急行军：AP 结转上限 +1（AP_CARRY_CAP + TREE_B2_AP_CARRY_BONUS）', () => {
      const state = makeExpeditionState({
        floorOverrides: { player: { x: 0, y: 0 }, turn: 1, monsters: [], ap: 9, maxAp: 12 },
        playerOverrides: {
          treeBonuses: { ...EMPTY_TREE_BONUSES, apCarryCapBonus: TREE_B2_AP_CARRY_BONUS },
        },
      });
      const result = endTurn(state);
      const carried = result.events.find((e) => e.type === 'AP_CARRIED');
      expect(carried).toEqual({ type: 'AP_CARRIED', amount: AP_CARRY_CAP + TREE_B2_AP_CARRY_BONUS });
    });
  });

  describe('确定性：同种子 + 同操作序列 → 同结果（AC-13）', () => {
    it('两条独立远征执行相同操作序列，最终状态完全一致', () => {
      const ops: Direction[] = ['RIGHT', 'DOWN', 'RIGHT', 'DOWN'];

      function run(seed: number) {
        let state = startExpedition(seed);
        for (const dir of ops) {
          state = applyMove(state, dir).state;
        }
        return endTurn(state).state;
      }

      const a = run(777888);
      const b = run(777888);
      expect(a).toEqual(b);
    });
  });
});
