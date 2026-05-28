const cloud = require('wx-server-sdk');
const { generateId } = require('./common/id');
const { COLLECTIONS } = require('./common/constants');
const { getDb, nowMs, getUserByOpenId } = require('./common/db');
const { resolveOpenId, requireUser } = require('./common/auth');
const { processMatchQueue, pollUserMatchState } = require('./common/matchService');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/** match 云函数 → AC-5 */
exports.main = async (event = {}) => {
  try {
    const openId = resolveOpenId(cloud.getWXContext(), event);
    if (!openId) {
      return { ok: false, code: 'NO_OPENID', message: '无法获取 OPENID' };
    }

    const user = await requireUser(openId, getUserByOpenId);
    const db = getDb();
    const { action } = event;

    if (action === 'enqueue') {
      const maxPlayers = event.maxPlayers || 4;
      if (![2, 3, 4].includes(maxPlayers)) {
        return { ok: false, code: 'INVALID_MAX_PLAYERS', message: 'maxPlayers 须为 2/3/4' };
      }

      const { data: existing } = await db
        .collection(COLLECTIONS.MATCH_QUEUE)
        .where({ openId: user._openid })
        .limit(1)
        .get();

      if (existing.length) {
        await processMatchQueue();
        return {
          ok: true,
          ticketId: existing[0].ticketId,
          alreadyQueued: true,
          enqueueAt: existing[0].enqueueAt,
        };
      }

      const ticketId = generateId();
      const enqueueAt = nowMs();
      await db.collection(COLLECTIONS.MATCH_QUEUE).doc(ticketId).set({
        data: {
          ticketId,
          openId: user._openid,
          userId: user.id,
          maxPlayers,
          enqueueAt,
        },
      });
      await processMatchQueue();
      return { ok: true, ticketId, enqueueAt };
    }

    if (action === 'cancel') {
      if (event.ticketId) {
        await db.collection(COLLECTIONS.MATCH_QUEUE).doc(event.ticketId).remove();
      } else {
        const { data } = await db
          .collection(COLLECTIONS.MATCH_QUEUE)
          .where({ openId: user._openid })
          .get();
        for (const item of data) {
          await db.collection(COLLECTIONS.MATCH_QUEUE).doc(item._id).remove();
        }
      }
      return { ok: true };
    }

    if (action === 'tryMatch') {
      const matched = await processMatchQueue();
      return { ok: true, matched };
    }

    if (action === 'poll') {
      await processMatchQueue();
      const state = await pollUserMatchState(user._openid);
      return { ok: true, ...state };
    }

    return { ok: false, code: 'UNKNOWN_ACTION', message: `未知 action: ${action}` };
  } catch (err) {
    return {
      ok: false,
      code: err.code || 'MATCH_ERROR',
      message: err.message || String(err),
    };
  }
};
