const cloud = require('wx-server-sdk');
const { generateId, generateRoomCode } = require('./id');
const { COLLECTIONS, ROOM_EXPIRE_MS } = require('./constants');
const {
  getDb,
  getUserByOpenId,
  getRoom,
  getGame,
  updateGameDoc,
  nowMs,
  clearBluffPrivateForGame,
  incrementUserDiamond,
} = require('./db');
const { requireUser, toPlayerSlot, toRoomVO } = require('./auth');
const { createInitialGameDoc } = require('./BoardGenerator');
const { quitGame, toGamePatch } = require('./GameEngine');
const { applySettlementToUsers } = require('./Settlement');

async function findWaitingRoomByCode(roomCode) {
  const { data } = await getDb()
    .collection(COLLECTIONS.ROOMS)
    .where({ roomCode, status: 'WAITING' })
    .limit(1)
    .get();
  if (!data.length) return null;
  const doc = data[0];
  return { roomId: doc._id, doc };
}

async function createRoomForUser(user, maxPlayers) {
  const db = getDb();
  const roomId = generateId();
  let roomCode = generateRoomCode();
  let created = false;

  for (let i = 0; i < 5; i++) {
    const dup = await findWaitingRoomByCode(roomCode);
    if (!dup) {
      created = true;
      break;
    }
    roomCode = generateRoomCode();
  }
  if (!created) {
    const err = new Error('ROOM_CODE_COLLISION');
    err.code = 'ROOM_CODE_COLLISION';
    throw err;
  }

  const now = nowMs();
  const players = [toPlayerSlot(user, 0)];
  const data = {
    roomCode,
    hostId: user.id,
    maxPlayers,
    players,
    status: 'WAITING',
    gameId: null,
    createdAt: now,
    expireAt: now + ROOM_EXPIRE_MS,
  };

  await db.collection(COLLECTIONS.ROOMS).doc(roomId).set({ data });
  return toRoomVO(roomId, data);
}

async function joinRoomForUser(user, roomCode) {
  const found = await findWaitingRoomByCode(roomCode);
  if (!found) {
    const err = new Error('ROOM_NOT_FOUND');
    err.code = 'ROOM_NOT_FOUND';
    err.message = '房间不存在或已开始';
    throw err;
  }

  const { roomId, doc } = found;
  if (doc.players.length >= doc.maxPlayers) {
    const err = new Error('ROOM_FULL');
    err.code = 'ROOM_FULL';
    throw err;
  }
  if (doc.players.some((p) => p.userId === user.id || p.openId === user._openid)) {
    return toRoomVO(roomId, doc);
  }

  const seat = doc.players.length;
  const players = doc.players.concat([toPlayerSlot(user, seat)]);
  await getDb()
    .collection(COLLECTIONS.ROOMS)
    .doc(roomId)
    .update({
      data: { players },
    });

  const updated = await getRoom(roomId);
  return toRoomVO(roomId, updated);
}

async function startRoomByHost(user, roomId) {
  const doc = await getRoom(roomId);
  if (!doc) {
    const err = new Error('ROOM_NOT_FOUND');
    err.code = 'ROOM_NOT_FOUND';
    throw err;
  }
  if (doc.status !== 'WAITING') {
    const err = new Error('ROOM_NOT_WAITING');
    err.code = 'ROOM_NOT_WAITING';
    throw err;
  }
  if (doc.hostId !== user.id) {
    const err = new Error('NOT_HOST');
    err.code = 'NOT_HOST';
    throw err;
  }
  if (doc.players.length < 2) {
    const err = new Error('NOT_ENOUGH_PLAYERS');
    err.code = 'NOT_ENOUGH_PLAYERS';
    throw err;
  }

  const gameId = generateId();
  const gameData = createInitialGameDoc({
    gameId,
    roomId,
    players: doc.players,
  });

  const db = getDb();
  await db.collection(COLLECTIONS.GAMES).doc(gameId).set({ data: gameData });
  await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
    data: {
      status: 'PLAYING',
      gameId,
    },
  });

  return { gameId, roomId };
}

/** 匹配：用多名玩家建房并自动开始 */
async function createMatchRoomAndStart(users, maxPlayers) {
  if (users.length < 2) {
    const err = new Error('NOT_ENOUGH_PLAYERS');
    err.code = 'NOT_ENOUGH_PLAYERS';
    throw err;
  }

  const host = users[0];
  const room = await createRoomForUser(host, maxPlayers);

  for (let i = 1; i < users.length; i++) {
    await joinRoomForUser(users[i], room.roomCode);
  }

  return startRoomByHost(host, room.roomId);
}

/**
 * 离开房间；对局进行中则等同退出对局并全员结算 → AC-13
 */
async function leaveRoomForUser(user, roomId) {
  const doc = await getRoom(roomId);
  if (!doc) {
    const err = new Error('ROOM_NOT_FOUND');
    err.code = 'ROOM_NOT_FOUND';
    throw err;
  }

  const openId = user._openid;
  const inRoom = doc.players.some(
    (p) => p.openId === openId || p.userId === user.id,
  );
  if (!inRoom) {
    const err = new Error('NOT_IN_ROOM');
    err.code = 'NOT_IN_ROOM';
    throw err;
  }

  let settledGameId = null;
  if (doc.status === 'PLAYING' && doc.gameId) {
    const current = await getGame(doc.gameId);
    if (current && current.phase !== 'SETTLED') {
      const game = JSON.parse(JSON.stringify(current));
      quitGame(game, openId);
      const patch = toGamePatch(game);
      if (game.bluffState === undefined) {
        patch.bluffState = null;
      }
      await updateGameDoc(doc.gameId, patch, current.version);
      await clearBluffPrivateForGame(
        doc.gameId,
        game.players.map((p) => p.openId),
      );
      await applySettlementToUsers(game, incrementUserDiamond);
      settledGameId = doc.gameId;
    }
  }

  const players = doc.players.filter(
    (p) => p.openId !== openId && p.userId !== user.id,
  );
  const db = getDb();
  if (!players.length) {
    await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
      data: { status: 'DISBANDED', players: [] },
    });
  } else {
    const nextHost = players[0];
    await db.collection(COLLECTIONS.ROOMS).doc(roomId).update({
      data: {
        players,
        hostId: nextHost.userId,
        ...(doc.status === 'WAITING' ? { status: 'WAITING' } : {}),
      },
    });
  }

  const updated = await getRoom(roomId);
  return {
    room: updated ? toRoomVO(roomId, updated) : null,
    settledGameId,
  };
}

async function disbandExpiredRooms() {
  const db = getDb();
  const now = nowMs();
  const { data } = await db
    .collection(COLLECTIONS.ROOMS)
    .where({
      status: 'WAITING',
      expireAt: db.command.lt(now),
    })
    .limit(50)
    .get();

  let count = 0;
  for (const room of data) {
    await db.collection(COLLECTIONS.ROOMS).doc(room._id).update({
      data: { status: 'DISBANDED' },
    });
    count++;
  }
  return count;
}

module.exports = {
  createRoomForUser,
  joinRoomForUser,
  startRoomByHost,
  createMatchRoomAndStart,
  leaveRoomForUser,
  disbandExpiredRooms,
  findWaitingRoomByCode,
  requireUser,
  getUserByOpenId,
};
