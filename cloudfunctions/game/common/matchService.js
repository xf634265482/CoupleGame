const { COLLECTIONS } = require('./constants');
const { getDb, getUserByOpenId } = require('./db');
const { createMatchRoomAndStart } = require('./roomService');

/**
 * 匹配队列：同 maxPlayers 且 ≥2 人立即组局（最长等待由客户端倒计时提示）
 */
async function processMatchQueue() {
  const db = getDb();

  const { data: tickets } = await db
    .collection(COLLECTIONS.MATCH_QUEUE)
    .orderBy('enqueueAt', 'asc')
    .limit(20)
    .get();

  if (tickets.length < 2) {
    return 0;
  }

  const groups = new Map();
  for (const t of tickets) {
    const mp = t.maxPlayers || 4;
    if (!groups.has(mp)) groups.set(mp, []);
    groups.get(mp).push(t);
  }

  let matched = 0;

  for (const [mp, group] of groups) {
    const maxPlayers = Number(mp);
    while (group.length >= 2) {
      const batch = group.splice(0, Math.min(group.length, maxPlayers));
      if (batch.length < 2) break;

      const users = [];
      for (const t of batch) {
        const user = await getUserByOpenId(t.openId);
        if (user) users.push(user);
      }
      if (users.length < 2) {
        continue;
      }

      await createMatchRoomAndStart(users, maxPlayers);

      for (const t of batch) {
        await db.collection(COLLECTIONS.MATCH_QUEUE).doc(t._id).remove();
      }

      matched += users.length;
    }
  }

  return matched;
}

/** 客户端轮询：队列 / 房间 / 对局状态 */
async function pollUserMatchState(openId) {
  const db = getDb();

  const { data: queueItems } = await db
    .collection(COLLECTIONS.MATCH_QUEUE)
    .where({ openId })
    .limit(1)
    .get();
  if (queueItems.length) {
    return {
      status: 'QUEUED',
      ticketId: queueItems[0].ticketId,
      enqueueAt: queueItems[0].enqueueAt,
    };
  }

  const { data: rooms } = await db
    .collection(COLLECTIONS.ROOMS)
    .where({
      status: db.command.in(['WAITING', 'PLAYING']),
    })
    .orderBy('createdAt', 'desc')
    .limit(30)
    .get();

  const roomDoc = rooms.find((r) =>
    (r.players || []).some((p) => p.openId === openId),
  );
  if (!roomDoc) {
    return { status: 'IDLE' };
  }

  const roomId = roomDoc._id;
  const room = {
    roomId,
    roomCode: roomDoc.roomCode,
    hostId: roomDoc.hostId,
    maxPlayers: roomDoc.maxPlayers,
    players: roomDoc.players || [],
    status: roomDoc.status,
    gameId: roomDoc.gameId || null,
    createdAt: roomDoc.createdAt,
    expireAt: roomDoc.expireAt,
  };

  if (roomDoc.status === 'PLAYING' && roomDoc.gameId) {
    return { status: 'PLAYING', roomId, gameId: roomDoc.gameId, room };
  }

  return { status: 'IN_ROOM', roomId, room };
}

module.exports = {
  processMatchQueue,
  pollUserMatchState,
};
