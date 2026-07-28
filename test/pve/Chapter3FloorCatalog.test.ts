import {
  CHAPTER3_FLOORS,
  getChapter3FloorDefinition,
  type Chapter3Coord,
} from '../../assets/scripts/pve/core/chapter3/Chapter3FloorCatalog';
import { generateChapter3Floor, isReachable } from '../../assets/scripts/pve/core/chapter3/Chapter3FloorGenerator';
import { getChapter3Objective } from '../../assets/scripts/pve/core/chapter3/Chapter3Objectives';
import { createPersistentFloorRuntime } from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';
import { createDefaultPartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';

const key = (p: Chapter3Coord) => `${p.x},${p.y}`;

function profile(activeChallengeId = 'c15'): PveProfile {
  const partnerDefaults = createDefaultPartners();
  return {
    version: 1,
    highestUnlockedFloor: 21,
    highestClearedFloor: 14,
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

describe('Chapter3FloorCatalog', () => {
  test('seven chapter-three floors use global keys 15-21', () => {
    expect(Object.keys(CHAPTER3_FLOORS).map(Number).sort((a, b) => a - b)).toEqual([15, 16, 17, 18, 19, 20, 21]);
    expect(getChapter3FloorDefinition(16).objectiveKind).toBe('BOUNTY_HUNT');
    expect(getChapter3FloorDefinition(18).special?.coreId).toBe('F18_CORE');
    expect(getChapter3FloorDefinition(20).special?.waveCount).toBe(4);
  });

  test('all floors bind objectives and non-empty reward pools', () => {
    for (let floor = 15; floor <= 21; floor += 1) {
      const d = getChapter3FloorDefinition(floor);
      expect(getChapter3Objective(floor).kind).toBe(d.objectiveKind);
      expect(d.optionalObjectiveIds).toEqual([]);
      expect(d.minghenIds.length).toBeGreaterThanOrEqual(3);
      expect(d.equipmentIds.length).toBeGreaterThanOrEqual(3);
    }
  });

  test.each([15, 16, 21])('floor %i skeleton keeps player and critical cells reachable', (floor) => {
    const d = getChapter3FloorDefinition(floor);
    const map = { size: d.size, walls: d.fixedWalls };
    const targets = [...d.criticalTargets, ...d.exitCells];
    for (const target of targets) {
      expect(isReachable(map, d.player, target)).toBe(true);
    }
    const occupied = new Set(d.fixedWalls.map((wall) => key(wall)));
    expect(occupied.has(key(d.player))).toBe(false);
  });

  test('persistent runtime can start chapter-three floors 15, 16, and 21', () => {
    for (const floor of [15, 16, 21]) {
      const runtime = createPersistentFloorRuntime(snapshot(floor), profile(`c${floor}`), undefined, 1);
      expect(runtime.battleState.expedition.chapter).toBe(3);
      expect(runtime.battleState.expedition.floor).toBe(floor);
      expect(runtime.battleState.objective.status).toBe('ACTIVE');
    }
  });

  test('floor 16 spawns four bounty targets', () => {
    const runtime = createPersistentFloorRuntime(snapshot(16), profile('c16'), undefined, 1);
    const bounty = runtime.battleState.expedition.floorState.monsters.filter((m) => m.isBounty);
    expect(bounty).toHaveLength(4);
  });

  test('floor 20 starts with wave1 monsters tracked', () => {
    const runtime = createPersistentFloorRuntime(snapshot(20), profile('c20'), undefined, 1);
    const wave1 = runtime.battleState.expedition.floorState.monsters.filter((m) => m.id.startsWith('wave1_'));
    expect(wave1.length).toBe(2);
    expect(runtime.battleState.objective.data.currentWave).toBe(1);
  });

  test('generated floor 15 is deterministic for 20 seeds', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const a = generateChapter3Floor(15, seed, 'PROGRESSION');
      const b = generateChapter3Floor(15, seed, 'PROGRESSION');
      expect(a).toEqual(b);
    }
  });
});
