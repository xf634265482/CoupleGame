import {
  applyPersistentBattleResult,
  createPersistentFloorRuntime,
} from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';

function profile(activeChallengeId = 'c13'): PveProfile {
  return {
    version: 1,
    highestUnlockedFloor: 14,
    highestClearedFloor: 12,
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

function killWaveMonsters(
  runtime: ReturnType<typeof createPersistentFloorRuntime>,
  wave: number,
) {
  const prefix = `wave${wave}_`;
  const expedition = {
    ...runtime.battleState.expedition,
    floorState: {
      ...runtime.battleState.expedition.floorState,
      monsters: runtime.battleState.expedition.floorState.monsters.map((monster) => (
        monster.id.startsWith(prefix)
          ? { ...monster, hp: 0, aiState: 'DEAD' as const }
          : monster
      )),
    },
  };
  const killEvents = runtime.battleState.expedition.floorState.monsters
    .filter((monster) => monster.id.startsWith(prefix))
    .map((monster) => ({ type: 'KILL' as const, monsterId: monster.id, monsterType: monster.type }));
  return applyPersistentBattleResult(runtime, { state: expedition, events: killEvents }, 2);
}

describe('Chapter2 floor 13 waves', () => {
  test('starts wave 1 with two raiders and rush tracking', () => {
    const runtime = createPersistentFloorRuntime(snapshot(13), profile('c13'), undefined, 1);
    expect(runtime.battleState.objective.data.currentWave).toBe(1);
    expect(runtime.battleState.expedition.floorState.monsters.filter((m) => m.id.startsWith('wave1_'))).toHaveLength(2);
  });

  test('advances through four waves and expands sand pits between waves', () => {
    let runtime = createPersistentFloorRuntime(snapshot(13), profile('c13'), undefined, 1);
    const pitsAtStart = runtime.battleState.expedition.floorState.entities.filter((e) => e.type === 'SAND_PIT').length;

    for (let wave = 1; wave <= 4; wave += 1) {
      const applied = killWaveMonsters(runtime, wave);
      runtime = applied.runtime;
      if (wave < 4) {
        expect(runtime.battleState.objective.data.currentWave).toBe(wave + 1);
      }
    }

    expect(runtime.battleState.objective.status).toBe('COMPLETE');
    const pitsAfter = runtime.battleState.expedition.floorState.entities.filter((e) => e.type === 'SAND_PIT').length;
    expect(pitsAfter).toBeGreaterThan(pitsAtStart);
    expect(runtime.battleState.expedition.floorState.entities.some(
      (entity) => entity.type === 'PORTAL' && !entity.consumed,
    )).toBe(true);
  });
});
