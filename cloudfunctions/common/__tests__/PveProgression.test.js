const mockUpdate = jest.fn();
const mockDoc = jest.fn(() => ({ update: mockUpdate }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));
const mockGetUserById = jest.fn();

jest.mock('../db', () => ({
  getDb: () => ({ collection: mockCollection }),
  getUserById: mockGetUserById,
  serverDate: () => 'SERVER_DATE',
}));

const { PROFILE_VERSION, createDefaultProfile } = require('../pve/PveProfile');
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
    expect(mockCollection).toHaveBeenCalledWith('users');
    expect(mockDoc).toHaveBeenCalledWith('doc1');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  test('does not rewrite an existing current-version profile on load', async () => {
    const existing = createDefaultProfile(100);
    mockGetUserById.mockResolvedValue({ _id: 'doc2', id: 'u2', pveProfile: existing });
    const { profile } = await loadProfile({ id: 'u2' });
    expect(profile.version).toBe(PROFILE_VERSION);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('migrates legacy root stamina into the current profile once', async () => {
    const current = createDefaultProfile(100);
    delete current.stamina;
    delete current.staminaUpdatedAt;
    delete current.staminaNextRecoveryAt;
    delete current.tutorialFreeChallengeConsumed;
    const now = Date.now();
    mockGetUserById.mockResolvedValue({
      _id: 'doc-stamina',
      id: 'u-stamina',
      pveProfile: current,
      pveStamina: 12,
      pveStaminaUpdatedAt: now,
      pveFirstRunStarted: true,
    });
    const { profile } = await loadProfile({ id: 'u-stamina' });
    expect(profile).toMatchObject({
      stamina: 12,
      tutorialFreeChallengeConsumed: true,
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
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
    expect(mockUpdate).toHaveBeenCalledTimes(1);

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
