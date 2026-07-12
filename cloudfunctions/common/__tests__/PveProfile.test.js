const {
  PROFILE_VERSION,
  createDefaultProfile,
  normalizeProfile,
} = require('../pve/PveProfile');

describe('PveProfile', () => {
  test('creates a fresh warrior-only profile', () => {
    const profile = createDefaultProfile(123);
    expect(profile.version).toBe(PROFILE_VERSION);
    expect(profile.highestUnlockedFloor).toBe(1);
    expect(profile.highestClearedFloor).toBe(0);
    expect(profile.selectedProfessionId).toBe('WARRIOR');
    expect(profile.professions.WARRIOR.unlocked).toBe(true);
    expect(profile.professions.ARCHER.unlocked).toBe(false);
    expect(profile.minghenLoadout).toEqual([]);
    expect(profile.equipmentInventory).toEqual([]);
    expect(profile.updatedAt).toBe(123);
  });

  test('resets an incompatible profile instead of migrating old assets', () => {
    const profile = normalizeProfile({ version: 0, gold: 999 }, 456);
    expect(profile.version).toBe(PROFILE_VERSION);
    expect(profile.gold).toBe(0);
    expect(profile.updatedAt).toBe(456);
  });

  test('normalizes invalid fields and always unlocks warrior', () => {
    const profile = normalizeProfile({
      version: PROFILE_VERSION,
      highestUnlockedFloor: 99,
      highestClearedFloor: 2,
      gold: -1,
      minghenDust: 8,
      selectedProfessionId: 'ARCHER',
      professions: {
        WARRIOR: { unlocked: false, xp: -10, level: 0 },
        ARCHER: { unlocked: false, xp: 12, level: 2 },
      },
    }, 789);
    expect(profile.highestUnlockedFloor).toBe(35);
    expect(profile.highestClearedFloor).toBe(2);
    expect(profile.gold).toBe(0);
    expect(profile.minghenDust).toBe(8);
    expect(profile.professions.WARRIOR.unlocked).toBe(true);
    expect(profile.selectedProfessionId).toBe('WARRIOR');
  });
});
