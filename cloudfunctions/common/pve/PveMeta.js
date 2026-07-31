/**
 * PVE account meta read/write.
 *
 * Current meta responsibilities: tutorial flags, account currency,
 * stamina and balance snapshot.
 */
const {
  getUserPveMeta,
  updateUserPveMeta,
  listPveLeaderboard,
  getUserById,
  serverDate,
  updateUserPveProfile,
} = require('../db');
const { normalizeProfile } = require('./PveProfile');
const { grantStarterPartnerOnProfile } = require('./PvePartner');

function buildEmptyBalanceSnapshot() {
  return {
    globalConfig: {},
    chapterConfigs: {},
    unitConfigs: {},
  };
}

async function loadBalanceSnapshotSafe() {
  try {
    const { loadBalanceSnapshot } = require('./PveBalance');
    return await loadBalanceSnapshot();
  } catch (err) {
    console.error('[PveMeta] failed to load balance snapshot, fallback to empty snapshot:', err);
    return buildEmptyBalanceSnapshot();
  }
}

async function loadMeta(user) {
  const meta = await getUserPveMeta(user.id);
  return {
    meta,
    balanceSnapshot: await loadBalanceSnapshotSafe(),
  };
}

async function updateMeta(user, report = {}) {
  await updateUserPveMeta(user.id, {
    diamond: report.diamond ?? 0,
    tutorialCompleted: report.tutorialCompleted === true,
    resetTutorial: report.resetTutorial === true,
  });

  // 教程完成兜底：progressive 档发放位移伙伴（开局第 1 层也会发，此处幂等）。
  if (report.tutorialCompleted === true) {
    const latest = await getUserById(user.id);
    if (latest) {
      const profile = normalizeProfile(latest.pveProfile);
      if (profile.partnerUnlockScheme !== 'legacy') {
        const granted = grantStarterPartnerOnProfile(profile);
        if (granted.newlyUnlockedPartnerIds.length > 0
          || granted.profile.equippedPartnerId !== profile.equippedPartnerId) {
          await updateUserPveProfile(latest._id, granted.profile, { updatedDate: serverDate() });
        }
      }
    }
  }

  return { ok: true };
}

async function loadLeaderboard(user, limit) {
  const { entries, myRank } = await listPveLeaderboard(user.id, limit);
  return { entries, myRank };
}

module.exports = {
  loadMeta,
  updateMeta,
  loadLeaderboard,
};
