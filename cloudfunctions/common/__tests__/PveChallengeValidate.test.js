const { createDefaultProfile } = require('../pve/PveProfile');
const {
  validateMinghenLoadout,
  validateStartFloorChallengeRequest,
  validateSettleFloorChallengeRequest,
} = require('../pve/PveChallengeValidate');

function baseRequest(overrides = {}) {
  return {
    floor: 1,
    mode: 'PROGRESSION',
    professionId: 'WARRIOR',
    equipmentLoadout: {},
    minghenLoadout: [],
    ...overrides,
  };
}

describe('PveChallengeValidate', () => {
  test('accepts a valid first-floor progression request', () => {
    const result = validateStartFloorChallengeRequest(createDefaultProfile(), baseRequest());
    expect(result.floor).toBe(1);
    expect(result.professionId).toBe('WARRIOR');
    expect(result.minghenLoadout).toEqual([]);
  });

  test('rejects a locked profession', () => {
    expect(() => validateStartFloorChallengeRequest(
      createDefaultProfile(),
      baseRequest({ professionId: 'ARCHER' }),
    )).toThrow('职业尚未解锁');
  });

  test('rejects duplicate and over-cap minghen loadouts', () => {
    expect(() => validateMinghenLoadout([
      { id: 'M01', level: 1 },
      { id: 'M01', level: 2 },
    ])).toThrow('同名命痕不能重复装配');

    expect(() => validateMinghenLoadout(Array.from({ length: 9 }, (_, i) => ({
      id: `M${i}`,
      level: 1,
    })))).toThrow('不超过 8 项');
  });

  test('only allows replay modes on cleared floors', () => {
    const profile = createDefaultProfile();
    expect(() => validateStartFloorChallengeRequest(
      profile,
      baseRequest({ mode: 'HUNT', trackedMinghenId: 'M01' }),
    )).toThrow('非推进模式只能挑战已通关层');
  });

  test('normalizes settle optional objective ids', () => {
    expect(validateSettleFloorChallengeRequest({
      challengeId: 'c1',
      status: 'CLEAR',
      clearTurns: 8,
      completedOptionalObjectiveIds: ['o1', 'o1', 'o2'],
    })).toEqual({
      challengeId: 'c1',
      status: 'CLEAR',
      clearTurns: 8,
      completedOptionalObjectiveIds: ['o1', 'o2'],
    });
  });
});
