import { applyPersistentBattleResult, createPersistentFloorRuntime } from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import type { ApplyResult, PveEvent } from '../../assets/scripts/pve/core/PveTypes';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';

function profile(): PveProfile {
  return {
    version: 1, highestUnlockedFloor: 7, highestClearedFloor: 0, floorRecords: {},
    minghenCollection: {}, minghenLoadout: [], minghenPresets: [], equipmentInventory: [],
    equipmentLoadout: {}, gold: 0, minghenDust: 0,
    professions: {
      WARRIOR: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
      ARCHER: { unlocked: false, xp: 0, level: 1, unlockedTechniqueIds: [] },
      RANGER: { unlocked: false, xp: 0, level: 1, unlockedTechniqueIds: [] },
    },
    selectedProfessionId: 'WARRIOR', tracking: null, activeChallengeId: 'active', updatedAt: 1,
  };
}

function snapshot(floor: number): FloorChallengeSnapshot {
  return {
    challengeId: `challenge-${floor}`,
    userId: 'tester',
    floor,
    mode: 'PROGRESSION',
    seed: 1234 + floor,
    status: 'ACTIVE',
    config: { professionId: 'WARRIOR', equipmentLoadout: {}, minghenLoadout: [], trackedMinghenId: null },
    startedAt: 1,
    updatedAt: 1,
  };
}

function resultFor(floor: number, events: PveEvent[]): { runtime: ReturnType<typeof createPersistentFloorRuntime>; result: ApplyResult } {
  const runtime = createPersistentFloorRuntime(snapshot(floor), profile(), undefined, 1);
  return { runtime, result: { state: runtime.battleState.expedition, events } };
}

