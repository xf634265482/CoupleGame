import { applyMove } from '../../assets/scripts/pve/core/MovementSystem';
import { createFogGrid, revealAround } from '../../assets/scripts/pve/core/FogSystem';
import { makeExpeditionState, makeMonster } from './helpers';

describe('MovementSystem — 网格移动（AC-2, AC-3）', () => {
  it('合法移动：位置更新、AP -2、产生 MOVE 事件', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        size: 8,
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [],
        revealed: createFogGrid(8),
      },
    });

    const result = applyMove(state, 'RIGHT');

    expect(result.state.floorState.player).toEqual({ x: 5, y: 4 });
    expect(result.state.floorState.ap).toBe(8);
    const moveEvent = result.events.find((e) => e.type === 'MOVE');
    expect(moveEvent).toEqual({
      type: 'MOVE',
      entityId: 'PLAYER',
      from: { x: 4, y: 4 },
      to: { x: 5, y: 4 },
      apLeft: 8,
    });
  });

  it('移动到未探索区域时产生 REVEAL 事件，并写回 revealed 矩阵', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        size: 8,
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [],
        revealed: createFogGrid(8),
      },
    });

    const result = applyMove(state, 'RIGHT');
    const revealEvent = result.events.find((e) => e.type === 'REVEAL');
    expect(revealEvent).toBeDefined();
    if (revealEvent?.type === 'REVEAL') {
      expect(revealEvent.cells.length).toBeGreaterThan(0);
      expect(revealEvent.cells).toContainEqual({ x: 5, y: 4 });
    }
    expect(result.state.floorState.revealed[4][5]).toBe(true);
  });

  it('目标格已全部探索过时不产生 REVEAL 事件', () => {
    const grid = createFogGrid(8);
    revealAround(grid, { x: 4, y: 4 }, 2);
    const state = makeExpeditionState({
      floorOverrides: {
        size: 8,
        player: { x: 4, y: 4 },
        ap: 10,
        monsters: [],
        revealed: grid,
      },
    });

    const result = applyMove(state, 'RIGHT');
    expect(result.events.find((e) => e.type === 'REVEAL')).toBeUndefined();
    expect(result.events.find((e) => e.type === 'MOVE')).toBeDefined();
  });

  it('越界移动被拒绝：状态不变、不产生事件、不消耗 AP', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        size: 8,
        player: { x: 0, y: 0 },
        ap: 10,
        monsters: [],
        revealed: createFogGrid(8),
      },
    });

    const result = applyMove(state, 'UP');
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.state.floorState.ap).toBe(10);
  });

  it('AP 不足时拒绝移动（no-op）', () => {
    const state = makeExpeditionState({
      floorOverrides: {
        size: 8,
        player: { x: 4, y: 4 },
        ap: 1,
        monsters: [],
        revealed: createFogGrid(8),
      },
    });

    const result = applyMove(state, 'RIGHT');
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });

  it('目标格被存活怪物占据时拒绝移动；怪物已死亡的格子可以通过', () => {
    const baseFloor = {
      size: 8,
      player: { x: 4, y: 4 },
      ap: 10,
      revealed: createFogGrid(8),
    };

    const blocked = makeExpeditionState({
      floorOverrides: { ...baseFloor, monsters: [makeMonster('m1', { x: 5, y: 4 }, { aiState: 'IDLE' })] },
    });
    const blockedResult = applyMove(blocked, 'RIGHT');
    expect(blockedResult.state).toBe(blocked);
    expect(blockedResult.events).toEqual([]);

    const passable = makeExpeditionState({
      floorOverrides: { ...baseFloor, monsters: [makeMonster('m2', { x: 5, y: 4 }, { aiState: 'DEAD' })] },
    });
    const passResult = applyMove(passable, 'RIGHT');
    expect(passResult.state.floorState.player).toEqual({ x: 5, y: 4 });
  });
});
