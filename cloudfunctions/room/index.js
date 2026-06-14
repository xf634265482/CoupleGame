const cloud = require('wx-server-sdk');
const { resolveOpenId } = require('./common/auth');
const {
  createRoomForUser,
  joinRoomForUser,
  startRoomByHost,
  leaveRoomForUser,
  disbandRoomByHost,
  listWaitingRooms,
  setRoomMatchFill,
  requireUser,
  getUserByOpenId,
} = require('./common/roomService');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/** room 云函数 → 建房 / 列表 / 加入 / 开始 */
exports.main = async (event = {}) => {
  try {
    const openId = resolveOpenId(cloud.getWXContext(), event);
    if (!openId) {
      return { ok: false, code: 'NO_OPENID', message: '无法获取 OPENID' };
    }

    const user = await requireUser(openId, getUserByOpenId);
    const { action } = event;

    if (action === 'create') {
      const room = await createRoomForUser(user, {
        gameName: event.gameName,
        nickname: event.nickname,
      });
      return { ok: true, roomId: room.roomId, roomCode: room.roomCode, room };
    }

    if (action === 'list') {
      const rooms = await listWaitingRooms(user);
      return { ok: true, rooms };
    }

    if (action === 'join') {
      if (!event.roomCode) {
        return { ok: false, code: 'MISSING_ROOM_CODE', message: '缺少 roomCode' };
      }
      const room = await joinRoomForUser(user, String(event.roomCode), {
        nickname: event.nickname,
      });
      return { ok: true, room };
    }

    if (action === 'start') {
      if (!event.roomId) {
        return { ok: false, code: 'MISSING_ROOM_ID', message: '缺少 roomId' };
      }
      const { gameId, roomId } = await startRoomByHost(user, event.roomId);
      return { ok: true, gameId, roomId };
    }

    if (action === 'leave') {
      if (!event.roomId) {
        return { ok: false, code: 'MISSING_ROOM_ID', message: '缺少 roomId' };
      }
      const { room, settledGameId } = await leaveRoomForUser(user, event.roomId);
      return { ok: true, room, settledGameId };
    }

    if (action === 'disband') {
      if (!event.roomId) {
        return { ok: false, code: 'MISSING_ROOM_ID', message: '缺少 roomId' };
      }
      await disbandRoomByHost(user, event.roomId);
      return { ok: true };
    }

    if (action === 'setMatchFill') {
      if (!event.roomId) {
        return { ok: false, code: 'MISSING_ROOM_ID', message: '缺少 roomId' };
      }
      const room = await setRoomMatchFill(user, event.roomId, !!event.enabled);
      return { ok: true, room };
    }

    return { ok: false, code: 'UNKNOWN_ACTION', message: `未知 action: ${action}` };
  } catch (err) {
    return {
      ok: false,
      code: err.code || 'ROOM_ERROR',
      message: err.message || String(err),
    };
  }
};
