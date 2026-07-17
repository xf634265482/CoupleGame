const {
  PROFILE_VERSION,
  createDefaultProfile,
  normalizeProfile,
  resetCampInventory,
  resetExpeditionProgress,
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

  test('creates a profile with the permanent-floor stamina fields', () => {
    expect(createDefaultProfile(100)).toMatchObject({
      stamina: 60,
      staminaUpdatedAt: 100,
      staminaNextRecoveryAt: null,
      tutorialFreeChallengeConsumed: false,
    });
  });

  test('migrates legacy root stamina fields once', () => {
    const profile = normalizeProfile(undefined, 1_000, {
      pveStamina: 12,
      pveStaminaUpdatedAt: 500,
      pveFirstRunStarted: true,
    });
    expect(profile).toMatchObject({
      stamina: 12,
      staminaUpdatedAt: 500,
      tutorialFreeChallengeConsumed: true,
    });
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
    expect(profile.gold).toBe(8);
    expect(profile.minghenDust).toBe(0);
    expect(profile.professions.WARRIOR.unlocked).toBe(true);
    expect(profile.selectedProfessionId).toBe('WARRIOR');
  });

  test('GM expedition reset returns a completely fresh profile', () => {
    const profile = resetExpeditionProgress({
      ...createDefaultProfile(1),
      highestUnlockedFloor: 6,
      highestClearedFloor: 5,
      floorRecords: { '1': { clearCount: 1 } },
      minghenCollection: { M01: { id: 'M01', level: 1, copies: 1, trialCompleted: false } },
      equipmentInventory: [{ instanceId: 'i1', definitionId: '生锈短刃', quality: 'COMMON', enhanceLevel: 0, locked: false }],
      tracking: { floor: 2, minghenId: 'M01', progress: 1, state: 'HUNT' },
      activeChallengeId: 'challenge-5',
    }, 999);
    expect(profile).toMatchObject({
      highestUnlockedFloor: 1,
      highestClearedFloor: 0,
      floorRecords: {},
      tracking: null,
      activeChallengeId: null,
      minghenCollection: {},
      minghenLoadout: [],
      minghenPresets: [],
      equipmentInventory: [],
      equipmentLoadout: {},
      gold: 0,
      minghenDust: 0,
      updatedAt: 999,
    });
    expect(profile.professions.WARRIOR).toMatchObject({ unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] });
    expect(profile.professions.ARCHER).toMatchObject({ unlocked: false, xp: 0, level: 1, unlockedTechniqueIds: [] });
  });

  test('GM camp reset clears build assets and active challenge while preserving progression', () => {
    const profile = resetCampInventory({
      ...createDefaultProfile(1),
      highestUnlockedFloor: 6,
      highestClearedFloor: 5,
      floorRecords: { '5': { clearCount: 2 } },
      gold: 321,
      minghenDust: 9,
      minghenCollection: { M01: { id: 'M01', level: 1, copies: 1, trialCompleted: false } },
      minghenLoadout: [{ id: 'M01', level: 1 }],
      minghenPresets: [{ name: '方案 1', entries: [{ id: 'M01', level: 1 }] }],
      equipmentInventory: [{ instanceId: 'i1', definitionId: '生锈短刃', quality: 'COMMON', enhanceLevel: 0, locked: false }],
      equipmentLoadout: { WEAPON: 'i1' },
      professions: {
        ...createDefaultProfile(1).professions,
        WARRIOR: { unlocked: true, xp: 88, level: 3, unlockedTechniqueIds: ['ARMOR_BREAK'] },
      },
      activeChallengeId: 'challenge-5',
    }, 777);

    expect(profile).toMatchObject({
      highestUnlockedFloor: 6,
      highestClearedFloor: 5,
      floorRecords: { '5': { clearCount: 2 } },
      gold: 330,
      minghenDust: 0,
      minghenCollection: {},
      minghenLoadout: [],
      minghenPresets: [],
      equipmentInventory: [],
      equipmentLoadout: {},
      activeChallengeId: null,
      updatedAt: 777,
    });
    expect(profile.professions.WARRIOR).toMatchObject({ xp: 88, level: 3, unlockedTechniqueIds: ['ARMOR_BREAK'] });
  });

  test('merges legacy minghenDust into gold (stardust) on normalize', () => {
    const profile = normalizeProfile({
      ...createDefaultProfile(1),
      gold: 40,
      minghenDust: 15,
    }, 1);
    expect(profile.gold).toBe(55);
    expect(profile.minghenDust).toBe(0);
  });
});