describe('permanent-floor objective bridge on the original combat event chain', () => {
  test('floor 1 spawns portal on key pickup and clears after portal interaction', () => {
    const initial = resultFor(1, [{ type: 'PICK_KEY', entityId: 'floor_key' }]);
    // Ensure hasKey on battlefield so objective bridge + portal spawn fire.
    const withKey = {
      ...initial.result,
      state: {
        ...initial.result.state,
        floorState: { ...initial.result.state.floorState, hasKey: true },
      },
    };
    const keyed = applyPersistentBattleResult(initial.runtime, withKey, 2);
    expect(keyed.runtime.status).toBe('ACTIVE');
    expect(keyed.runtime.battleState.objective.status).toBe('COMPLETE');
    expect(keyed.result.events.some((event) => event.type === 'PORTAL_SPAWNED')).toBe(true);
    const portalState = {
      ...keyed.result.state,
      floorState: {
        ...keyed.result.state.floorState,
        entities: keyed.result.state.floorState.entities.map((entity) => entity.type === 'PORTAL'
          ? { ...entity, consumed: true }
          : entity),
      },
    };
    const cleared = applyPersistentBattleResult(keyed.runtime, {
      state: portalState,
      events: [{ type: 'FLOOR_CLEARED', floor: 1 }],
    }, 3);
    expect(cleared.runtime.status).toBe('CLEAR');
    expect(cleared.result.events.filter((event) => event.type === 'FLOOR_CLEARED')).toHaveLength(1);
  });

  test('floor 2 spawns a portal from the original elite KILL event and clears after portal interaction', () => {
    const initial = resultFor(2, [{ type: 'KILL', monsterId: 'FLOOR2_ELITE', monsterType: 'ELITE' }]);
    const opened = applyPersistentBattleResult(initial.runtime, initial.result, 2);
    expect(opened.runtime.status).toBe('ACTIVE');
    expect(opened.result.state.floorState.status).toBe('EXPLORING');
    expect(opened.result.events.some((event) => event.type === 'PORTAL_SPAWNED')).toBe(true);
    const portalState = {
      ...opened.result.state,
      floorState: {
        ...opened.result.state.floorState,
        entities: opened.result.state.floorState.entities.map((entity) => entity.type === 'PORTAL'
          ? { ...entity, consumed: true }
          : entity),
      },
    };
    const cleared = applyPersistentBattleResult(opened.runtime, {
      state: portalState,
      events: [{ type: 'FLOOR_CLEARED', floor: 2 }],
    }, 3);
    expect(cleared.runtime.status).toBe('CLEAR');
  });

  test('floor 3 opens a portal after the altar is consumed and all gate guards are dead', () => {
    const initial = resultFor(3, []);
    const state = {
      ...initial.result.state,
      floorState: {
        ...initial.result.state.floorState,
        entities: initial.result.state.floorState.entities.map((entity) => entity.id === 'ALTAR_1'
          ? { ...entity, consumed: true }
          : entity),
        monsters: initial.result.state.floorState.monsters.map((monster) => ({ ...monster, hp: 0, aiState: 'DEAD' as const })),
      },
    };
    const opened = applyPersistentBattleResult(initial.runtime, {
      state,
      events: [{ type: 'ALTAR_USED', entityId: 'ALTAR_1', anima: 0 }],
    }, 2);
    expect(opened.runtime.status).toBe('ACTIVE');
    expect(opened.result.events.some((event) => event.type === 'FLOOR_CLEARED')).toBe(false);
    expect(opened.result.events.some((event) => event.type === 'PORTAL_SPAWNED')).toBe(true);
  });

  test('floor 3 opens a portal when a restored objective contains a stale missing altar summon id', () => {
    const initial = resultFor(3, []);
    const runtime = {
      ...initial.runtime,
      battleState: {
        ...initial.runtime.battleState,
        objective: {
          ...initial.runtime.battleState.objective,
          data: {
            ...initial.runtime.battleState.objective.data,
            summonIds: ['altar_summon_3'],
          },
        },
      },
    };
    const state = {
      ...initial.result.state,
      floorState: {
        ...initial.result.state.floorState,
        entities: initial.result.state.floorState.entities.map((entity) => entity.id === 'ALTAR_1'
          ? { ...entity, consumed: true }
          : entity),
        monsters: initial.result.state.floorState.monsters.map((monster) => ({ ...monster, hp: 0, aiState: 'DEAD' as const })),
      },
    };

    const opened = applyPersistentBattleResult(runtime, {
      state,
      events: [{ type: 'ALTAR_USED', entityId: 'ALTAR_1', anima: 0 }],
    }, 2);

    expect(opened.runtime.status).toBe('ACTIVE');
    expect(opened.result.events.filter((event) => event.type === 'FLOOR_CLEARED')).toHaveLength(0);
    expect(opened.result.events.filter((event) => event.type === 'PORTAL_SPAWNED')).toHaveLength(1);
  });

  test('floor 5 opens the completion portal only after barrel activation and blast detonation', () => {
    const initial = resultFor(5, [{ type: 'BLAST_TARGET_DETONATED', entityId: 'F5_BLAST_TARGET', pos: { x: 4, y: 0 } }]);
    const blastOnly = applyPersistentBattleResult(initial.runtime, initial.result, 2);
    expect(blastOnly.runtime.status).toBe('ACTIVE');
    expect(blastOnly.result.events.some((event) => event.type === 'PORTAL_SPAWNED')).toBe(false);

    const activated = applyPersistentBattleResult(blastOnly.runtime, {
      state: blastOnly.result.state,
      events: [{ type: 'GUNPOWDER_BARREL_ACTIVATED', entityId: 'F5_BARREL', pos: { x: 4, y: 6 } }],
    }, 3);
    expect(activated.result.events.some((event) => event.type === 'PORTAL_SPAWNED')).toBe(false);

    const detonatedState = {
      ...activated.result.state,
      floorState: {
        ...activated.result.state.floorState,
        entities: activated.result.state.floorState.entities.map((entity) => entity.id === 'F5_BLAST_TARGET'
          ? { ...entity, consumed: true }
          : entity),
      },
    };
    const opened = applyPersistentBattleResult(activated.runtime, {
      state: detonatedState,
      events: [{ type: 'BLAST_TARGET_DETONATED', entityId: 'F5_BLAST_TARGET', pos: { x: 4, y: 0 } }],
    }, 4);

    expect(opened.runtime.status).toBe('ACTIVE');
    expect(opened.result.events.some((event) => event.type === 'FLOOR_CLEARED')).toBe(false);
    expect(opened.result.events.some((event) => event.type === 'PORTAL_SPAWNED')).toBe(true);
  });

  test('floor 3 does not clear while an untracked altar summon is still alive on the battlefield', () => {
    const initial = resultFor(3, []);
    const state = {
      ...initial.result.state,
      floorState: {
        ...initial.result.state.floorState,
        entities: initial.result.state.floorState.entities.map((entity) => entity.id === 'ALTAR_1'
          ? { ...entity, consumed: true }
          : entity),
        monsters: [
          ...initial.result.state.floorState.monsters.map((monster) => ({ ...monster, hp: 0, aiState: 'DEAD' as const })),
          {
            ...initial.result.state.floorState.monsters[0]!,
            id: 'altar_summon_3',
            hp: 12,
            aiState: 'CHASE' as const,
            pos: { x: 4, y: 2 },
            rewardEligible: false,
          },
        ],
      },
    };

    const active = applyPersistentBattleResult(initial.runtime, {
      state,
      events: [{ type: 'ALTAR_USED', entityId: 'ALTAR_1', anima: 0 }],
    }, 2);

    expect(active.runtime.status).toBe('ACTIVE');
    expect(active.result.events.some((event) => event.type === 'FLOOR_CLEARED')).toBe(false);
  });

  test('player death fails any active objective without fabricating a clear', () => {
    const initial = resultFor(7, [{ type: 'PLAYER_DEAD' }]);
    const deadState = {
      ...initial.result.state,
      status: 'DEAD' as const,
      floorState: { ...initial.result.state.floorState, status: 'DEAD' as const },
    };
    const failed = applyPersistentBattleResult(initial.runtime, { state: deadState, events: initial.result.events }, 2);
    expect(failed.runtime.status).toBe('DEAD');
    expect(failed.result.events.some((event) => event.type === 'FLOOR_CLEARED')).toBe(false);
  });
});
