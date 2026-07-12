const cloud = require('wx-server-sdk');
const { resolveOpenId, requireUser } = require('./common/auth');
const { getUserByOpenId } = require('./common/db');
const { loadActiveSave, startRun, saveFloorProgress, settleExpedition } = require('./common/pve/PveSave');
const { loadProfile, startMinghenTracking } = require('./common/pve/PveProgression');
const {
  loadActiveFloorChallenge,
  saveFloorChallengeRuntime,
  startFloorChallenge,
  settleFloorChallenge,
} = require('./common/pve/PveChallenge');
const {
  loadMeta,
  updateMeta,
  unlockTreeNode,
  resetTreeNodes,
  loadLeaderboard,
} = require('./common/pve/PveMeta');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/** pve 云函数 → 命运远征存档与结算（design ddl-sql.md / AC-11, AC-14） */
exports.main = async (event = {}) => {
  try {
    const openId = resolveOpenId(cloud.getWXContext(), event);
    if (!openId) {
      return { ok: false, code: 'NO_OPENID', message: '无法获取 OPENID' };
    }

    const user = await requireUser(openId, getUserByOpenId);
    const { action } = event;

    if (action === 'loadProfile') {
      const { profile } = await loadProfile(user);
      return { ok: true, profile };
    }

    if (action === 'startMinghenTracking') {
      const result = await startMinghenTracking(user, event.request || {});
      return { ok: true, ...result };
    }

    if (action === 'startFloorChallenge') {
      const result = await startFloorChallenge(user, event.request || {});
      return { ok: true, ...result };
    }

    if (action === 'loadActiveFloorChallenge') {
      const { challenge } = await loadActiveFloorChallenge(user);
      return { ok: true, challenge };
    }

    if (action === 'saveFloorChallengeRuntime') {
      const result = await saveFloorChallengeRuntime(user, event.request || {});
      return { ok: true, ...result };
    }

    if (action === 'settleFloorChallenge') {
      const result = await settleFloorChallenge(user, event.request || {});
      return { ok: true, ...result };
    }

    if (action === 'loadSave') {
      const { save } = await loadActiveSave(user);
      return { ok: true, save };
    }

    if (action === 'startRun') {
      const result = await startRun(user);
      return { ok: true, ...result };
    }

    if (action === 'saveFloor') {
      const { save } = await saveFloorProgress(user, event.report || {});
      return { ok: true, save };
    }

    if (action === 'settleRun') {
      const { rewards } = await settleExpedition(user, event.report || {});
      return { ok: true, rewards };
    }

    if (action === 'loadMeta') {
      const { meta, balanceSnapshot } = await loadMeta(user);
      return { ok: true, meta, balanceSnapshot };
    }

    if (action === 'updateMeta') {
      await updateMeta(user, event.report || {});
      return { ok: true };
    }

    if (action === 'unlockTreeNode') {
      const { meta } = await unlockTreeNode(user, event.nodeId);
      return { ok: true, meta };
    }

    if (action === 'resetTreeNodes') {
      const { meta } = await resetTreeNodes(user);
      return { ok: true, meta };
    }

    if (action === 'loadLeaderboard') {
      const { entries, myRank } = await loadLeaderboard(user, event.limit);
      return { ok: true, entries, myRank: myRank ?? null };
    }

    return { ok: false, code: 'UNKNOWN_ACTION', message: `未知 action: ${action}` };
  } catch (err) {
    return {
      ok: false,
      code: err.code || 'PVE_ERROR',
      message: err.message || String(err),
    };
  }
};
