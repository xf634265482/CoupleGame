import { previewCampCombatStats } from '../../assets/scripts/pve/core/CampCombatPreview';
import { PROFESSION_BASE_STATS } from '../../assets/scripts/pve/core/professions/ProfessionBaseStats';
import type { PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';

function profile(overrides: Partial<PveProfile> = {}): PveProfile {
  return {
    version: 1,
    highestUnlockedFloor: 1,
    highestClearedFloor: 0,
    highestClearedAt: null,
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
    activeChallengeId: null,
    stamina: 60,
    staminaUpdatedAt: 1,
    staminaNextRecoveryAt: null,
    tutorialFreeChallengeConsumed: false,
    updatedAt: 1,
    ...overrides,
  };
}

describe('previewCampCombatStats', () => {
  test('empty loadout matches profession base panel for all three jobs', () => {
    const p = profile();
    for (const id of ['WARRIOR', 'ARCHER', 'RANGER'] as const) {
      const base = PROFESSION_BASE_STATS[id];
      const stats = previewCampCombatStats(p, id);
      expect(stats.maxHp).toBe(base.maxHp);
      expect(stats.armor).toBe(0);
      expect(stats.range).toBe(base.attackRange);
      expect(stats.attack).toBe(Math.max(10, Math.round(base.attack)));
    }
  });

  test('same loadout: archer range is higher than warrior', () => {
    const p = profile();
    const warrior = previewCampCombatStats(p, 'WARRIOR');
    const archer = previewCampCombatStats(p, 'ARCHER');
    expect(archer.range).toBeGreaterThan(warrior.range);
    expect(warrior.maxHp).toBeGreaterThan(archer.maxHp);
  });

  test('equipping armor and helmet raises armor and maxHp', () => {
    const p = profile({
      equipmentInventory: [
        { instanceId: 'a1', definitionId: '皮革轻甲', quality: 'COMMON', enhanceLevel: 0, locked: false },
        { instanceId: 'h1', definitionId: '皮革头盔', quality: 'COMMON', enhanceLevel: 0, locked: false },
      ],
      equipmentLoadout: { ARMOR: 'a1', HELMET: 'h1' },
    });
    const empty = previewCampCombatStats(profile(), 'WARRIOR');
    const geared = previewCampCombatStats(p, 'WARRIOR');
    expect(geared.maxHp).toBeGreaterThan(empty.maxHp);
    expect(geared.armor).toBeGreaterThan(empty.armor);
  });

  test('equipping a weapon raises attack', () => {
    const p = profile({
      equipmentInventory: [
        { instanceId: 'w1', definitionId: '生锈短刃', quality: 'COMMON', enhanceLevel: 0, locked: false },
      ],
      equipmentLoadout: { WEAPON: 'w1' },
    });
    const empty = previewCampCombatStats(profile(), 'WARRIOR');
    const geared = previewCampCombatStats(p, 'WARRIOR');
    expect(geared.attack).toBeGreaterThan(empty.attack);
  });
});
