const mockStores = {
  users: new Map(),
  pve_challenges: new Map(),
};

function mockClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function ref(collectionName, id) {
  return {
    async get() {
      const value = mockStores[collectionName].get(id);
      if (!value) throw new Error('NOT_FOUND');
      return { data: mockClone(value) };
    },
    async set({ data }) {
      mockStores[collectionName].set(id, mockClone(data));
    },
    async update({ data }) {
      const current = mockStores[collectionName].get(id) ?? {};
      mockStores[collectionName].set(id, { ...current, ...mockClone(data) });
    },
  };
}

const mockDb = {
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
      completedOptionalObjectiveIds: ['F1_FULL_SEARCH'],
    };
    const first = await settleFloorChallenge(user, request);
    const retry = await settleFloorChallenge(user, request);
    expect(first.idempotent).toBe(false);
    expect(retry.idempotent).toBe(true);
    expect(retry.challenge.status).toBe('CLEAR');
    expect(mockStores.users.get('doc1').pveProfile.highestUnlockedFloor).toBe(2);
    expect(mockStores.users.get('doc1').pveProfile.floorRecords['1'].clearCount).toBe(1);
    expect(first.rewards).toMatchObject({ gold: 30, firstClear: true });
    expect(retry.rewards).toEqual(first.rewards);
  });

  test('atomically grants selected fixed equipment and Minghen only once', async () => {
    const user = { _id: 'doc1', id: 'u1' };
    const started = await startFloorChallenge(user, startRequest());
    const request = { challengeId: started.challenge.challengeId, status: 'CLEAR', clearTurns: 8, completedOptionalObjectiveIds: [], selectedMinghenId: 'M05', selectedEquipmentDefinitionId: 'W01', professionHighlightCount: 2 };
    const first = await settleFloorChallenge(user, request);
    const retry = await settleFloorChallenge(user, request);
    expect(first.profile.minghenCollection.M05).toMatchObject({ copies: 1, level: 1 });
    expect(first.profile.equipmentInventory).toHaveLength(1);
    expect(first.profile.professions.WARRIOR.xp).toBe(150);
    expect(retry.profile.equipmentInventory).toHaveLength(1);
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
});
