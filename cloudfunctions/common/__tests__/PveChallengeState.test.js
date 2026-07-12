const { createDefaultProfile } = require('../pve/PveProfile');
const {
  buildChallenge,
  requestMatchesChallenge,
  validateLoadoutOwnership,
  applyChallengeStart,
  applyChallengeSettlement,
} = require('../pve/PveChallengeState');

function request(overrides = {}) {
  return {
    floor: 1,
    mode: 'PROGRESSION',
    professionId: 'WARRIOR',
    equipmentLoadout: {},
    minghenLoadout: [],
    trackedMinghenId: null,
    ...overrides,
  };
}

describe('PveChallengeState', () => {
  test('builds deterministic snapshots from explicit id and seed', () => {
    const challenge = buildChallenge('u1', request(), 100, 'c1', 1234);
    expect(challenge).toMatchObject({
      challengeId: 'c1',
      userId: 'u1',
      floor: 1,
      mode: 'PROGRESSION',
      seed: 1234,
      status: 'ACTIVE',
      startedAt: 100,
    });
  });

  test('matches retry requests independent of object key order', () => {
    const first = request({
      equipmentLoadout: { WEAPON: 'w1', ARMOR: 'a1' },
      minghenLoadout: [{ id: 'M02', level: 1 }, { id: 'M01', level: 2 }],
    });
    const challenge = buildChallenge('u1', first, 100, 'c1', 1);
    const retry = request({
      equipmentLoadout: { ARMOR: 'a1', WEAPON: 'w1' },
      minghenLoadout: [{ id: 'M01', level: 2 }, { id: 'M02', level: 1 }],
    });
    expect(requestMatchesChallenge(retry, challenge)).toBe(true);
  });

  test('rejects equipment or minghen not owned by the profile', () => {
    const profile = createDefaultProfile();
    expect(() => validateLoadoutOwnership(profile, request({
      equipmentLoadout: { WEAPON: 'missing' },
    }))).toThrow('未持有装备实例');
    expect(() => validateLoadoutOwnership(profile, request({
      minghenLoadout: [{ id: 'M01', level: 1 }],
    }))).toThrow('未持有对应等级命痕');
  });

  test('requires trial completion before equipping level 3', () => {
    const profile = createDefaultProfile();
    profile.minghenCollection.M01 = {
      id: 'M01', level: 3, copies: 0, trialCompleted: false,
    };
    expect(() => validateLoadoutOwnership(profile, request({
      minghenLoadout: [{ id: 'M01', level: 3 }],
    }))).toThrow('三级命痕尚未完成升格试炼');
  });

  test('progression clear unlocks the next floor and merges optional records', () => {
    const profile = createDefaultProfile();
    const challenge = buildChallenge('u1', request(), 100, 'c1', 1);
    const active = applyChallengeStart(profile, challenge, 100);
    const settled = applyChallengeSettlement(active, challenge, {
      status: 'CLEAR',
      clearTurns: 12,
      completedOptionalObjectiveIds: ['F1_FULL_SEARCH'],
    }, 200);
    expect(settled.profile.highestClearedFloor).toBe(1);
    expect(settled.profile.highestUnlockedFloor).toBe(2);
    expect(settled.profile.activeChallengeId).toBeNull();
    expect(settled.profile.floorRecords['1']).toMatchObject({
      clearCount: 1,
      bestClearTurns: 12,
      completedOptionalObjectiveIds: ['F1_FULL_SEARCH'],
    });
  });

  test('death and withdraw only clear the active pointer', () => {
    const profile = createDefaultProfile();
    const challenge = buildChallenge('u1', request(), 100, 'c1', 1);
    const active = applyChallengeStart(profile, challenge, 100);
    for (const status of ['DEAD', 'WITHDRAW']) {
      const settled = applyChallengeSettlement(active, challenge, {
        status,
        completedOptionalObjectiveIds: [],
      }, 200);
      expect(settled.profile.highestClearedFloor).toBe(0);
      expect(settled.profile.highestUnlockedFloor).toBe(1);
      expect(settled.profile.activeChallengeId).toBeNull();
    }
  });
});
