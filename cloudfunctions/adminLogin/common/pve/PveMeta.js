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
} = require('../db');

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
