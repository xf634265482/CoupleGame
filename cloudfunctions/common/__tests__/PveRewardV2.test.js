const { createDefaultProfile } = require('../pve/PveProfile');
const { calculateRewards, applyMastery, unlockProfessions } = require('../pve/PveRewardV2');

function challenge(overrides = {}) {
  return {
    challengeId: 'c1', floor: 1, mode: 'PROGRESSION', seed: 1,
    config: { professionId: 'WARRIOR' }, ...overrides,
  };
}

function previous(overrides = {}) {
  return { clearCount: 0, completedOptionalObjectiveIds: [], graduatedMinghenIds: [], ...overrides };
}

describe('PveRewardV2', () => {
  test('first progression rewards dominate replay without optional gold', () => {
    const profile = createDefaultProfile(1);
    const first = calculateRewards(
      profile,
      challenge(),
      { completedOptionalObjectiveIds: [], professionHighlightCount: 2 },
      previous(),
    );
    expect(first).toMatchObject({ gold: 20, masteryXp: 150, firstClear: true });
    expect(first.equipment).toBeUndefined();
    const replay = calculateRewards(
      { ...profile, highestUnlockedFloor: 8 },
      challenge({ mode: 'HUNT' }),
      { completedOptionalObjectiveIds: [] },
      previous({ firstClearedAt: 1, completedOptionalObjectiveIds: [] }),
    );
    expect(replay.gold).toBe(7);
    expect(replay.masteryXp).toBe(2);
  });

  test('mastery unlocks techniques without stat fields and floor unlocks professions', () => {
    const profile = createDefaultProfile(1);
    const professions = applyMastery(profile, 'WARRIOR', 900);
    expect(professions.WARRIOR).toMatchObject({
      xp: 900, level: 5, unlockedTechniqueIds: ['ARMOR_BREAK', 'KNOCKBACK'],
    });
    expect(professions.WARRIOR.attack).toBeUndefined();
    expect(unlockProfessions(professions, 2, true).ARCHER).toMatchObject({
      unlocked: true, xp: 150, level: 2,
    });
  });

  test('rejects optional ids because optional objectives are retired', () => {
    expect(() => calculateRewards(
      createDefaultProfile(1), challenge(),
      { completedOptionalObjectiveIds: ['F1_FULL_SEARCH'] }, previous(),
    )).toThrow('可选目标不属于当前楼层');
  });

  test('chapter two first clear uses the current gold table', () => {
    const first = calculateRewards(
      createDefaultProfile(1), challenge({ floor: 8 }),
      { completedOptionalObjectiveIds: [] }, previous(),
    );
    expect(first.gold).toBe(35);
  });
});
