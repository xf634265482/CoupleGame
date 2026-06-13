import {
  interactPortal,
  isFloorCleared,
  openExit,
  pickKey,
  spawnPortal,
} from '../../assets/scripts/pve/core/FloorRules';
import { makeEntity, makeExpeditionState, makeMonster } from './helpers';

describe('FloorRules — 楼层通关（AC-8, AC-9）', () => {
  describe('pickKey', () => {
    it('玩家站在钥匙格时拾取：标记消耗、设置 hasKey、产生 PICK_KEY 事件，不耗 AP', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 2, y: 2 },
          ap: 10,
          hasKey: false,
          entities: [makeEntity('key1', 'KEY', { x: 2, y: 2 })],
        },
      });

      const result = pickKey(state, 'key1');
      expect(result.state.floorState.hasKey).toBe(true);
      expect(result.state.floorState.entities.find((e) => e.id === 'key1')?.consumed).toBe(true);
      expect(result.state.floorState.ap).toBe(10);
      expect(result.events).toEqual([{ type: 'PICK_KEY', entityId: 'key1' }]);
    });

    it('玩家不在钥匙格 / 钥匙已拾取 时为 no-op', () => {
      const notHere = makeExpeditionState({
        floorOverrides: { player: { x: 0, y: 0 }, entities: [makeEntity('key1', 'KEY', { x: 2, y: 2 })] },
      });
      expect(pickKey(notHere, 'key1').events).toEqual([]);

      const already = makeExpeditionState({
        floorOverrides: {
          player: { x: 2, y: 2 },
          entities: [makeEntity('key1', 'KEY', { x: 2, y: 2 }, { consumed: true })],
        },
      });
      expect(pickKey(already, 'key1').events).toEqual([]);
    });
  });

  describe('openExit', () => {
    it('已拾取钥匙、AP 充足、站在出口门格时可开启：扣 AP、楼层置 CLEARED、产生 FLOOR_CLEARED 事件', () => {
      const state = makeExpeditionState({
        floor: 3,
        floorOverrides: {
          floor: 3,
          player: { x: 5, y: 5 },
          ap: 10,
          hasKey: true,
          status: 'EXPLORING',
          entities: [makeEntity('exit1', 'EXIT', { x: 5, y: 5 })],
        },
      });

      const result = openExit(state, 'exit1');
      expect(result.state.floorState.ap).toBe(9);
      expect(result.state.floorState.status).toBe('CLEARED');
      expect(result.state.floorState.entities.find((e) => e.id === 'exit1')?.consumed).toBe(true);
      expect(result.events).toEqual([{ type: 'FLOOR_CLEARED', floor: 3 }]);
      expect(isFloorCleared(result.state.floorState)).toBe(true);
    });

    it('未拾取钥匙时拒绝开启出口门（AC-8 核心约束）', () => {
      const state = makeExpeditionState({
        floorOverrides: {
          player: { x: 5, y: 5 },
          ap: 10,
          hasKey: false,
          entities: [makeEntity('exit1', 'EXIT', { x: 5, y: 5 })],
        },
      });

      const result = openExit(state, 'exit1');
      expect(result.state).toBe(state);
      expect(result.events).toEqual([]);
      expect(result.state.floorState.status).toBe('EXPLORING');
    });

    it('AP 不足 / 不在出口门格 / 出口门已开启 时为 no-op', () => {
      const noAp = makeExpeditionState({
        floorOverrides: {
          player: { x: 5, y: 5 },
          ap: 0,
          hasKey: true,
          entities: [makeEntity('exit1', 'EXIT', { x: 5, y: 5 })],
        },
      });
      expect(openExit(noAp, 'exit1').events).toEqual([]);

      const notHere = makeExpeditionState({
        floorOverrides: {
          player: { x: 0, y: 0 },
          ap: 10,
          hasKey: true,
          entities: [makeEntity('exit1', 'EXIT', { x: 5, y: 5 })],
        },
      });
      expect(openExit(notHere, 'exit1').events).toEqual([]);

      const already = makeExpeditionState({
        floorOverrides: {
          player: { x: 5, y: 5 },
          ap: 10,
          hasKey: true,
          entities: [makeEntity('exit1', 'EXIT', { x: 5, y: 5 }, { consumed: true })],
        },
      });
      expect(openExit(already, 'exit1').events).toEqual([]);
    });
  });

  describe('spawnPortal（修复后只浮现，不立即通关）', () => {
    it('Boss 已死亡且已拾取钥匙时在 Boss 位置生成传送门 → emit PORTAL_SPAWNED；楼层保持 EXPLORING', () => {
      const state = makeExpeditionState({
        floor: 5,
        floorOverrides: {
          floor: 5,
          hasKey: true,
          status: 'EXPLORING',
          monsters: [makeMonster('boss1', { x: 7, y: 7 }, { type: 'BOSS', aiState: 'DEAD', bossId: 'GOBLIN_CHIEF' })],
          entities: [],
        },
      });

      const result = spawnPortal(state, 'boss1');
      const portal = result.state.floorState.entities.find((e) => e.type === 'PORTAL');
      expect(portal).toBeDefined();
      expect(portal?.pos).toEqual({ x: 7, y: 7 });
      // 关键：楼层保持 EXPLORING，让玩家继续探索
      expect(result.state.floorState.status).toBe('EXPLORING');
      expect(result.events).toEqual([
        { type: 'PORTAL_SPAWNED', entityId: portal!.id, pos: { x: 7, y: 7 } },
      ]);
    });

    it('Boss 仍存活 / 未拾取钥匙 / 传送门已存在 时为 no-op', () => {
      const aliveBoss = makeExpeditionState({
        floorOverrides: {
          hasKey: true,
          monsters: [makeMonster('boss1', { x: 7, y: 7 }, { type: 'BOSS', aiState: 'CHASE' })],
        },
      });
      expect(spawnPortal(aliveBoss, 'boss1').events).toEqual([]);

      const noKey = makeExpeditionState({
        floorOverrides: {
          hasKey: false,
          monsters: [makeMonster('boss1', { x: 7, y: 7 }, { type: 'BOSS', aiState: 'DEAD' })],
        },
      });
      expect(spawnPortal(noKey, 'boss1').events).toEqual([]);

      const already = makeExpeditionState({
        floorOverrides: {
          hasKey: true,
          monsters: [makeMonster('boss1', { x: 7, y: 7 }, { type: 'BOSS', aiState: 'DEAD' })],
          entities: [makeEntity('portal_x', 'PORTAL', { x: 7, y: 7 })],
        },
      });
      expect(spawnPortal(already, 'boss1').events).toEqual([]);
    });
  });

  describe('interactPortal（Boss 层踏入传送门才通关）', () => {
    it('玩家站在传送门 + AP ≥ 1 + 未消耗：扣 AP、置 CLEARED、emit FLOOR_CLEARED', () => {
      const state = makeExpeditionState({
        floor: 5,
        floorOverrides: {
          floor: 5,
          player: { x: 7, y: 7 },
          ap: 5,
          hasKey: true,
          status: 'EXPLORING',
          entities: [makeEntity('portal_5', 'PORTAL', { x: 7, y: 7 })],
        },
      });

      const result = interactPortal(state, 'portal_5');
      expect(result.state.floorState.status).toBe('CLEARED');
      expect(result.state.floorState.ap).toBe(4);
      expect(result.state.floorState.entities.find((e) => e.id === 'portal_5')?.consumed).toBe(true);
      expect(result.events).toEqual([{ type: 'FLOOR_CLEARED', floor: 5 }]);
    });

    it('不在传送门格 / AP 不足 / 已消耗 时为 no-op', () => {
      const notHere = makeExpeditionState({
        floorOverrides: {
          player: { x: 0, y: 0 },
          ap: 5,
          entities: [makeEntity('p', 'PORTAL', { x: 7, y: 7 })],
        },
      });
      expect(interactPortal(notHere, 'p').events).toEqual([]);

      const noAp = makeExpeditionState({
        floorOverrides: {
          player: { x: 7, y: 7 },
          ap: 0,
          entities: [makeEntity('p', 'PORTAL', { x: 7, y: 7 })],
        },
      });
      expect(interactPortal(noAp, 'p').events).toEqual([]);

      const consumed = makeExpeditionState({
        floorOverrides: {
          player: { x: 7, y: 7 },
          ap: 5,
          entities: [makeEntity('p', 'PORTAL', { x: 7, y: 7 }, { consumed: true })],
        },
      });
      expect(interactPortal(consumed, 'p').events).toEqual([]);
    });
  });

  describe('isFloorCleared', () => {
    it('依据 floorState.status 判定通关', () => {
      const state = makeExpeditionState({ floorOverrides: { status: 'EXPLORING' } });
      expect(isFloorCleared(state.floorState)).toBe(false);

      const cleared = makeExpeditionState({ floorOverrides: { status: 'CLEARED' } });
      expect(isFloorCleared(cleared.floorState)).toBe(true);
    });
  });
});
