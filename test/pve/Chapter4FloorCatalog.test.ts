import {
  CHAPTER4_FLOORS,
  getChapter4FloorDefinition,
  type Chapter4Coord,
} from '../../assets/scripts/pve/core/chapter4/Chapter4FloorCatalog';
import { generateChapter4Floor, isReachable } from '../../assets/scripts/pve/core/chapter4/Chapter4FloorGenerator';
import { getChapter4Objective } from '../../assets/scripts/pve/core/chapter4/Chapter4Objectives';
import { createPersistentFloorRuntime } from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';
import { createDefaultPartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';

const key = (p: Chapter4Coord) => `${p.x},${p.y}`;

function profile(activeChallengeId = 'c22'): PveProfile {
  const partnerDefaults = createDefaultPartners();
  return {
    version: 1,
    highestUnlockedFloor: 28,
    highestClearedFloor: 21,
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

describe('Chapter4FloorCatalog', () => {
  test('seven chapter-four floors use global keys 22-28', () => {
    expect(Object.keys(CHAPTER4_FLOORS).map(Number).sort((a, b) => a - b)).toEqual([22, 23, 24, 25, 26, 27, 28]);
    expect(getChapter4FloorDefinition(23).objectiveKind).toBe('VENT_SEAL');
    expect(getChapter4FloorDefinition(24).special?.escortId).toBe('F24_ESCORT_CORE');
    expect(getChapter4FloorDefinition(26).special?.waveCount).toBe(4);
  });

  test('all floors bind objectives and non-empty reward pools', () => {
    for (let floor = 22; floor <= 28; floor += 1) {
      const d = getChapter4FloorDefinition(floor);
      expect(getChapter4Objective(floor).kind).toBe(d.objectiveKind);
      expect(d.optionalObjectiveIds).toEqual([]);
      expect(d.minghenIds.length).toBeGreaterThanOrEqual(3);
      expect(d.equipmentIds.length).toBeGreaterThanOrEqual(3);
    }
  });

  test.each([22, 23, 28])('floor %i skeleton keeps player and critical cells reachable', (floor) => {
    const d = getChapter4FloorDefinition(floor);
    const map = { size: d.size, walls: d.fixedWalls };
    const targets = [...d.criticalTargets, ...d.exitCells];
    for (const target of targets) {
      expect(isReachable(map, d.player, target)).toBe(true);
    }
    const occupied = new Set(d.fixedWalls.map((wall) => key(wall)));
    expect(occupied.has(key(d.player))).toBe(false);
  });

  test('persistent runtime can start chapter-four floors 22, 23, and 28', () => {
    for (const floor of [22, 23, 28]) {
      const runtime = createPersistentFloorRuntime(snapshot(floor), profile(`c${floor}`), undefined, 1);
      expect(runtime.battleState.expedition.chapter).toBe(4);
      expect(runtime.battleState.expedition.floor).toBe(floor);
      expect(runtime.battleState.objective.status).toBe('ACTIVE');
    }
  });

  test('floor 23 spawns five lava vents', () => {
    const runtime = createPersistentFloorRuntime(snapshot(23), profile('c23'), undefined, 1);
    const vents = runtime.battleState.expedition.floorState.entities.filter((e) => e.type === 'LAVA_VENT');
    expect(vents).toHaveLength(5);
  });

  test('floor 26 starts with wave1 monsters tracked', () => {
    const runtime = createPersistentFloorRuntime(snapshot(26), profile('c26'), undefined, 1);
    const wave1 = runtime.battleState.expedition.floorState.monsters.filter((m) => m.id.startsWith('wave1_'));
    expect(wave1.length).toBe(2);
    expect(runtime.battleState.objective.data.currentWave).toBe(1);
  });

  test('generated floor 22 is deterministic for 20 seeds', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const a = generateChapter4Floor(22, seed, 'PROGRESSION');
      const b = generateChapter4Floor(22, seed, 'PROGRESSION');
      expect(a).toEqual(b);
    }
  });
});
