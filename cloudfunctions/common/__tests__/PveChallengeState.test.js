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
      completedOptionalObjectiveIds: [],
    }, 200);
    expect(settled.profile.highestClearedFloor).toBe(1);
    expect(settled.profile.highestUnlockedFloor).toBe(2);
    expect(settled.profile.activeChallengeId).toBeNull();
    expect(settled.profile.floorRecords['1']).toMatchObject({
      clearCount: 1,
      bestClearTurns: 12,
      completedOptionalObjectiveIds: [],
    });
  });

  test('grants combat loot into inventory and loadout on clear', () => {
    const profile = createDefaultProfile();
    const challenge = buildChallenge('u1', request(), 100, 'c1', 1);
    const active = applyChallengeStart(profile, challenge, 100);
    const settled = applyChallengeSettlement(active, challenge, {
      status: 'CLEAR',
      clearTurns: 8,
      completedOptionalObjectiveIds: [],
      lootedEquipment: [{
        instanceId: 'loot_1_1_1',
        definitionId: '生锈短刃',
        quality: 'COMMON',
        enhanceLevel: 0,
        locked: false,
      }],
      equipmentLoadout: { WEAPON: 'loot_1_1_1' },
    }, 200);
    expect(settled.profile.equipmentInventory).toEqual([{
      instanceId: 'loot_1_1_1',
      definitionId: '生锈短刃',
      quality: 'COMMON',
      enhanceLevel: 0,
      locked: false,
    }]);
    expect(settled.profile.equipmentLoadout).toEqual({ WEAPON: 'loot_1_1_1' });
    expect(settled.rewards.lootedEquipment).toHaveLength(1);
  });

  test('keeps combat loot on death without unlocking floors', () => {
    const profile = createDefaultProfile();
    const challenge = buildChallenge('u1', request(), 100, 'c1', 1);
    const active = applyChallengeStart(profile, challenge, 100);
    const settled = applyChallengeSettlement(active, challenge, {
      status: 'DEAD',
      completedOptionalObjectiveIds: [],
      lootedEquipment: [{
        instanceId: 'loot_dead_w01',
        definitionId: '生锈短刃',
        quality: 'COMMON',
        enhanceLevel: 0,
        locked: false,
      }],
      equipmentLoadout: { WEAPON: 'loot_dead_w01' },
    }, 200);
    expect(settled.profile.highestUnlockedFloor).toBe(1);
    expect(settled.profile.equipmentInventory).toHaveLength(1);
    expect(settled.profile.equipmentLoadout).toEqual({ WEAPON: 'loot_dead_w01' });
  });

  test('floor 7 clear accepts GOBLIN_CHIEF exclusive spoil outside floor pool', () => {
    const profile = createDefaultProfile();
    profile.highestUnlockedFloor = 7;
    const challenge = buildChallenge('u1', request({ floor: 7 }), 100, 'c7', 7);
    const active = applyChallengeStart(profile, challenge, 100);
    const settled = applyChallengeSettlement(active, challenge, {
      status: 'CLEAR',
      clearTurns: 30,
      completedOptionalObjectiveIds: [],
      lootedEquipment: [{
        instanceId: 'loot_42_7_1',
        definitionId: '哥布林酋长战斧',
        quality: 'RARE',
        enhanceLevel: 0,
        locked: false,
        baseStat: 30,
      }],
      equipmentLoadout: { WEAPON: 'loot_42_7_1' },
    }, 200);
    expect(settled.profile.equipmentInventory.some((item) => item.definitionId === '哥布林酋长战斧')).toBe(true);
    expect(settled.profile.equipmentLoadout.WEAPON).toBe('loot_42_7_1');
    expect(settled.rewards.lootedEquipment?.[0]?.definitionId).toBe('哥布林酋长战斧');
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

  test('freezes partner into challenge config and grants clear XP', () => {
    const challenge = buildChallenge('u1', request({
      partnerId: 'MOBILITY',
      partnerEvolutionStage: 1,
      partnerLevel: 1,
    }), 100, 'c-partner', 1);
    expect(challenge.config.partnerId).toBe('MOBILITY');
    expect(challenge.config.partnerLevel).toBe(1);

    const profile = createDefaultProfile();
    const active = applyChallengeStart(profile, challenge, 100);
    const beforeExp = active.partners.MOBILITY.exp;
    const settled = applyChallengeSettlement(active, challenge, {
      status: 'CLEAR',
      clearTurns: 10,
      completedOptionalObjectiveIds: [],
    }, 200);
    // 30 + floor(1) = 31
    expect(settled.profile.partners.MOBILITY.exp).toBe(beforeExp + 31);
  });
});
