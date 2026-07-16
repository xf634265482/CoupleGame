import { interactPortal, pickKey } from '../../assets/scripts/pve/core/FloorRules';
import {
  applyPersistentBattleResult,
  createPersistentFloorRuntime,
} from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';
import type { ExpeditionState } from '../../assets/scripts/pve/core/PveTypes';
import type { PersistentExpeditionRuntime } from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';

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

function snapshot(): FloorChallengeSnapshot {
  return {
    challengeId: 'challenge-1',
    userId: 'tester',
    floor: 1,
    mode: 'PROGRESSION',
    seed: 1234,
    status: 'ACTIVE',
    config: { professionId: 'WARRIOR', equipmentLoadout: {}, minghenLoadout: [], trackedMinghenId: null },
    startedAt: 1,
    updatedAt: 1,
  };
}

function withAp(runtime: PersistentExpeditionRuntime, expedition: ExpeditionState, ap = 10): PersistentExpeditionRuntime {
  const next = {
    ...expedition,
    floorState: { ...expedition.floorState, ap, maxAp: Math.max(expedition.floorState.maxAp, ap) },
  };
  return {
    ...runtime,
    battleState: { ...runtime.battleState, expedition: next },
    resources: { ...runtime.resources, ap },
  };
}

function movePlayer(expedition: ExpeditionState, pos: { x: number; y: number }): ExpeditionState {
  return {
    ...expedition,
    floorState: { ...expedition.floorState, player: { ...pos } },
  };
}

