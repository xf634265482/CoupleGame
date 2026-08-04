const mockStores = {
  users: new Map(),
  pve_challenges: new Map(),
};

function mockClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function hasUndefined(value) {
  if (Array.isArray(value)) return value.some(hasUndefined);
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some((entry) => entry === undefined || hasUndefined(entry));
}

function ref(collectionName, id) {
  return {
    async get() {
      const value = mockStores[collectionName].get(id);
      if (!value) throw new Error('NOT_FOUND');
      return { data: { _id: id, ...mockClone(value) } };
    },
    async set({ data }) {
      mockStores[collectionName].set(id, mockClone(data));
    },
    async update({ data }) {
      if (Object.prototype.hasOwnProperty.call(data, '_id') || hasUndefined(data)) {
        throw new Error('document.update:fail -501007 invalid parameters');
      }
      const current = mockStores[collectionName].get(id) ?? {};
      const next = { ...current };
      for (const [key, val] of Object.entries(data)) {
        if (val && typeof val === 'object' && val.__cmd === 'set') {
          next[key] = mockClone(val.value);
        } else {
          next[key] = mockClone(val);
        }
      }
      mockStores[collectionName].set(id, next);
    },
  };
}

const mockDb = {
  command: {
    set(value) {
      return { __cmd: 'set', value };
    },
  },
  collection(name) {
    return { doc: (id) => ref(name, id) };
  },
  async runTransaction(callback) {
    return callback({ collection: (name) => ({ doc: (id) => ref(name, id) }) });
  },
};

jest.mock('../db', () => ({
  getDb: () => mockDb,
  getUserById: async (userId) => {
    for (const value of mockStores.users.values()) {
      if (value.id === userId) return mockClone(value);
    }
    return null;
  },
  runTransactionWithRetry: async (handler) => mockDb.runTransaction(handler),
}));

const { createDefaultProfile } = require('../pve/PveProfile');
const {
  startFloorChallenge,
  loadActiveFloorChallenge,
  saveFloorChallengeRuntime,
  settleFloorChallenge,
} = require('../pve/PveChallenge');

function startRequest() {
  return {
    floor: 1,
    mode: 'PROGRESSION',
    professionId: 'WARRIOR',
    equipmentLoadout: {},
    minghenLoadout: [],
  };
}

