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

const ROOM_MAX_PLAYERS = 4;
const GAME_NAME_MAX_LEN = 16;

function defaultGameNameFromNickname(nickname) {
  const suffix = '的房间';
  const nick = (String(nickname || '玩家').trim() || '玩家').slice(
    0,
    GAME_NAME_MAX_LEN - suffix.length,
  );
  return `${nick}${suffix}`;
}

function sanitizeNickname(raw, fallback) {
  const s = String(raw || '')
    .trim()
    .slice(0, GAME_NAME_MAX_LEN);
  const fb = String(fallback || '玩家')
    .trim()
    .slice(0, GAME_NAME_MAX_LEN);
  return s || fb || '玩家';
}

function sanitizeGameName(raw, nickname) {
  const s = String(raw || '')
    .trim()
    .slice(0, GAME_NAME_MAX_LEN);
  return s || defaultGameNameFromNickname(nickname);
}

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

async function createRoomForUser(user, options = {}) {
  const displayName = sanitizeNickname(options.nickname, user.nickname);
  const gameName = sanitizeGameName(
    options.gameName || displayName,
    displayName,
  );
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
  const hostSlot = toPlayerSlot(user, 0);
  hostSlot.nickname = displayName;
  const players = [hostSlot];
  const data = {
    roomCode,
    hostId: user.id,
    maxPlayers: ROOM_MAX_PLAYERS,
    gameName,
    matchFill: false,
    players,
    status: 'WAITING',
    gameId: null,
    createdAt: now,
    expireAt: now + ROOM_EXPIRE_MS,
  };

  await db.collection(COLLECTIONS.ROOMS).doc(roomId).set({ data });
  return toRoomVO(roomId, data);
}

/** 大厅：可加入的等待中房间 */
async function listWaitingRooms(user) {
  const db = getDb();
  // 先清理过期房间，避免“刚进小程序就看到历史房间”
  try {
    await disbandExpiredRooms();
  } catch {
    /* ignore */
  }
  const { data } = await db
    .collection(COLLECTIONS.ROOMS)
    .where({ status: 'WAITING' })
    .orderBy('createdAt', 'desc')
    .limit(40)
    .get();

  const now = nowMs();
  const list = data
    .filter((doc) => {
      const players = doc.players || [];
      const full = players.length >= (doc.maxPlayers || ROOM_MAX_PLAYERS);
      const inRoom = players.some(
        (p) => p.openId === user._openid || p.userId === user.id,
      );
      // 兼容旧数据：没有 expireAt 的房间直接视为过期，不再展示
      const expireAt = Number(doc.expireAt || 0);
      const notExpired = expireAt > now;
      // 额外兜底：只展示最近 10 分钟创建的 WAITING 房间
      const createdAt = Number(doc.createdAt || 0);
      const recent = createdAt > 0 && now - createdAt <= 10 * 60 * 1000;
      return !full && !inRoom && notExpired && recent;
    })
    .map((doc) => toRoomVO(doc._id, doc));

  list.sort((a, b) => {
    if (!!b.matchFill !== !!a.matchFill) return b.matchFill ? 1 : -1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  return list;
}

async function setRoomMatchFill(user, roomId, enabled) {
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

  const now = nowMs();
  await getDb()
    .collection(COLLECTIONS.ROOMS)
    .doc(roomId)
    .update({
      data: {
        matchFill: !!enabled,
        matchFillAt: enabled ? doc.matchFillAt || now : null,
        lastBotFillAt: enabled ? doc.lastBotFillAt || null : null,
      },
    });

  const updated = await getRoom(roomId);
  return toRoomVO(roomId, updated);
}

const { pickRandomBotNickname } = require('./botNames');

function createBotSlot(roomId, seat, usedNicknames = []) {
  const id = `bot_${roomId}_${seat}_${Date.now()}`;
  return {
    userId: id,
    openId: id,
    nickname: pickRandomBotNickname(usedNicknames),
    avatarUrl: '',
    seat,
    isBot: true,
  };
}

async function joinBotToRoom(roomId) {
  const doc = await getRoom(roomId);
  if (!doc || doc.status !== 'WAITING') return null;
  const players = doc.players || [];
  const maxPlayers = doc.maxPlayers || ROOM_MAX_PLAYERS;
  if (players.length >= maxPlayers) return toRoomVO(roomId, doc);

  const bot = createBotSlot(
    roomId,
    players.length,
    players.map((p) => p.nickname),
  );
  const nextPlayers = players.concat([bot]);
  const patch = {
    players: nextPlayers,
    lastBotFillAt: nowMs(),
  };
  if (nextPlayers.length >= maxPlayers) {
    patch.matchFill = false;
  }

  await getDb().collection(COLLECTIONS.ROOMS).doc(roomId).update({
    data: patch,
  });
  const updated = await getRoom(roomId);
  return toRoomVO(roomId, updated);
}

async function joinRoomForUser(user, roomCode, options = {}) {
  const found = await findWaitingRoomByCode(roomCode);
  if (!found) {
    const err = new Error('ROOM_NOT_FOUND');
    err.code = 'ROOM_NOT_FOUND';
    err.message = '房间不存在或已开始';
    throw err;
  }

  const displayName = sanitizeNickname(options.nickname, user.nickname);

  const { roomId, doc } = found;
  if (doc.players.length >= doc.maxPlayers) {
    const err = new Error('ROOM_FULL');
    err.code = 'ROOM_FULL';
    throw err;
  }
  const existingIdx = doc.players.findIndex(
    (p) => p.userId === user.id || p.openId === user._openid,
  );
  if (existingIdx >= 0) {
    const players = doc.players.map((p, i) =>
      i === existingIdx ? { ...p, nickname: displayName } : p,
    );
    await getDb()
      .collection(COLLECTIONS.ROOMS)
      .doc(roomId)
      .update({ data: { players } });
    const updated = await getRoom(roomId);
    return toRoomVO(roomId, updated);
  }

  const seat = doc.players.length;
  const slot = toPlayerSlot(user, seat);
  slot.nickname = displayName;
  const players = doc.players.concat([slot]);
  const patch = { players };
  if (players.length >= (doc.maxPlayers || ROOM_MAX_PLAYERS)) {
    patch.matchFill = false;
  }
  await getDb()
    .collection(COLLECTIONS.ROOMS)
    .doc(roomId)
    .update({
      data: patch,
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
    gameName: doc.gameName,
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
  const room = await createRoomForUser(host, { gameName: '随机匹配' });

  for (let i = 1; i < users.length; i++) {
    await joinRoomForUser(users[i], room.roomCode);
  }

  return startRoomByHost(host, room.roomId);
}

/** 房主解散等待中的房间 */
async function disbandRoomByHost(user, roomId) {
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

  await getDb()
    .collection(COLLECTIONS.ROOMS)
    .doc(roomId)
    .update({
      data: { status: 'DISBANDED', players: [], matchFill: false },
    });
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
  disbandRoomByHost,
  disbandExpiredRooms,
  findWaitingRoomByCode,
  listWaitingRooms,
  setRoomMatchFill,
  joinBotToRoom,
  requireUser,
  getUserByOpenId,
};
