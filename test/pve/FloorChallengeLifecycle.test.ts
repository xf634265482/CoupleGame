import {
  applyFloorDeath,
  buildFloorSettlementRequest,
  clearFloorRuntime,
  resetRuntimeForLobby,
  resumeFloorRuntime,
  serializeFloorRuntime,
  startFloorRuntime,
  withdrawFloorRuntime,
} from '../../assets/scripts/pve/core/FloorChallengeLifecycle';
import type { FloorChallengeSnapshot } from '../../assets/scripts/pve/core/PveProgressionTypes';

function snapshot(overrides: Partial<FloorChallengeSnapshot> = {}): FloorChallengeSnapshot {
  return {
    challengeId: 'c1',
    userId: 'u1',
    floor: 1,
    mode: 'PROGRESSION',
    seed: 123,
    status: 'ACTIVE',
    config: {
      professionId: 'WARRIOR',
      equipmentLoadout: {},
      minghenLoadout: [],
      trackedMinghenId: null,
    },
    startedAt: 10,
    updatedAt: 10,
    ...overrides,
  };
}

describe('FloorChallengeLifecycle', () => {
  test('starts each floor with fresh combat resources', () => {
    const state = startFloorRuntime(snapshot(), { maxHp: 280, maxAp: 8 }, { map: 'f1' }, 100);
    expect(state.resources).toEqual({
      hp: 280,
      maxHp: 280,
      ap: 8,
      maxAp: 8,
      spirit: 0,
      shield: 0,
      statuses: [],
      temporaryEffects: [],
    });
    expect(state.profession.rangerCombo).toBe(0);
    expect(state.turn).toBe(1);
    expect(state.rngState).toBe(123);
  });

  test('freezes snapshot config instead of retaining mutable input references', () => {
    const source = snapshot();
    source.config.minghenLoadout.push({ id: 'M01', level: 1 });
    const state = startFloorRuntime(source, { maxHp: 280, maxAp: 8 }, {}, 100);
    source.config.minghenLoadout[0].level = 2;
    expect(state.config.minghenLoadout).toEqual([{ id: 'M01', level: 1 }]);
  });

  test('clear builds a deduplicated settlement request', () => {
    const active = startFloorRuntime(snapshot(), { maxHp: 280, maxAp: 8 }, {}, 100);
    active.turn = 9;
    const cleared = clearFloorRuntime(active, ['f1_a', 'f1_a', 'f1_b'], 200);
    expect(buildFloorSettlementRequest(cleared)).toEqual({
      challengeId: 'c1',
      status: 'CLEAR',
      clearTurns: 9,
      completedOptionalObjectiveIds: ['f1_a', 'f1_b'],
    });
  });

  test('death clears volatile combat state without creating clear rewards', () => {
    const active = startFloorRuntime(snapshot(), { maxHp: 280, maxAp: 8 }, {}, 100);
    active.resources.hp = 12;
    active.resources.spirit = 80;
    active.resources.shield = 20;
    active.resources.temporaryEffects = ['X'];
    active.profession.rangerCombo = 4;
    const dead = applyFloorDeath(active, 200);
    expect(dead.status).toBe('DEAD');
    expect(dead.resources.hp).toBe(0);
    expect(dead.resources.spirit).toBe(0);
    expect(dead.resources.shield).toBe(0);
    expect(dead.profession.rangerCombo).toBe(0);
    expect(buildFloorSettlementRequest(dead)).toEqual({
      challengeId: 'c1',
      status: 'DEAD',
      completedOptionalObjectiveIds: [],
    });
  });

  test('withdraw clears statuses and can be reset for lobby display', () => {
    const active = startFloorRuntime(snapshot(), { maxHp: 280, maxAp: 8 }, {}, 100);
    active.resources.hp = 100;
    active.resources.ap = 2;
    active.resources.statuses = [{ id: 'POISON', stacks: 2, remainingTurns: 2, sourcePower: 10 }];
    const withdrawn = withdrawFloorRuntime(active, 200);
    expect(withdrawn.status).toBe('WITHDRAW');
    expect(withdrawn.resources.statuses).toEqual([]);
    const lobby = resetRuntimeForLobby(withdrawn, { maxHp: 300, maxAp: 9 }, 300);
    expect(lobby.resources.hp).toBe(300);
    expect(lobby.resources.ap).toBe(9);
    expect(lobby.resources.spirit).toBe(0);
  });

  test('serializes and resumes the exact active runtime', () => {
    const source = startFloorRuntime(snapshot(), { maxHp: 280, maxAp: 8 }, { cells: [1, 2] }, 100);
    source.resources.hp = 123;
    source.turn = 4;
    const resumed = resumeFloorRuntime<{ cells: number[] }>(snapshot(), serializeFloorRuntime(source));
    expect(resumed.resources.hp).toBe(123);
    expect(resumed.turn).toBe(4);
    expect(resumed.battleState.cells).toEqual([1, 2]);
  });

  test('rejects mismatched challenge saves and active settlement', () => {
    const active = startFloorRuntime(snapshot(), { maxHp: 280, maxAp: 8 }, {}, 100);
    expect(() => buildFloorSettlementRequest(active)).toThrow('CANNOT_SETTLE_ACTIVE_FLOOR_RUNTIME');
    expect(() => resumeFloorRuntime(snapshot({ challengeId: 'c2' }), serializeFloorRuntime(active)))
      .toThrow('FLOOR_RUNTIME_SNAPSHOT_MISMATCH');
  });

  test('rejects non-active cloud snapshots at start', () => {
    expect(() => startFloorRuntime(
      snapshot({ status: 'CLEAR' }),
      { maxHp: 280, maxAp: 8 },
      {},
    )).toThrow('FLOOR_CHALLENGE_NOT_ACTIVE');
  });
});
