const { COLLECTIONS } = require('../constants');
const { getDb, getUserById, serverDate } = require('../db');
const { PROFILE_VERSION, normalizeProfile } = require('./PveProfile');
const { beginTracking } = require('./PveMinghen');

async function loadProfile(user) {
  const latest = await getUserById(user.id);
  if (!latest) {
    const err = new Error('USER_NOT_FOUND');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const now = Date.now();
  const shouldReset = latest.pveProfile?.version !== PROFILE_VERSION;
  const profile = normalizeProfile(latest.pveProfile, now);
  if (shouldReset) {
    await getDb().collection(COLLECTIONS.USERS).doc(latest._id).update({
      data: {
        pveProfile: profile,
        updatedDate: serverDate(),
      },
    });
  }
  return { profile };
}

async function startMinghenTracking(user, request = {}) {
  const floor = Number(request.floor);
  const minghenId = request.minghenId;
  if (!Number.isInteger(floor) || floor < 1 || floor > 35 || typeof minghenId !== 'string' || !minghenId) {
    const err = new Error('命痕追踪请求不合法'); err.code = 'PVE_INVALID_TRACKING_REQUEST'; throw err;
  }
  const latest = await getUserById(user.id);
  if (!latest) { const err = new Error('USER_NOT_FOUND'); err.code = 'USER_NOT_FOUND'; throw err; }
  const profile = normalizeProfile(latest.pveProfile);
  if (floor > profile.highestClearedFloor) { const err = new Error('只能追踪已通关楼层'); err.code = 'PVE_TRACKING_FLOOR_LOCKED'; throw err; }
  if (profile.activeChallengeId) { const err = new Error('挑战中不能切换追踪'); err.code = 'PVE_CHALLENGE_ALREADY_ACTIVE'; throw err; }
  const next = { ...beginTracking(profile, floor, minghenId), updatedAt: Date.now() };
  await getDb().collection(COLLECTIONS.USERS).doc(latest._id).update({ data: { pveProfile: next } });
  return { profile: next };
}

module.exports = {
  loadProfile,
  startMinghenTracking,
};
