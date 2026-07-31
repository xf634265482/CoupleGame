import type { PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';
import {
  buildCampSharedBagEntries,
  defaultCampBagFilter,
} from '../../assets/scripts/pve/views/CampSharedBag';

function stubProfile(partial: Partial<PveProfile>): PveProfile {
  return {
    version: 1 as PveProfile['version'],
    highestUnlockedFloor: 1,
    highestClearedFloor: 0,
    floorRecords: {},
    minghenCollection: {},
    minghenLoadout: [],
    minghenPresets: [],
    equipmentInventory: [],
    equipmentLoadout: {},
    gold: 0,
    minghenDust: 0,
    materials: { quenchSand: 0, fusionCore: 0 },
    professions: {} as PveProfile['professions'],
    selectedProfessionId: 'WARRIOR',
    tracking: null,
    activeChallengeId: null,
    partners: {} as PveProfile['partners'],
    equippedPartnerId: null,
    updatedAt: 0,
    ...partial,
  };
}

describe('CampSharedBag', () => {
  test('default filter follows section', () => {
    expect(defaultCampBagFilter('MINGHEN')).toBe('MINGHEN');
    expect(defaultCampBagFilter('EQUIPMENT')).toBe('EQUIPMENT');
  });

  test('minghen filter hides equipped-only copies', () => {
    const profile = stubProfile({
      minghenCollection: {
        M01: { id: 'M01', level: 1, copies: 1, trialCompleted: false },
        M05: { id: 'M05', level: 2, copies: 2, trialCompleted: false },
      },
      minghenLoadout: [{ id: 'M01', level: 1 }],
    });
    const entries = buildCampSharedBagEntries(profile, 'MINGHEN');
    expect(entries.find((e) => e.kind === 'MINGHEN' && e.id === 'M01')).toBeUndefined();
    expect(entries).toEqual([
      { kind: 'MINGHEN', id: 'M05', level: 2, bagCopies: 2 },
    ]);
  });

  test('equipment filter skips loadout instances', () => {
    const profile = stubProfile({
      equipmentInventory: [
        {
          instanceId: 'a',
          definitionId: 'common_weapon_iron_sword',
          quality: 'COMMON',
          enhanceLevel: 0,
          locked: false,
          baseStat: 10,
        },
        {
          instanceId: 'b',
          definitionId: 'common_helmet_leather_helmet',
          quality: 'COMMON',
          enhanceLevel: 0,
          locked: false,
          baseStat: 5,
        },
      ],
      equipmentLoadout: { WEAPON: 'a' },
    });
    const entries = buildCampSharedBagEntries(profile, 'EQUIPMENT');
    expect(entries).toEqual([{ kind: 'EQUIPMENT', instanceId: 'b' }]);
  });

  test('material filter only lists materials with amount > 0', () => {
    const profile = stubProfile({ materials: { quenchSand: 3, fusionCore: 0 } });
    expect(buildCampSharedBagEntries(profile, 'MATERIAL')).toEqual([
      { kind: 'MATERIAL', materialId: 'QUENCH_SAND', amount: 3 },
    ]);
    expect(buildCampSharedBagEntries(stubProfile({ materials: { quenchSand: 0, fusionCore: 0 } }), 'MATERIAL')).toEqual([]);
  });

  test('ALL concatenates minghen, equipment, materials', () => {
    const profile = stubProfile({
      minghenCollection: { M02: { id: 'M02', level: 1, copies: 1, trialCompleted: false } },
      equipmentInventory: [
        {
          instanceId: 'x',
          definitionId: 'common_armor_leather_light_armor',
          quality: 'COMMON',
          enhanceLevel: 0,
          locked: false,
          baseStat: 4,
        },
      ],
      materials: { quenchSand: 1, fusionCore: 2 },
    });
    const entries = buildCampSharedBagEntries(profile, 'ALL');
    expect(entries.map((e) => e.kind)).toEqual([
      'MINGHEN', 'EQUIPMENT', 'MATERIAL', 'MATERIAL',
    ]);
  });
});
