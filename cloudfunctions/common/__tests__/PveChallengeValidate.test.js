const { validateStartFloorChallengeRequest } = require('../pve/PveChallengeValidate');
const { createDefaultProfile } = require('../pve/PveProfile');

test('accepts floor 14 and rejects floor 15', () => {
  const profile = {
    ...createDefaultProfile(1),
    highestUnlockedFloor: 14,
    highestClearedFloor: 13,
  };
  const request = {
    mode: 'PROGRESSION',
    professionId: 'WARRIOR',
    equipmentLoadout: {},
    minghenLoadout: [],
  };
  expect(validateStartFloorChallengeRequest(profile, { ...request, floor: 14 }).floor).toBe(14);
  expect(() => validateStartFloorChallengeRequest(
    { ...profile, highestUnlockedFloor: 35 },
    { ...request, floor: 15 },
  )).toThrow(expect.objectContaining({ code: 'PVE_INVALID_FLOOR' }));
});
