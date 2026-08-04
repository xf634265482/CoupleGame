import {
  activateGunpowderBarrel,
  detonateBlastTarget,
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
      expect(result.state.floorState.playerExposedTurns).toBe(2);
      expect(result.events).toEqual([
        { type: 'PICK_KEY', entityId: 'key1' },
        { type: 'PLAYER_EXPOSED', source: 'INTERACTION', turns: 2 },
      ]);
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

    it('永久层持钥踩出口不耗 AP，AP=0 也可开门', () => {
      const state = makeExpeditionState({
        persistentFloorMode: true,
        floorOverrides: {
          player: { x: 5, y: 5 },
          ap: 0,
          hasKey: true,
          entities: [makeEntity('exit1', 'EXIT', { x: 5, y: 5 })],
        },
      });
      const result = openExit(state, 'exit1');
      expect(result.events).toEqual([{ type: 'FLOOR_CLEARED', floor: 1 }]);
      expect(result.state.floorState.ap).toBe(0);
      expect(result.state.floorState.entities.find((e) => e.id === 'exit1')?.consumed).toBe(true);
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
    it('玩家站在传送门 + 未消耗：不扣 AP、置 CLEARED、emit FLOOR_CLEARED', () => {
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
      expect(result.state.floorState.ap).toBe(5);
      expect(result.state.floorState.entities.find((e) => e.id === 'portal_5')?.consumed).toBe(true);
      expect(result.events).toEqual([{ type: 'FLOOR_CLEARED', floor: 5 }]);
    });

    it('AP 为 0 时仍可通关（避免开出口后首次互动被自动结束回合吞掉）', () => {
      const noAp = makeExpeditionState({
        floorOverrides: {
          player: { x: 7, y: 7 },
          ap: 0,
          entities: [makeEntity('p', 'PORTAL', { x: 7, y: 7 })],
        },
      });
      const result = interactPortal(noAp, 'p');
      expect(result.state.floorState.status).toBe('CLEARED');
      expect(result.state.floorState.ap).toBe(0);
      expect(result.events).toEqual([{ type: 'FLOOR_CLEARED', floor: noAp.floorState.floor }]);
    });

    it('不在传送门格 / 已消耗 时为 no-op', () => {
      const notHere = makeExpeditionState({
        floorOverrides: {
          player: { x: 0, y: 0 },
          ap: 5,
          entities: [makeEntity('p', 'PORTAL', { x: 7, y: 7 })],
        },
      });
      expect(interactPortal(notHere, 'p').events).toEqual([]);

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

  describe('floor 5 gunpowder breakthrough', () => {
    it('activating the barrel consumes it and permanently frenzies every living monster', () => {
      const state = makeExpeditionState({
        floor: 5,
        floorOverrides: {
          floor: 5,
          player: { x: 4, y: 6 },
          ap: 8,
          entities: [makeEntity('F5_BARREL', 'GUNPOWDER_BARREL', { x: 4, y: 6 })],
          monsters: [
            makeMonster('m1', { x: 4, y: 3 }, { attack: 8, aggroRadius: 4 }),
            makeMonster('dead', { x: 5, y: 3 }, { attack: 8, hp: 0, aiState: 'DEAD' }),
          ],
        },
      });

      const result = activateGunpowderBarrel(state, 'F5_BARREL');
      expect(result.state.floorState.ap).toBe(7);
      expect(result.state.floorState.entities.find((entity) => entity.id === 'F5_BARREL')?.consumed).toBe(true);
      expect(result.state.floorState.monsters.find((monster) => monster.id === 'm1')).toMatchObject({
        attack: 16,
        aiState: 'CHASE',
        frenzied: true,
      });
      expect(result.state.floorState.monsters.find((monster) => monster.id === 'dead')?.attack).toBe(8);
      expect(result.events[0]).toEqual({ type: 'GUNPOWDER_BARREL_ACTIVATED', entityId: 'F5_BARREL', pos: { x: 4, y: 6 } });
    });

    it('alarm rush moves living monsters up to 3 cells toward the player and attacks when in range', () => {
      const state = makeExpeditionState({
        floor: 5,
        playerOverrides: { hp: 100, maxHp: 100 },
        floorOverrides: {
          floor: 5,
          player: { x: 4, y: 6 },
          ap: 8,
          entities: [makeEntity('F5_BARREL', 'GUNPOWDER_BARREL', { x: 4, y: 6 })],
          monsters: [
            // 距玩家曼哈顿 5 → 冲 3 格后到 (4,4)，近战仍够不着，只 MOVE
            makeMonster('far', { x: 4, y: 1 }, { attack: 5, range: 1, aggroRadius: 8 }),
            // 已在射程内 → 不移动，直接 ATTACK（翻倍后 10 伤）
            makeMonster('near', { x: 5, y: 6 }, { attack: 5, range: 1, aggroRadius: 8 }),
          ],
        },
      });

      const result = activateGunpowderBarrel(state, 'F5_BARREL');
      const far = result.state.floorState.monsters.find((monster) => monster.id === 'far');
      expect(far?.pos).toEqual({ x: 4, y: 4 });
      expect(far?.frenzied).toBe(true);
      expect(result.events.filter((event) => event.type === 'MOVE' && event.entityId === 'far')).toHaveLength(3);
      expect(result.events.some((event) => event.type === 'PLAYER_DAMAGED' && event.sourceId === 'near' && event.damage === 10)).toBe(true);
      expect(result.state.player.hp).toBe(90);
    });

    it('detonating the blast target requires the barrel to be activated first', () => {
      const base = makeExpeditionState({
        floor: 5,
        floorOverrides: {
          floor: 5,
          player: { x: 4, y: 0 },
          ap: 8,
          entities: [
            makeEntity('F5_BARREL', 'GUNPOWDER_BARREL', { x: 4, y: 6 }),
            makeEntity('F5_BLAST_TARGET', 'BLAST_TARGET', { x: 4, y: 0 }),
          ],
        },
      });
      expect(detonateBlastTarget(base, 'F5_BLAST_TARGET').events).toEqual([]);

      const activated = {
        ...base,
        floorState: {
          ...base.floorState,
          entities: base.floorState.entities.map((entity) => entity.id === 'F5_BARREL' ? { ...entity, consumed: true } : entity),
        },
      };
      const result = detonateBlastTarget(activated, 'F5_BLAST_TARGET');
      expect(result.state.floorState.ap).toBe(7);
      expect(result.state.floorState.entities.find((entity) => entity.id === 'F5_BLAST_TARGET')?.consumed).toBe(true);
      expect(result.events).toEqual([{ type: 'BLAST_TARGET_DETONATED', entityId: 'F5_BLAST_TARGET', pos: { x: 4, y: 0 } }]);
    });
  });
});
