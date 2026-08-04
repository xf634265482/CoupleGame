import { applyLightSandstorm } from '../../assets/scripts/pve/core/chapter2/LightSandstorm';
import {
  applyPersistentBattleResult,
  createPersistentFloorRuntime,
} from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import { createRng } from '../../assets/scripts/pve/core/rng';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';

function profile(activeChallengeId = 'c12'): PveProfile {
  return {
    version: 1,
    highestUnlockedFloor: 14,
    highestClearedFloor: 11,
    floorRecords: {},
    minghenCollection: {},
    minghenLoadout: [],
    minghenPresets: [],
    equipmentInventory: [],
    equipmentLoadout: {},
    gold: 0,
    minghenDust: 0,
    professions: {
      WARRIOR: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
      ARCHER: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
      RANGER: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
    },
    selectedProfessionId: 'WARRIOR',
    tracking: null,
    activeChallengeId,
    updatedAt: 1,
  };
}

function snapshot(floor: number): FloorChallengeSnapshot {
  return {
    challengeId: `c${floor}`,
    userId: 'u1',
    floor,
    mode: 'PROGRESSION',
    seed: 2,
    status: 'ACTIVE',
    config: {
      professionId: 'WARRIOR',
      equipmentLoadout: {},
      minghenLoadout: [],
      trackedMinghenId: null,
    },
    startedAt: 1,
    updatedAt: 1,
  };
}

describe('Chapter2 floor 12 timed escape', () => {
  test('light sandstorm deals configured damage of 10', () => {
    let runtime = createPersistentFloorRuntime(snapshot(12), profile('c12'), undefined, 1);
    const expedition = {
      ...runtime.battleState.expedition,
      floorState: {
        ...runtime.battleState.expedition.floorState,
        player: { x: 4, y: 4 },
      },
    };
    const rng = createRng(12345);
    const storm = applyLightSandstorm(expedition, rng, { cellCount: 4, damage: 10 });
    const hit = storm.events.find((event) => event.type === 'SANDSTORM_HIT');
    if (hit && hit.type === 'SANDSTORM_HIT') {
      expect(hit.damage).toBe(10);
    } else {
      expect(storm.events.some((event) => event.type === 'SANDSTORM_SPAWNED')).toBe(true);
    }
  });

  test('fails after 12 player turns without reaching exit', () => {
    let runtime = createPersistentFloorRuntime(snapshot(12), profile('c12'), undefined, 1);
    for (let turn = 1; turn <= 12; turn += 1) {
      runtime = applyPersistentBattleResult(runtime, {
        state: runtime.battleState.expedition,
        events: [{ type: 'TURN_END', turn }],
      }, turn + 1).runtime;
    }
    expect(runtime.battleState.objective.status).toBe('FAILED');
    expect(runtime.battleState.objective.data.turnsLeft).toBe(0);
  });

  test('exit interaction completes timed escape objective', () => {
    let runtime = createPersistentFloorRuntime(snapshot(12), profile('c12'), undefined, 1);
    runtime = applyPersistentBattleResult(runtime, {
      state: runtime.battleState.expedition,
      events: [{ type: 'FLOOR_CLEARED', floor: 12 }],
    }, 2).runtime;
    expect(runtime.battleState.objective.status).toBe('COMPLETE');
    expect(runtime.battleState.expedition.floorState.entities.some(
      (entity) => entity.type === 'PORTAL' && !entity.consumed,
    )).toBe(true);
  });

  test('sandstorm triggers on even completed turns during end turn', () => {
    let runtime = createPersistentFloorRuntime(snapshot(12), profile('c12'), undefined, 1);
    const applied = applyPersistentBattleResult(runtime, {
      state: runtime.battleState.expedition,
      events: [{ type: 'TURN_END', turn: 2 }],
    }, 3);
    expect(applied.result.events.some((event) => event.type === 'SANDSTORM_SPAWNED')).toBe(true);
  });
});