describe('floor 1 portal clear via real FloorRules interact', () => {
  test('pick key completes objective and spawns portal at key; interact clears', () => {
    let runtime = createPersistentFloorRuntime(snapshot(), profile(), undefined, 1);
    let expedition = runtime.battleState.expedition;
    runtime = withAp(runtime, expedition);

    const key = expedition.floorState.entities.find((e) => e.type === 'KEY');
    expect(key).toBeTruthy();
    expect(expedition.floorState.entities.some((e) => e.type === 'EXIT')).toBe(false);

    expedition = movePlayer(runtime.battleState.expedition, key!.pos);
    runtime = withAp(runtime, expedition);
    let step = pickKey(expedition, key!.id);
    ({ runtime, result: step } = applyPersistentBattleResult(runtime, step, 2));
    expedition = step.state;

    expect(expedition.floorState.hasKey).toBe(true);
    expect(runtime.battleState.objective.status).toBe('COMPLETE');
    expect(runtime.battleState.objective.data.hasKey).toBe(true);
    expect(runtime.status).toBe('ACTIVE');
    expect(step.events.some((e) => e.type === 'PORTAL_SPAWNED')).toBe(true);

    const portal = expedition.floorState.entities.find((e) => e.type === 'PORTAL' && !e.consumed);
    expect(portal).toBeTruthy();
    expect(portal!.pos).toEqual(key!.pos);

    step = interactPortal(expedition, portal!.id);
    ({ runtime, result: step } = applyPersistentBattleResult(runtime, step, 3));
    expect(runtime.status).toBe('CLEAR');
    expect(step.state.floorState.status).toBe('CLEARED');
    expect(step.events.some((e) => e.type === 'FLOOR_CLEARED')).toBe(true);
    expect(step.events.some((e) => e.type === 'PORTAL_SPAWNED')).toBe(false);
  });

  test('pick key with 0 AP still spawns portal; portal interact clears', () => {
    let runtime = createPersistentFloorRuntime(snapshot(), profile(), undefined, 1);
    let expedition = runtime.battleState.expedition;
    const key = expedition.floorState.entities.find((e) => e.type === 'KEY')!;
    expedition = movePlayer(expedition, key.pos);
    runtime = withAp(runtime, expedition, 0);
    let step = pickKey(runtime.battleState.expedition, key.id);
    ({ runtime, result: step } = applyPersistentBattleResult(runtime, step, 2));
    expedition = step.state;
    expect(runtime.status).toBe('ACTIVE');
    expect(step.events.some((e) => e.type === 'PORTAL_SPAWNED')).toBe(true);
    const portal = expedition.floorState.entities.find((e) => e.type === 'PORTAL' && !e.consumed)!;
    step = interactPortal(expedition, portal.id);
    ({ runtime, result: step } = applyPersistentBattleResult(runtime, step, 3));
    expect(runtime.status).toBe('CLEAR');
    expect(step.events.some((e) => e.type === 'FLOOR_CLEARED')).toBe(true);
  });

  test('reconciles passive pickKey that never bridged KEY_ACQUIRED to objective', () => {
    let runtime = createPersistentFloorRuntime(snapshot(), profile(), undefined, 1);
    let expedition = runtime.battleState.expedition;
    const key = expedition.floorState.entities.find((e) => e.type === 'KEY');
    expect(key).toBeTruthy();
    expedition = movePlayer(expedition, key!.pos);
    const picked = pickKey(expedition, key!.id);
    expedition = picked.state;
    expect(expedition.floorState.hasKey).toBe(true);
    expect(runtime.battleState.objective.data.hasKey).toBe(false);

    expedition = { ...expedition, floorState: { ...expedition.floorState, ap: 10, maxAp: 10 } };
    runtime = {
      ...runtime,
      battleState: { ...runtime.battleState, expedition },
      resources: { ...runtime.resources, ap: 10 },
    };

    // Any later action should reconcile hasKey → complete → spawn portal.
    const recovered = applyPersistentBattleResult(runtime, {
      state: expedition,
      events: [{ type: 'MOVE', entityId: 'PLAYER', from: expedition.floorState.player, to: expedition.floorState.player, apLeft: 9 }],
    }, 2);

    expect(recovered.runtime.battleState.objective.status).toBe('COMPLETE');
    expect(recovered.runtime.battleState.objective.data.hasKey).toBe(true);
    expect(recovered.runtime.status).toBe('ACTIVE');
    expect(recovered.result.events.some((e) => e.type === 'PORTAL_SPAWNED')).toBe(true);
    expect(recovered.result.state.floorState.entities.some((e) => e.type === 'PORTAL' && !e.consumed)).toBe(true);

    const portal = recovered.result.state.floorState.entities.find((e) => e.type === 'PORTAL' && !e.consumed)!;
    const stepped = interactPortal(recovered.result.state, portal.id);
    const cleared = applyPersistentBattleResult(recovered.runtime, stepped, 3);
    expect(cleared.runtime.status).toBe('CLEAR');
    expect(cleared.result.events.some((e) => e.type === 'FLOOR_CLEARED')).toBe(true);
  });

  test('recovers when hasKey is true but portal was never spawned', () => {
    let runtime = createPersistentFloorRuntime(snapshot(), profile(), undefined, 1);
    let expedition = runtime.battleState.expedition;
    const key = expedition.floorState.entities.find((e) => e.type === 'KEY')!;
    expedition = {
      ...expedition,
      floorState: {
        ...expedition.floorState,
        hasKey: true,
        ap: 10,
        player: { ...key.pos },
        entities: expedition.floorState.entities.map((entity) => (
          entity.type === 'KEY' ? { ...entity, consumed: true } : entity
        )),
      },
    };
    runtime = {
      ...runtime,
      battleState: { ...runtime.battleState, expedition },
      resources: { ...runtime.resources, ap: 10 },
    };

    const recovered = applyPersistentBattleResult(runtime, {
      state: expedition,
      events: [{ type: 'MOVE', entityId: 'PLAYER', from: expedition.floorState.player, to: expedition.floorState.player, apLeft: 9 }],
    }, 2);

    expect(recovered.runtime.battleState.objective.status).toBe('COMPLETE');
    expect(recovered.result.events.some((e) => e.type === 'PORTAL_SPAWNED')).toBe(true);
    expect(recovered.result.state.floorState.entities.some((e) => e.type === 'PORTAL' && !e.consumed)).toBe(true);
  });
});
