const mockUpdate = jest.fn();
const mockDoc = jest.fn(() => ({ update: mockUpdate }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));
const mockGetUserById = jest.fn();
const mockUpdateUserPveProfile = jest.fn();

jest.mock('../db', () => ({
  getDb: () => ({ collection: mockCollection }),
  getUserById: mockGetUserById,
  serverDate: () => 'SERVER_DATE',
  updateUserPveProfile: (...args) => mockUpdateUserPveProfile(...args),
}));

const { PROFILE_VERSION, createDefaultProfile } = require('../pve/PveProfile');
const { ensureDailyShop } = require('../pve/PveMinghenShop');
const { loadProfile, updateCampConfiguration } = require('../pve/PveProgression');

describe('PveProgression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates and persists a versioned profile for an old test user', async () => {
    mockGetUserById.mockResolvedValue({ _id: 'doc1', id: 'u1', pveProfile: { version: 0 } });
    const { profile } = await loadProfile({ id: 'u1' });
    expect(profile.version).toBe(PROFILE_VERSION);
    expect(profile.highestUnlockedFloor).toBe(1);
    expect(mockUpdateUserPveProfile).toHaveBeenCalledTimes(1);
    expect(mockUpdateUserPveProfile.mock.calls[0][0]).toBe('doc1');
    expect(mockUpdateUserPveProfile.mock.calls[0][1].minghenDailyShop).toMatchObject({
      adRefreshUsed: 0,
    });
  });

  test('persists shop when minghenDailyShop was null (cleared profile)', async () => {
    const cleared = createDefaultProfile(1);
    expect(cleared.minghenDailyShop).toBeNull();
    mockGetUserById.mockResolvedValue({ _id: 'doc-clear', id: 'u-clear', pveProfile: cleared });
    const { profile } = await loadProfile({ id: 'u-clear' });
    expect(profile.minghenDailyShop).toBeTruthy();
    expect(profile.minghenDailyShop.adRefreshUsed).toBe(0);
    expect(mockUpdateUserPveProfile).toHaveBeenCalledTimes(1);
    const saved = mockUpdateUserPveProfile.mock.calls[0][1];
    expect(saved.minghenDailyShop).toEqual(profile.minghenDailyShop);
  });

  test('does not rewrite an existing current-version profile on load', async () => {
    const existing = ensureDailyShop(createDefaultProfile(100), 'u2', Date.now());
    mockGetUserById.mockResolvedValue({ _id: 'doc2', id: 'u2', pveProfile: existing });
    const { profile } = await loadProfile({ id: 'u2' });
    expect(profile.version).toBe(PROFILE_VERSION);
    expect(profile.partnerUnlockScheme).toBe('progressive');
    expect(mockUpdateUserPveProfile).not.toHaveBeenCalled();
  });

  test('rejects a missing user', async () => {
    mockGetUserById.mockResolvedValue(null);
    await expect(loadProfile({ id: 'missing' })).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  test('updates camp configuration even while a floor challenge is active', async () => {
    const profile = createDefaultProfile(100);
    profile.professions.ARCHER = { ...profile.professions.ARCHER, unlocked: true, xp: 150, level: 2 };
    profile.minghenCollection = { M01: { id: 'M01', level: 1, copies: 1, trialCompleted: false } };
    mockGetUserById.mockResolvedValue({ _id: 'doc3', id: 'u3', pveProfile: profile });
    const result = await updateCampConfiguration({ id: 'u3' }, { selectedProfessionId: 'ARCHER' });
    expect(result.profile.selectedProfessionId).toBe('ARCHER');
    expect(mockUpdateUserPveProfile).toHaveBeenCalledTimes(1);

    mockGetUserById.mockResolvedValue({
      _id: 'doc3',
      id: 'u3',
      pveProfile: { ...profile, activeChallengeId: 'c1', selectedProfessionId: 'ARCHER' },
    });
    const duringChallenge = await updateCampConfiguration(
      { id: 'u3' },
      { minghenLoadout: [{ id: 'M01', level: 1 }] },
    );
    expect(duringChallenge.profile.minghenLoadout).toEqual([{ id: 'M01', level: 1 }]);
    expect(duringChallenge.profile.activeChallengeId).toBe('c1');
  });
});
