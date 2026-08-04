import { CHAPTER2_FLOORS, getChapter2FloorDefinition } from '../../assets/scripts/pve/core/chapter2/Chapter2FloorCatalog';
import { generateChapter2Floor, isReachable } from '../../assets/scripts/pve/core/chapter2/Chapter2FloorGenerator';
import { getChapter2Objective } from '../../assets/scripts/pve/core/chapter2/Chapter2Objectives';
import { createPersistentFloorRuntime } from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';
import { createDefaultPartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';

function profile(activeChallengeId = 'c8'): PveProfile {
  const partnerDefaults = createDefaultPartners();
  return {
    version: 1,
    highestUnlockedFloor: 14,
    highestClearedFloor: 7,
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
    partners: partnerDefaults.partners,
    equippedPartnerId: partnerDefaults.equippedPartnerId,
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

describe('Chapter2FloorGenerator', () => {
  test('all seven floors bind matching objectives', () => {
    expect(Object.keys(CHAPTER2_FLOORS)).toHaveLength(7);
    for (let floor = 8; floor <= 14; floor += 1) {
      const d = getChapter2FloorDefinition(floor);
      expect(getChapter2Objective(floor).kind).toBe(d.objectiveKind);
      expect(d.optionalObjectiveIds).toEqual([]);
      expect(d.minghenIds.length).toBeGreaterThanOrEqual(3);
      expect(d.equipmentIds.length).toBeGreaterThanOrEqual(3);
    }
  });

  test.each([8, 9, 11, 14])(
    'floor %i is deterministic and critical cells remain reachable for 20 seeds',
    (floor) => {
      for (let seed = 1; seed <= 20; seed += 1) {
        const a = generateChapter2Floor(floor, seed, 'PROGRESSION');
        const b = generateChapter2Floor(floor, seed, 'PROGRESSION');
        expect(a).toEqual(b);
        for (const target of [...a.objectiveCells, ...a.exitCells, ...a.chestCells]) {
          expect(isReachable(a, a.player, target)).toBe(true);
        }
        const occupied = new Set(a.walls.map((x) => `${x.x},${x.y}`));
        expect(occupied.has(`${a.player.x},${a.player.y}`)).toBe(false);
        for (const target of a.objectiveCells) {
          expect(occupied.has(`${target.x},${target.y}`)).toBe(false);
        }
      }
    },
  );

  test('persistent runtime can start chapter-two floors 8, 9, 11, and 14', () => {
    for (const floor of [8, 9, 11, 14]) {
      const runtime = createPersistentFloorRuntime(snapshot(floor), profile(`c${floor}`), undefined, 1);
      expect(runtime.battleState.expedition.chapter).toBe(2);
      expect(runtime.battleState.expedition.floor).toBe(floor);
      expect(runtime.battleState.objective.floor).toBe(floor);
      expect(runtime.battleState.objective.status).toBe('ACTIVE');
    }
  });

  test('floor 13 starts with wave1 monsters tracked', () => {
    const runtime = createPersistentFloorRuntime(snapshot(13), profile('c13'), undefined, 1);
    const wave1 = runtime.battleState.expedition.floorState.monsters.filter((m) => m.id.startsWith('wave1_'));
    expect(wave1.length).toBe(2);
    expect(runtime.battleState.objective.data.currentWave).toBe(1);
  });
});
