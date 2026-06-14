const {
  COLLECTIONS,
  BOT_FILL_FIRST_DELAY_MS,
  BOT_FILL_INTERVAL_MS,
} = require('./constants');
const { getDb, getUserByOpenId, getRoom } = require('./db');
const {
  createMatchRoomAndStart,
  joinRoomForUser,
  joinBotToRoom,
} = require('./roomService');

async function processBotFillRooms(now = Date.now()) {
  const db = getDb();
  const { data: openRooms } = await db
    .collection(COLLECTIONS.ROOMS)
    .where({ status: 'WAITING', matchFill: true })
    .orderBy('createdAt', 'asc')
    .limit(20)
    .get();

  let joined = 0;
  for (const roomDoc of openRooms) {
    const players = roomDoc.players || [];
    if (players.length >= (roomDoc.maxPlayers || 4)) continue;
    const matchFillAt = roomDoc.matchFillAt || roomDoc.createdAt || now;
    const lastBotFillAt = roomDoc.lastBotFillAt || matchFillAt;
    const firstDue = now - matchFillAt >= BOT_FILL_FIRST_DELAY_MS;
    const intervalDue = now - lastBotFillAt >= BOT_FILL_INTERVAL_MS;
    if (!firstDue || !intervalDue) continue;
    const room = await joinBotToRoom(roomDoc._id);
    if (room) joined++;
  }
  return joined;
}

/** 优先把匹配队列玩家补进开启「在线匹配」的房间 */
async function processMatchFillJoins() {
  const db = getDb();
  let joined = 0;

  for (let guard = 0; guard < 30; guard++) {
    const { data: openRooms } = await db
      .collection(COLLECTIONS.ROOMS)
      .where({ status: 'WAITING', matchFill: true })
      .orderBy('createdAt', 'asc')
      .limit(10)
      .get();

    const roomDoc = openRooms.find(
      (r) => (r.players || []).length < (r.maxPlayers || 4),
    );
    if (!roomDoc) break;

    const { data: tickets } = await db
      .collection(COLLECTIONS.MATCH_QUEUE)
      .orderBy('enqueueAt', 'asc')
      .limit(5)
      .get();
    if (!tickets.length) break;

    const roomOpenIds = new Set((roomDoc.players || []).map((p) => p.openId));
    const ticket = tickets.find((t) => !roomOpenIds.has(t.openId));
    if (!ticket) break;

    const user = await getUserByOpenId(ticket.openId);
    if (!user) {
      await db.collection(COLLECTIONS.MATCH_QUEUE).doc(ticket._id).remove();
      continue;
    }

    try {
      await joinRoomForUser(user, roomDoc.roomCode);
      await db.collection(COLLECTIONS.MATCH_QUEUE).doc(ticket._id).remove();
      joined++;
      const updated = await getRoom(roomDoc._id);
      if (
        updated &&
        (updated.players || []).length >= (updated.maxPlayers || 4)
      ) {
        await db.collection(COLLECTIONS.ROOMS).doc(roomDoc._id).update({
          data: { matchFill: false },
        });
      }
    } catch {
      break;
    }
  }

  return joined;
}

/**
 * 匹配队列：同 maxPlayers 且 ≥2 人立即组局（最长等待由客户端倒计时提示）
 */
async function processMatchQueue() {
  await processMatchFillJoins();
  await processBotFillRooms();
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
  const players = roomDoc.players || [];
  const host = players.find((p) => p.userId === roomDoc.hostId) || players[0];
  const room = {
    roomId,
    roomCode: roomDoc.roomCode,
    hostId: roomDoc.hostId,
    maxPlayers: roomDoc.maxPlayers,
    players,
    status: roomDoc.status,
    gameId: roomDoc.gameId || null,
    gameName: roomDoc.gameName || '',
    matchFill: !!roomDoc.matchFill,
    hostNickname: host?.nickname || '房主',
    createdAt: roomDoc.createdAt,
    expireAt: roomDoc.expireAt,
  };

  if (roomDoc.status === 'PLAYING' && roomDoc.gameId) {
    return { status: 'PLAYING', roomId, gameId: roomDoc.gameId, room };
  }

  return { status: 'IN_ROOM', roomId, room };
}

module.exports = {
  processMatchFillJoins,
  processBotFillRooms,
  processMatchQueue,
  pollUserMatchState,
};
