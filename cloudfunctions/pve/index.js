const cloud = require('wx-server-sdk');
const { resolveOpenId, requireUser } = require('./common/auth');
const { getUserByOpenId } = require('./common/db');
const { loadProfile, manageCamp, startMinghenTracking, updateCampConfiguration } = require('./common/pve/PveProgression');
const {
  loadActiveFloorChallenge,
  saveFloorChallengeRuntime,
  startFloorChallenge,
  settleFloorChallenge,
} = require('./common/pve/PveChallenge');
const {
  loadMeta,
  updateMeta,
  loadLeaderboard,
} = require('./common/pve/PveMeta');
const {
  listMailsForUser,
  claimMailForUser,
  claimAllMailsForUser,
  deleteMailForUser,
  markMailReadForUser,
} = require('./common/pve/PveMailService');
const { handleCheckInAction } = require('./common/pve/PveCheckIn');

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

    if (action === 'updateCampConfiguration') {
      const result = await updateCampConfiguration(user, event.request || {});
      return { ok: true, ...result };
    }

    if (action === 'manageCamp') {
      const result = await manageCamp(user, event.request || {});
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

    if (action === 'loadMeta') {
      const { meta, balanceSnapshot } = await loadMeta(user);
      return { ok: true, meta, balanceSnapshot };
    }

    if (action === 'updateMeta') {
      await updateMeta(user, event.report || {});
      return { ok: true };
    }

    if (action === 'loadLeaderboard') {
      const { entries, myRank } = await loadLeaderboard(user, event.limit);
      return { ok: true, entries, myRank: myRank ?? null };
    }

    if (action === 'listMails') {
      const result = await listMailsForUser(user.id, { limit: event.limit });
      return { ok: true, ...result };
    }

    if (action === 'claimMail') {
      const result = await claimMailForUser(user, event.mailId || event.request?.mailId);
      return { ok: true, ...result };
    }

    if (action === 'claimAllMails') {
      const result = await claimAllMailsForUser(user);
      return { ok: true, ...result };
    }

    if (action === 'deleteMail') {
      await deleteMailForUser(user.id, event.mailId || event.request?.mailId);
      return { ok: true };
    }

    if (action === 'markMailRead') {
      const result = await markMailReadForUser(user.id, event.mailId || event.request?.mailId);
      return { ok: true, ...result };
    }

    if (action === 'checkIn') {
      const result = await handleCheckInAction(user, event.request || {
        action: event.checkInAction,
        day: event.day,
        days: event.days,
      });
      return { ok: true, ...result };
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