describe('PveChallenge service', () => {
  beforeEach(() => {
    mockStores.users.clear();
    mockStores.pve_challenges.clear();
    mockStores.users.set('doc1', { _id: 'doc1', id: 'u1', pveProfile: createDefaultProfile(1) });
  });

  test('starts and resumes an identical active challenge', async () => {
    const user = { _id: 'doc1', id: 'u1' };
    const first = await startFloorChallenge(user, startRequest());
    const retry = await startFloorChallenge(user, startRequest());
    expect(first.resume).toBe(false);
    expect(retry.resume).toBe(true);
    expect(retry.challenge.challengeId).toBe(first.challenge.challengeId);
    expect(mockStores.pve_challenges.size).toBe(1);
  });

  test('first tutorial challenge is free and retrying the active challenge stays free', async () => {
    const user = { _id: 'doc1', id: 'u1' };
    const first = await startFloorChallenge(user, startRequest());
    const retry = await startFloorChallenge(user, startRequest());
    expect(first).toMatchObject({ resume: false, charged: 0 });
    expect(first.profile).toMatchObject({
      stamina: 60,
      tutorialFreeChallengeConsumed: true,
    });
    expect(retry).toMatchObject({ resume: true, charged: 0 });
    expect(retry.profile.stamina).toBe(60);
  });

  test('charges five for a new paid challenge', async () => {
    const user = { _id: 'doc1', id: 'u1' };
    mockStores.users.get('doc1').pveProfile = {
      ...createDefaultProfile(1),
      stamina: 12,
      staminaUpdatedAt: Date.now(),
      tutorialFreeChallengeConsumed: true,
    };
    const result = await startFloorChallenge(user, startRequest());
    expect(result).toMatchObject({ resume: false, charged: 5 });
    expect(result.profile.stamina).toBe(7);
    expect(mockStores.users.get('doc1').pveProfile.stamina).toBe(7);
  });

  test('insufficient stamina keeps the previous active challenge untouched', async () => {
    const user = { _id: 'doc1', id: 'u1' };
    const profile = createDefaultProfile(1);
    profile.highestUnlockedFloor = 2;
    profile.highestClearedFloor = 1;
    profile.tutorialFreeChallengeConsumed = true;
    profile.stamina = 5;
    profile.staminaUpdatedAt = Date.now();
    mockStores.users.get('doc1').pveProfile = profile;
    const active = await startFloorChallenge(user, { ...startRequest(), floor: 2 });
    mockStores.users.get('doc1').pveProfile.stamina = 4;
    mockStores.users.get('doc1').pveProfile.staminaUpdatedAt = Date.now();
    await expect(startFloorChallenge(user, {
      ...startRequest(),
      floor: 1,
      abandonActive: true,
    })).rejects.toMatchObject({ code: 'PVE_STAMINA_INSUFFICIENT' });
    expect(mockStores.pve_challenges.get(active.challenge.challengeId).status).toBe('ACTIVE');
    expect(mockStores.users.get('doc1').pveProfile.activeChallengeId).toBe(active.challenge.challengeId);
  });

  test('rejects a different request while a challenge is active', async () => {
    const user = { _id: 'doc1', id: 'u1' };
    await startFloorChallenge(user, startRequest());
    await expect(startFloorChallenge(user, {
      ...startRequest(),
      minghenLoadout: [],
      equipmentLoadout: {},
      trackedMinghenId: 'M01',
    })).rejects.toMatchObject({ code: 'PVE_CHALLENGE_ALREADY_ACTIVE' });
  });

  test('can abandon a different active challenge when starting an explicitly selected floor', async () => {
    const user = { _id: 'doc1', id: 'u1' };
    mockStores.users.set('doc1', {
      _id: 'doc1',
      id: 'u1',
      pveProfile: {
        ...createDefaultProfile(1),
        highestUnlockedFloor: 4,
        highestClearedFloor: 3,
      },
    });
    const active = await startFloorChallenge(user, { ...startRequest(), floor: 4 });
    const selected = await startFloorChallenge(user, { ...startRequest(), floor: 1, abandonActive: true });
    expect(selected.resume).toBe(false);
    expect(selected.challenge.floor).toBe(1);
    expect(selected.challenge.challengeId).not.toBe(active.challenge.challengeId);
    expect(mockStores.pve_challenges.get(active.challenge.challengeId).status).toBe('WITHDRAW');
    expect(mockStores.users.get('doc1').pveProfile.activeChallengeId).toBe(selected.challenge.challengeId);
  });

  test('loads the active challenge', async () => {
    const user = { _id: 'doc1', id: 'u1' };
    const started = await startFloorChallenge(user, startRequest());
    const loaded = await loadActiveFloorChallenge(user);
    expect(loaded.challenge.challengeId).toBe(started.challenge.challengeId);
  });

  test('settles once and returns the stored terminal result on retry', async () => {
    const user = { _id: 'doc1', id: 'u1' };
    const started = await startFloorChallenge(user, startRequest());
    const request = {
      challengeId: started.challenge.challengeId,
      status: 'CLEAR',
      clearTurns: 9,
      completedOptionalObjectiveIds: [],
    };
    const first = await settleFloorChallenge(user, request);
    const retry = await settleFloorChallenge(user, request);
    expect(first.idempotent).toBe(false);
    expect(retry.idempotent).toBe(true);
    expect(retry.challenge.status).toBe('CLEAR');
    expect(mockStores.users.get('doc1').pveProfile.highestUnlockedFloor).toBe(2);
    expect(mockStores.users.get('doc1').pveProfile.highestClearedFloor).toBe(1);
    expect(mockStores.users.get('doc1').pveProfile.highestClearedAt).toEqual(expect.any(Number));
    expect(retry.profile.highestClearedAt).toBe(first.profile.highestClearedAt);
    expect(mockStores.users.get('doc1').pveProfile.floorRecords['1'].clearCount).toBe(1);
    expect(first.rewards).toMatchObject({ gold: 20, firstClear: true });
    expect(retry.rewards).toEqual(first.rewards);
  });

  test('atomically grants selected Minghen only once', async () => {
    const user = { _id: 'doc1', id: 'u1' };
    const started = await startFloorChallenge(user, startRequest());
    const request = { challengeId: started.challenge.challengeId, status: 'CLEAR', clearTurns: 8, completedOptionalObjectiveIds: [], selectedMinghenId: 'M05', professionHighlightCount: 2 };
    const first = await settleFloorChallenge(user, request);
    const retry = await settleFloorChallenge(user, request);
    expect(first.profile.minghenCollection.M05).toMatchObject({ copies: 1, level: 1 });
    expect(first.profile.equipmentInventory).toHaveLength(0);
    expect(first.profile.professions.WARRIOR.xp).toBe(150);
    expect(retry.profile.equipmentInventory).toHaveLength(0);
  });

  test('saves runtime idempotently and rejects turn rollback', async () => {
    const user = { _id: 'doc1', id: 'u1' };
    const started = await startFloorChallenge(user, startRequest());
    const runtime = {
      version: 1,
      challengeId: started.challenge.challengeId,
      floor: started.challenge.floor,
      seed: started.challenge.seed,
      status: 'ACTIVE',
      config: started.challenge.config,
      turn: 4,
    };
    const request = {
      challengeId: started.challenge.challengeId,
      serializedRuntime: JSON.stringify({ version: 1, runtime }),
    };
    const first = await saveFloorChallengeRuntime(user, request);
    const retry = await saveFloorChallengeRuntime(user, request);
    expect(first.idempotent).toBe(false);
    expect(retry.idempotent).toBe(true);
    expect((await loadActiveFloorChallenge(user)).challenge.runtimeTurn).toBe(4);

    const older = {
      ...runtime,
      turn: 3,
    };
    await expect(saveFloorChallengeRuntime(user, {
      challengeId: started.challenge.challengeId,
      serializedRuntime: JSON.stringify({ version: 1, runtime: older }),
    })).rejects.toMatchObject({ code: 'PVE_RUNTIME_TURN_ROLLBACK' });
  });

  test('accepts V2 and allows its one-time rebuilt turn to replace V1 only once', async () => {
    const user = { _id: 'doc1', id: 'u1' };
    const started = await startFloorChallenge(user, startRequest());
    const base = {
      challengeId: started.challenge.challengeId,
      floor: started.challenge.floor,
      seed: started.challenge.seed,
      status: 'ACTIVE',
      config: started.challenge.config,
    };
    await saveFloorChallengeRuntime(user, {
      challengeId: started.challenge.challengeId,
      serializedRuntime: JSON.stringify({ version: 1, runtime: { ...base, version: 1, turn: 6 } }),
    });
    const migrated = await saveFloorChallengeRuntime(user, {
      challengeId: started.challenge.challengeId,
      serializedRuntime: JSON.stringify({ version: 2, runtime: { ...base, version: 2, turn: 1 } }),
    });
    expect(migrated.challenge.runtimeVersion).toBe(2);
    expect(migrated.challenge.runtimeTurn).toBe(1);
    await expect(saveFloorChallengeRuntime(user, {
      challengeId: started.challenge.challengeId,
      serializedRuntime: JSON.stringify({ version: 2, runtime: { ...base, version: 2, turn: 0 } }),
    })).rejects.toMatchObject({ code: 'PVE_INVALID_RUNTIME_TURN' });
    await saveFloorChallengeRuntime(user, {
      challengeId: started.challenge.challengeId,
      serializedRuntime: JSON.stringify({ version: 2, runtime: { ...base, version: 2, turn: 3 } }),
    });
    await expect(saveFloorChallengeRuntime(user, {
      challengeId: started.challenge.challengeId,
      serializedRuntime: JSON.stringify({ version: 2, runtime: { ...base, version: 2, turn: 2 } }),
    })).rejects.toMatchObject({ code: 'PVE_RUNTIME_TURN_ROLLBACK' });
  });

  test('can settle floors one and two with rewards then start floor three', async () => {
    const user = { _id: 'doc1', id: 'u1' };
    const first = await startFloorChallenge(user, startRequest());
    await settleFloorChallenge(user, {
      challengeId: first.challenge.challengeId,
      status: 'CLEAR',
      clearTurns: 8,
      completedOptionalObjectiveIds: [],
      selectedMinghenId: 'M05',
    });
    const second = await startFloorChallenge(user, { ...startRequest(), floor: 2 });
    const settledSecond = await settleFloorChallenge(user, {
      challengeId: second.challenge.challengeId,
      status: 'CLEAR',
      clearTurns: 10,
      completedOptionalObjectiveIds: [],
      selectedMinghenId: 'M01',
    });
    expect(settledSecond.profile.activeChallengeId).toBeNull();
    expect(settledSecond.profile.highestUnlockedFloor).toBe(3);
    const third = await startFloorChallenge(user, { ...startRequest(), floor: 3 });
    expect(third.challenge.floor).toBe(3);
  });
});
