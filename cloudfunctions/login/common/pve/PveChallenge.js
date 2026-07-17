const { COLLECTIONS } = require('../constants');
const { getDb, getUserById } = require('../db');
const { normalizeProfile } = require('./PveProfile');
const { consumeForFloorChallenge } = require('./PveStamina');
const {
  validateStartFloorChallengeRequest,
  validateSettleFloorChallengeRequest,
  validateSaveFloorChallengeRuntimeRequest,
} = require('./PveChallengeValidate');
const {
  buildChallenge,
  requestMatchesChallenge,
  validateLoadoutOwnership,
  applyChallengeStart,
  applyChallengeSettlement,
} = require('./PveChallengeState');

function dataOf(result) {
  return result?.data ?? null;
}

function withoutUndefined(value) {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, withoutUndefined(entry)]),
  );
}

function writableDocument(data) {
  if (!data || typeof data !== 'object') return data;
  const { _id, ...writable } = data;
  return withoutUndefined(writable);
}

async function getChallengeById(challengeId) {
  try {
    const result = await getDb().collection(COLLECTIONS.PVE_CHALLENGES).doc(challengeId).get();
    return dataOf(result);
  } catch (_err) {
    return null;
  }
}

async function loadActiveFloorChallenge(user) {
  const latest = await getUserById(user.id);
  if (!latest) {
    const err = new Error('USER_NOT_FOUND');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  const profile = normalizeProfile(latest.pveProfile);
  if (!profile.activeChallengeId) return { challenge: null };
  const challenge = await getChallengeById(profile.activeChallengeId);
  if (!challenge || challenge.userId !== user.id || challenge.status !== 'ACTIVE') {
    await getDb().collection(COLLECTIONS.USERS).doc(latest._id).update({
      data: {
        pveProfile: { ...profile, activeChallengeId: null, updatedAt: Date.now() },
      },
    });
    return { challenge: null };
  }
  return { challenge };
}

async function startFloorChallenge(user, rawRequest = {}) {
  const db = getDb();
  return db.runTransaction(async (transaction) => {
    const userRef = transaction.collection(COLLECTIONS.USERS).doc(user._id);
    const userResult = await userRef.get();
    const userDoc = dataOf(userResult);
    if (!userDoc) {
      const err = new Error('USER_NOT_FOUND');
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const now = Date.now();
    const profile = normalizeProfile(userDoc.pveProfile, now);
    const request = validateStartFloorChallengeRequest(profile, rawRequest);
    validateLoadoutOwnership(profile, request);

    let activeToWithdraw = null;
    if (profile.activeChallengeId) {
      const activeRef = transaction.collection(COLLECTIONS.PVE_CHALLENGES).doc(profile.activeChallengeId);
      let active = null;
      try {
        active = dataOf(await activeRef.get());
      } catch (_err) {
        active = null;
      }
      if (active?.status === 'ACTIVE') {
        if (requestMatchesChallenge(request, active)) {
          return { challenge: active, profile, resume: true, charged: 0 };
        }
        const err = new Error('已有不同配置的进行中挑战');
        if (request.abandonActive === true) {
          activeToWithdraw = activeRef;
        } else {
          err.code = 'PVE_CHALLENGE_ALREADY_ACTIVE';
          throw err;
        }
      }
    }

    const freeEligible = request.floor === 1
      && request.mode === 'PROGRESSION'
      && profile.tutorialFreeChallengeConsumed !== true;
    const consumed = consumeForFloorChallenge(profile, freeEligible);
    const chargedProfile = {
      ...profile,
      stamina: consumed.stamina,
      tutorialFreeChallengeConsumed: consumed.tutorialFreeChallengeConsumed,
    };
    const challenge = buildChallenge(user.id, request, now);
    const nextProfile = applyChallengeStart(chargedProfile, challenge, now);
    if (activeToWithdraw) {
      await activeToWithdraw.update({
        data: {
          status: 'WITHDRAW',
          result: {
            status: 'WITHDRAW',
            completedOptionalObjectiveIds: [],
          },
          updatedAt: now,
        },
      });
    }
    await transaction.collection(COLLECTIONS.PVE_CHALLENGES).doc(challenge.challengeId).set({
      data: challenge,
    });
    await userRef.update({ data: { pveProfile: nextProfile } });
    return { challenge, profile: nextProfile, resume: false, charged: consumed.charged };
  });
}

async function settleFloorChallenge(user, rawRequest = {}) {
  const request = validateSettleFloorChallengeRequest(rawRequest);
  const db = getDb();
  return db.runTransaction(async (transaction) => {
    const userRef = transaction.collection(COLLECTIONS.USERS).doc(user._id);
    const challengeRef = transaction.collection(COLLECTIONS.PVE_CHALLENGES).doc(request.challengeId);
    const [userResult, challengeResult] = await Promise.all([userRef.get(), challengeRef.get()]);
    const userDoc = dataOf(userResult);
    const challenge = dataOf(challengeResult);
    if (!userDoc) {
      const err = new Error('USER_NOT_FOUND');
      err.code = 'USER_NOT_FOUND';
      throw err;
    }
    if (!challenge) {
      const err = new Error('PVE_CHALLENGE_NOT_FOUND');
      err.code = 'PVE_CHALLENGE_NOT_FOUND';
      throw err;
    }
    if (challenge.userId !== user.id) {
      const err = new Error('挑战不属于当前用户');
      err.code = 'PVE_CHALLENGE_FORBIDDEN';
      throw err;
    }

    const profile = normalizeProfile(userDoc.pveProfile);
    if (challenge.status !== 'ACTIVE') {
      return {
        challenge,
        profile,
        rewards: challenge.rewards ?? {},
        idempotent: true,
      };
    }
    if (profile.activeChallengeId !== challenge.challengeId) {
      const err = new Error('活跃挑战指针不一致');
      err.code = 'PVE_ACTIVE_CHALLENGE_MISMATCH';
      throw err;
    }

    const settled = applyChallengeSettlement(profile, challenge, request, Date.now());
    await challengeRef.update({ data: writableDocument(settled.challenge) });
    await userRef.update({ data: { pveProfile: withoutUndefined(settled.profile) } });
    return { ...settled, idempotent: false };
  });
}

async function saveFloorChallengeRuntime(user, rawRequest = {}) {
  const request = validateSaveFloorChallengeRuntimeRequest(rawRequest);
  const db = getDb();
  return db.runTransaction(async (transaction) => {
    const challengeRef = transaction.collection(COLLECTIONS.PVE_CHALLENGES).doc(request.challengeId);
    const challenge = dataOf(await challengeRef.get());
    if (!challenge) {
      const err = new Error('PVE_CHALLENGE_NOT_FOUND');
      err.code = 'PVE_CHALLENGE_NOT_FOUND';
      throw err;
    }
    if (challenge.userId !== user.id) {
      const err = new Error('挑战不属于当前用户');
      err.code = 'PVE_CHALLENGE_FORBIDDEN';
      throw err;
    }
    if (challenge.status !== 'ACTIVE') {
      const err = new Error('只能保存进行中的挑战');
      err.code = 'PVE_CHALLENGE_NOT_ACTIVE';
      throw err;
    }
    if (request.runtime.challengeId !== challenge.challengeId
      || request.runtime.floor !== challenge.floor
      || request.runtime.seed !== challenge.seed
      || JSON.stringify(request.runtime.config) !== JSON.stringify(challenge.config)) {
      const err = new Error('运行态与云端挑战快照不一致');
      err.code = 'PVE_RUNTIME_SNAPSHOT_MISMATCH';
      throw err;
    }
    let storedRuntimeVersion = challenge.runtimeVersion;
    if (!Number.isInteger(storedRuntimeVersion) && typeof challenge.runtimeSave === 'string') {
      try {
        storedRuntimeVersion = JSON.parse(challenge.runtimeSave)?.version;
      } catch (_err) {
        storedRuntimeVersion = undefined;
      }
    }
    const replacingKnownV1WithV2 = storedRuntimeVersion === 1 && request.version === 2;
    if (Number.isInteger(challenge.runtimeTurn) && request.turn < challenge.runtimeTurn && !replacingKnownV1WithV2) {
      const err = new Error('旧回合存档不能覆盖新回合');
      err.code = 'PVE_RUNTIME_TURN_ROLLBACK';
      throw err;
    }
    if (challenge.runtimeSave === request.serializedRuntime) {
      return { challenge, idempotent: true };
    }
    const now = Date.now();
    const patch = {
      runtimeSave: request.serializedRuntime,
      runtimeTurn: request.turn,
      runtimeVersion: request.version,
      runtimeSavedAt: now,
      updatedAt: now,
    };
    const next = { ...challenge, ...patch };
    await challengeRef.update({ data: writableDocument(patch) });
    return { challenge: next, idempotent: false };
  });
}

module.exports = {
  getChallengeById,
  loadActiveFloorChallenge,
  startFloorChallenge,
  saveFloorChallengeRuntime,
  settleFloorChallenge,
};
