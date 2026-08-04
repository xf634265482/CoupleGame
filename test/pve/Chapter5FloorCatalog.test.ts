import {
  CHAPTER5_FLOORS,
  F32_PROPHECY_EYE_IDS,
  getChapter5FloorDefinition,
  type Chapter5Coord,
} from '../../assets/scripts/pve/core/chapter5/Chapter5FloorCatalog';
import { generateChapter5Floor, isReachable } from '../../assets/scripts/pve/core/chapter5/Chapter5FloorGenerator';
import { getChapter5Objective } from '../../assets/scripts/pve/core/chapter5/Chapter5Objectives';
import { createPersistentFloorRuntime } from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';
import { createDefaultPartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';

const key = (p: Chapter5Coord) => `${p.x},${p.y}`;

function profile(activeChallengeId = 'c29'): PveProfile {
  const partnerDefaults = createDefaultPartners();
  return {
    version: 1,
    highestUnlockedFloor: 35,
    highestClearedFloor: 28,
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

describe('Chapter5FloorCatalog', () => {
  test('seven chapter-five floors use global keys 29-35', () => {
    expect(Object.keys(CHAPTER5_FLOORS).map(Number).sort((a, b) => a - b)).toEqual([29, 30, 31, 32, 33, 34, 35]);
    expect(getChapter5FloorDefinition(31).objectiveKind).toBe('FATE_CHOICE');
    expect(getChapter5FloorDefinition(32).special?.eyeIds).toEqual([...F32_PROPHECY_EYE_IDS]);
    expect(getChapter5FloorDefinition(35).size).toBe(10);
  });

  test('all floors bind objectives and non-empty reward pools', () => {
    for (let floor = 29; floor <= 35; floor += 1) {
      const d = getChapter5FloorDefinition(floor);
      expect(getChapter5Objective(floor).kind).toBe(d.objectiveKind);
      expect(d.minghenIds.length).toBeGreaterThanOrEqual(3);
      expect(d.equipmentIds.length).toBeGreaterThanOrEqual(3);
    }
  });

  test.each([29, 31, 35])('floor %i skeleton keeps player and critical cells reachable', (floor) => {
    const d = getChapter5FloorDefinition(floor);
    const map = { size: d.size, walls: d.fixedWalls };
    const targets = [...d.criticalTargets, ...d.exitCells];
    for (const target of targets) {
      expect(isReachable(map, d.player, target)).toBe(true);
    }
    const occupied = new Set(d.fixedWalls.map((wall) => key(wall)));
    expect(occupied.has(key(d.player))).toBe(false);
  });

  test('persistent runtime can start chapter-five floors 29, 31, and 35', () => {
    for (const floor of [29, 31, 35]) {
      const runtime = createPersistentFloorRuntime(snapshot(floor), profile(`c${floor}`), undefined, 1);
      expect(runtime.battleState.expedition.chapter).toBe(5);
      expect(runtime.battleState.expedition.floor).toBe(floor);
      expect(runtime.battleState.objective.status).toBe('ACTIVE');
    }
  });

  test('floor 31 spawns three fate seals and a safe zone', () => {
    const runtime = createPersistentFloorRuntime(snapshot(31), profile('c31'), undefined, 1);
    const seals = runtime.battleState.expedition.floorState.entities.filter((e) => e.type === 'FATE_SEAL');
    const safe = runtime.battleState.expedition.floorState.entities.filter((e) => e.type === 'SAFE_ZONE');
    expect(seals).toHaveLength(3);
    expect(safe).toHaveLength(1);
  });

  test('floor 33 starts with a fate mirror monster', () => {
    const runtime = createPersistentFloorRuntime(snapshot(33), profile('c33'), undefined, 1);
    const mirror = runtime.battleState.expedition.floorState.monsters.find((m) => m.id === 'F33_FATE_MIRROR');
    expect(mirror?.bossId).toBe('FATE_MIRROR');
  });

  test('generated floor 29 is deterministic for 20 seeds', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const a = generateChapter5Floor(29, seed, 'PROGRESSION');
      const b = generateChapter5Floor(29, seed, 'PROGRESSION');
      expect(a).toEqual(b);
    }
  });
});
