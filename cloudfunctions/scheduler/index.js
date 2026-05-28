const cloud = require('wx-server-sdk');
const { disbandExpiredRooms } = require('./common/roomService');
const { processMatchQueue } = require('./common/matchService');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/** 定时触发：解散过期房间 + 匹配组局 → AC-4, AC-5 */
exports.main = async (event = {}) => {
  const action = event.action || event.Type || 'tick';

  let disbanded = 0;
  let matched = 0;

  try {
    if (action === 'disband' || action === 'tick') {
      disbanded = await disbandExpiredRooms();
    }

    if (action === 'match' || action === 'tick') {
      matched = await processMatchQueue();
    }

    return { ok: true, disbanded, matched, action };
  } catch (err) {
    return {
      ok: false,
      code: err.code || 'SCHEDULER_ERROR',
      message: err.message || String(err),
    };
  }
};
