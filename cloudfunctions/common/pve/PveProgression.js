const { COLLECTIONS } = require('../constants');
const { getDb, getUserById, serverDate } = require('../db');
const { PROFILE_VERSION, normalizeProfile } = require('./PveProfile');
const { beginTracking } = require('./PveMinghen');
const { PROFESSION_IDS } = require('./PveProfile');
const { validateMinghenLoadout, validateEquipmentLoadout } = require('./PveChallengeValidate');
const { validateLoadoutOwnership } = require('./PveChallengeState');
const { manageEquipment, saveMinghenPreset } = require('./PveCamp');

async function loadProfile(user) {
  const latest = await getUserById(user.id);
  if (!latest) {
    const err = new Error('USER_NOT_FOUND');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const now = Date.now();
  const current = latest.pveProfile;
  const profile = normalizeProfile(current, now, latest);
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(current ?? {}, key);
  const shouldPersist = current?.version !== PROFILE_VERSION
    || !Number.isFinite(current?.stamina)
    || !Number.isFinite(current?.staminaUpdatedAt)
    || !hasOwn('staminaNextRecoveryAt')
    || typeof current?.tutorialFreeChallengeConsumed !== 'boolean'
    || current.stamina !== profile.stamina;
  if (shouldPersist) {
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
  // 进行中的楼层挑战使用开局快照锁定装配；营地改的是永久档案，供下一次开局/下一层使用。
  // 允许挑战中调整命痕/装备/职业，避免回营后无法改配。
  const professionId = request.selectedProfessionId ?? profile.selectedProfessionId;
  if (!PROFESSION_IDS.includes(professionId) || profile.professions[professionId]?.unlocked !== true) { const err = new Error('职业尚未解锁'); err.code = 'PVE_PROFESSION_LOCKED'; throw err; }
  const minghenLoadout = request.minghenLoadout == null ? profile.minghenLoadout : validateMinghenLoadout(request.minghenLoadout);
  const equipmentLoadout = request.equipmentLoadout == null ? profile.equipmentLoadout : validateEquipmentLoadout(request.equipmentLoadout);
  validateLoadoutOwnership(profile, { minghenLoadout, equipmentLoadout });
  const next = { ...profile, selectedProfessionId: professionId, minghenLoadout, equipmentLoadout, updatedAt: Date.now() };
  await getDb().collection(COLLECTIONS.USERS).doc(latest._id).update({ data: { pveProfile: next } });
  return { profile: next };
}

async function manageCamp(user, request = {}) {
  const latest = await getUserById(user.id);
  if (!latest) { const err = new Error('USER_NOT_FOUND'); err.code = 'USER_NOT_FOUND'; throw err; }
  const profile = normalizeProfile(latest.pveProfile);
  let next;
  if (request.type === 'EQUIPMENT') next = manageEquipment(profile, request);
  else if (request.type === 'SAVE_MINGHEN_PRESET') next = saveMinghenPreset(profile, request);
  else { const err = new Error('未知营地操作'); err.code = 'PVE_INVALID_CAMP_ACTION'; throw err; }
  next = { ...next, updatedAt: Date.now() };
  await getDb().collection(COLLECTIONS.USERS).doc(latest._id).update({ data: { pveProfile: next } });
  return { profile: next };
}

module.exports = {
  loadProfile,
  startMinghenTracking,
  updateCampConfiguration,
  manageCamp,
};
