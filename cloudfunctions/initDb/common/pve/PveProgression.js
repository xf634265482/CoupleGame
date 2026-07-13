const { COLLECTIONS } = require('../constants');
const { getDb, getUserById, serverDate } = require('../db');
const { PROFILE_VERSION, normalizeProfile } = require('./PveProfile');
const { beginTracking } = require('./PveMinghen');
const { PROFESSION_IDS } = require('./PveProfile');
const { validateMinghenLoadout, validateEquipmentLoadout } = require('./PveChallengeValidate');
const { validateLoadoutOwnership } = require('./PveChallengeState');

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

async function updateCampConfiguration(user, request = {}) {
  const latest = await getUserById(user.id);
  if (!latest) { const err = new Error('USER_NOT_FOUND'); err.code = 'USER_NOT_FOUND'; throw err; }
  const profile = normalizeProfile(latest.pveProfile);
  if (profile.activeChallengeId) { const err = new Error('挑战中不能调整营地配置'); err.code = 'PVE_CAMP_CONFIG_LOCKED'; throw err; }
  const professionId = request.selectedProfessionId ?? profile.selectedProfessionId;
  if (!PROFESSION_IDS.includes(professionId) || profile.professions[professionId]?.unlocked !== true) { const err = new Error('职业尚未解锁'); err.code = 'PVE_PROFESSION_LOCKED'; throw err; }
  const minghenLoadout = request.minghenLoadout == null ? profile.minghenLoadout : validateMinghenLoadout(request.minghenLoadout);
  const equipmentLoadout = request.equipmentLoadout == null ? profile.equipmentLoadout : validateEquipmentLoadout(request.equipmentLoadout);
  validateLoadoutOwnership(profile, { minghenLoadout, equipmentLoadout });
  const next = { ...profile, selectedProfessionId: professionId, minghenLoadout, equipmentLoadout, updatedAt: Date.now() };
  await getDb().collection(COLLECTIONS.USERS).doc(latest._id).update({ data: { pveProfile: next } });
  return { profile: next };
}

module.exports = {
  loadProfile,
  startMinghenTracking,
  updateCampConfiguration,
};
