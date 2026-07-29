const { COLLECTIONS } = require('../constants');
const { getDb, getUserById, runTransactionWithRetry } = require('../db');
const { normalizeProfile } = require('./PveProfile');
const { consumeForFloorChallenge } = require('./PveStamina');
const { grantStarterPartnerOnProfile } = require('./PvePartner');
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
  return runTransactionWithRetry(async (transaction) => {
    const userRef = transaction.collection(COLLECTIONS.USERS).doc(user._id);
    const userResult = await userRef.get();
    const userDoc = dataOf(userResult);
    if (!userDoc) {
      const err = new Error('USER_NOT_FOUND');
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const now = Date.now();
    let profile = normalizeProfile(userDoc.pveProfile, now);
    // 第 1 层挑战：progressive 档发放位移伙伴并写入档案，再校验快照。
    if (Number(rawRequest.floor) === 1 && profile.partnerUnlockScheme !== 'legacy') {
      const granted = grantStarterPartnerOnProfile(profile);
      profile = granted.profile;
    }
    const request = validateStartFloorChallengeRequest(profile, rawRequest);
    validateLoadoutOwnership(profile, request);

    let activeToWithdraw = null;
    let challengeRequest = request;
    if (profile.activeChallengeId) {
      const activeRef = transaction.collection(COLLECTIONS.PVE_CHALLENGES).doc(profile.activeChallengeId);
      let active = null;
      try {
        active = dataOf(await activeRef.get());
      } catch (_err) {
        active = null;
      }
      if (active?.status === 'ACTIVE') {
        const matchesActive = requestMatchesChallenge(request, active);
        if (matchesActive && request.forceRestart !== true) {
          return { challenge: active, profile, resume: true, charged: 0 };
        }
        const err = new Error('已有不同配置的进行中挑战');
        if (request.abandonActive === true && request.forceRestart === true
          && request.floor === active.floor && request.mode === active.mode) {
          activeToWithdraw = activeRef;
          challengeRequest = {
            ...request,
            professionId: active.config.professionId,
            equipmentLoadout: active.config.equipmentLoadout || {},
            minghenLoadout: active.config.minghenLoadout || [],
            trackedMinghenId: active.config.trackedMinghenId ?? null,
            partnerId: active.config.partnerId ?? null,
            partnerEvolutionStage: active.config.partnerEvolutionStage ?? 1,
            partnerLevel: active.config.partnerLevel ?? 1,
          };
        } else if (request.abandonActive === true && request.forceRestart !== true) {
          activeToWithdraw = activeRef;
        } else {
          err.code = 'PVE_CHALLENGE_ALREADY_ACTIVE';
          throw err;
        }
      }
    }

    const freeEligible = challengeRequest.floor === 1
      && challengeRequest.mode === 'PROGRESSION'
      && profile.tutorialFreeChallengeConsumed !== true;
    const consumed = challengeRequest.forceRestart === true && activeToWithdraw
      ? {
        stamina: profile.stamina,
        tutorialFreeChallengeConsumed: profile.tutorialFreeChallengeConsumed,
        charged: 0,
      }
      : consumeForFloorChallenge(profile, freeEligible);
    const chargedProfile = {
      ...profile,
      stamina: consumed.stamina,
      tutorialFreeChallengeConsumed: consumed.tutorialFreeChallengeConsumed,
    };
    const challenge = buildChallenge(user.id, challengeRequest, now);
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
  return runTransactionWithRetry(async (transaction) => {
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
  return runTransactionWithRetry(async (transaction) => {
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
