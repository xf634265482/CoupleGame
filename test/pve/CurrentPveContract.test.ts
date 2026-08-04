import { EQUIPMENT_POOL, getClassicEquipmentTemplate } from '../../assets/scripts/pve/core/EquipmentSystem';
import { CHAPTER1_FLOORS } from '../../assets/scripts/pve/core/chapter1/Chapter1FloorCatalog';
import { createChapter1ExpeditionState } from '../../assets/scripts/pve/core/chapter1/Chapter1ExpeditionFactory';
import { CHAPTER2_FLOORS } from '../../assets/scripts/pve/core/chapter2/Chapter2FloorCatalog';
import { createChapter2ExpeditionState } from '../../assets/scripts/pve/core/chapter2/Chapter2ExpeditionFactory';
import { chapterIdForFloor } from '../../assets/scripts/pve/core/chapterRouting';
import { createDefaultPartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';

function profile(): PveProfile {
  const partnerDefaults = createDefaultPartners();
  return {
    version: 1,
    highestUnlockedFloor: 14,
    highestClearedFloor: 13,
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
    activeChallengeId: null,
    updatedAt: 1,
  };
}

function challenge(floor: number): FloorChallengeSnapshot {
  return {
    challengeId: `contract-${floor}`,
    userId: 'contract-user',
    floor,
    mode: 'PROGRESSION',
    seed: 7000 + floor,
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

describe('current PVE source of truth', () => {
  test('keeps one 85-template equipment catalog with unique names', () => {
    const templates = Object.values(EQUIPMENT_POOL)
      .flatMap((byQuality) => Object.values(byQuality))
      .flat();
    expect(templates).toHaveLength(85);
    expect(new Set(templates.map((template) => template.name)).size).toBe(85);
  });

  test('every Chapter 1 and Chapter 2 floor drop resolves through that catalog', () => {
    const floorDefinitions = [...Object.values(CHAPTER1_FLOORS), ...Object.values(CHAPTER2_FLOORS)];
    for (const definition of floorDefinitions) {
      expect(definition.equipmentIds.length).toBeGreaterThanOrEqual(3);
      for (const name of definition.equipmentIds) {
        expect(getClassicEquipmentTemplate(name)).toBeDefined();
      }
    }
  });

  test.each(Array.from({ length: 14 }, (_, index) => index + 1))(
    'builds global floor %i with complete UI-facing state',
    (floor) => {
      const snapshot = challenge(floor);
      const state = chapterIdForFloor(floor) === 1
        ? createChapter1ExpeditionState(snapshot, profile())
        : createChapter2ExpeditionState(snapshot, profile());
      expect(state.floor).toBe(floor);
      expect(state.floorState.floor).toBe(floor);
      expect(state.player.hp).toBeGreaterThan(0);
      expect(state.floorState.revealed).toHaveLength(state.floorState.size);
      expect(Array.isArray(state.floorState.monsters)).toBe(true);
      expect(Array.isArray(state.floorState.entities)).toBe(true);
      expect(state.equipmentDropPool?.length).toBeGreaterThanOrEqual(3);
    },
  );
});
