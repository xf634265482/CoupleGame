const { COLLECTIONS } = require('../constants');
const { getDb, getUserById, serverDate } = require('../db');
const { PROFILE_VERSION, normalizeProfile } = require('./PveProfile');

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

module.exports = {
  loadProfile,
};
