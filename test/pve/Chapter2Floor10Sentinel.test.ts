import {
  applyPersistentBattleResult,
  createPersistentFloorRuntime,
} from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';

function profile(activeChallengeId = 'c10'): PveProfile {
  return {
    version: 1,
    highestUnlockedFloor: 14,
    highestClearedFloor: 9,
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

describe('Chapter2 floor 10 sentinel purge', () => {
  test('clearing both sentinels completes objective and dissolves hunt pressure', () => {
    let runtime = createPersistentFloorRuntime(snapshot(10), profile('c10'));
    const raiderBefore = runtime.battleState.expedition.floorState.monsters.find((m) => m.id === 'f10_r1')!;
    expect(raiderBefore.aggroRadius).toBe(5);

    for (const sentinelId of ['F10_SENTINEL_1', 'F10_SENTINEL_2']) {
      const expedition = {
        ...runtime.battleState.expedition,
        floorState: {
          ...runtime.battleState.expedition.floorState,
          monsters: runtime.battleState.expedition.floorState.monsters.map((monster) => (
            monster.id === sentinelId
              ? { ...monster, hp: 0, aiState: 'DEAD' as const }
              : monster
          )),
        },
      };
      runtime = applyPersistentBattleResult(runtime, {
        state: expedition,
        events: [{ type: 'KILL', monsterId: sentinelId, monsterType: 'NORMAL' }],
      }, 2).runtime;
    }

    expect(runtime.battleState.objective.status).toBe('COMPLETE');
    expect(runtime.battleState.expedition.floorState.entities.some(
      (entity) => entity.type === 'PORTAL' && !entity.consumed,
    )).toBe(true);
    // 门刷在「完成目标的最后一击」尸体格（此处为 SENTINEL_2），与击杀型层同类口径。
    const portal = runtime.battleState.expedition.floorState.entities.find((e) => e.type === 'PORTAL')!;
    const sentinel2 = runtime.battleState.expedition.floorState.monsters.find((m) => m.id === 'F10_SENTINEL_2')!;
    expect(portal.pos).toEqual(sentinel2.pos);
    const raiderAfter = runtime.battleState.expedition.floorState.monsters.find((m) => m.id === 'f10_r1')!;
    expect(raiderAfter.aggroRadius).toBe(1);
    expect(raiderAfter.aiState).toBe('IDLE');
    expect(runtime.battleState.expedition.floorState.duneSentinelAlertIds).toBeUndefined();
  });

  test('portal spawns on the completing sentinel corpse, not a fixed sentinel id', () => {
    let runtime = createPersistentFloorRuntime(snapshot(10), profile('c10'));

    // 先杀 SENTINEL_2，再杀 SENTINEL_1：门必须在 SENTINEL_1 尸体格（最后一击）。
    for (const sentinelId of ['F10_SENTINEL_2', 'F10_SENTINEL_1']) {
      const expedition = {
        ...runtime.battleState.expedition,
        floorState: {
          ...runtime.battleState.expedition.floorState,
          monsters: runtime.battleState.expedition.floorState.monsters.map((monster) => (
            monster.id === sentinelId
              ? { ...monster, hp: 0, aiState: 'DEAD' as const }
              : monster
          )),
        },
      };
      runtime = applyPersistentBattleResult(runtime, {
        state: expedition,
        events: [{ type: 'KILL', monsterId: sentinelId, monsterType: 'NORMAL' }],
      }, 2).runtime;
    }

    const portal = runtime.battleState.expedition.floorState.entities.find(
      (entity) => entity.type === 'PORTAL' && !entity.consumed,
    );
    const sentinel1 = runtime.battleState.expedition.floorState.monsters.find((m) => m.id === 'F10_SENTINEL_1')!;
    expect(portal).toBeTruthy();
    expect(portal!.pos).toEqual(sentinel1.pos);
  });

  test('reconciles when both sentinels are dead without KILL events (DoT / missed events)', () => {
    let runtime = createPersistentFloorRuntime(snapshot(10), profile('c10'));
    const expedition = {
      ...runtime.battleState.expedition,
      floorState: {
        ...runtime.battleState.expedition.floorState,
        monsters: runtime.battleState.expedition.floorState.monsters.map((monster) => (
          monster.id === 'F10_SENTINEL_1' || monster.id === 'F10_SENTINEL_2'
            ? { ...monster, hp: 0, aiState: 'DEAD' as const }
            : monster
        )),
      },
    };
    runtime = applyPersistentBattleResult(runtime, {
      state: expedition,
      events: [{ type: 'TURN_END', turn: 1 }],
    }, 2).runtime;

    expect(runtime.battleState.objective.status).toBe('COMPLETE');
    expect(runtime.battleState.expedition.floorState.entities.some(
      (entity) => entity.type === 'PORTAL' && !entity.consumed,
    )).toBe(true);
  });
});
