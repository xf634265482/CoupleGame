/**
 * 云数据库访问封装
 * 使用前云函数须已 cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
 */

const cloud = require('wx-server-sdk');
const { COLLECTIONS } = require('./constants');

function getDb() {
  return cloud.database();
}

function serverDate() {
  return getDb().serverDate();
}

function nowMs() {
  return Date.now();
}

async function getUserByOpenId(openId) {
  const { data } = await getDb()
    .collection(COLLECTIONS.USERS)
    .where({ _openid: openId })
    .limit(1)
    .get();
  return data[0] || null;
}

async function getUserById(userId) {
  const { data } = await getDb()
    .collection(COLLECTIONS.USERS)
    .where({ id: userId })
    .limit(1)
    .get();
  return data[0] || null;
}

async function getRoom(roomId) {
  const res = await getDb().collection(COLLECTIONS.ROOMS).doc(roomId).get();
  return res.data || null;
}

async function getGame(gameId) {
  const res = await getDb().collection(COLLECTIONS.GAMES).doc(gameId).get();
  return res.data || null;
}

/**
 * 更新对局文档（全量替换字段用 update，传 patch 对象）
 * @param {string} gameId
 * @param {object} patch
 * @param {number} [expectedVersion] 乐观锁，不匹配则抛错
 */
async function updateGameDoc(gameId, patch, expectedVersion) {
  const db = getDb();
  const col = db.collection(COLLECTIONS.GAMES);
  const docRef = col.doc(gameId);

  if (expectedVersion !== undefined) {
    const current = await getGame(gameId);
    if (!current) {
      const err = new Error('GAME_NOT_FOUND');
      err.code = 'GAME_NOT_FOUND';
      throw err;
    }
    if (current.version !== undefined && current.version !== expectedVersion) {
      const err = new Error('GAME_VERSION_CONFLICT');
      err.code = 'GAME_VERSION_CONFLICT';
      throw err;
    }
    patch.version = expectedVersion + 1;
  }

  patch.updatedAt = nowMs();

  const _ = db.command;
  // 云数据库不能把 bluffState 设为 null 再改顶层字段，须用 remove
  if (patch.bluffState === null) {
    patch.bluffState = _.remove();
  } else if (patch.bluffState && typeof patch.bluffState === 'object') {
    // lastBid 为 null 时不能点号更新子字段，须整对象 set
    const bs = JSON.parse(JSON.stringify(patch.bluffState));
    if (bs.lastBid === null) {
      delete bs.lastBid;
    }
    patch.bluffState = _.set(bs);
  }

  await docRef.update({ data: patch });
  return getGame(gameId);
}

/** 原子增加用户局外钻石 → AC-12 */
function bluffPrivateDocId(gameId, openId) {
  return `${gameId}_${openId}`;
}

async function setBluffDice(gameId, openId, dice) {
  const db = getDb();
  const id = bluffPrivateDocId(gameId, openId);
  const data = { gameId, openId, dice, updatedAt: nowMs() };
  try {
    await db.collection(COLLECTIONS.BLUFF_PRIVATE).doc(id).set({ data });
  } catch {
    await db.collection(COLLECTIONS.BLUFF_PRIVATE).doc(id).update({ data });
  }
}

async function getBluffDice(gameId, openId) {
  const db = getDb();
  const id = bluffPrivateDocId(gameId, openId);
  try {
    const res = await db.collection(COLLECTIONS.BLUFF_PRIVATE).doc(id).get();
    return res.data?.dice || null;
  } catch {
    return null;
  }
}

/** @returns {Record<string, number[]>} openId -> dice */
async function getAllBluffDiceForGame(gameId, openIds) {
  const out = {};
  for (const openId of openIds) {
    const dice = await getBluffDice(gameId, openId);
    if (dice) out[openId] = dice;
  }
  return out;
}

async function clearBluffPrivateForGame(gameId, openIds) {
  const db = getDb();
  for (const openId of openIds) {
    const id = bluffPrivateDocId(gameId, openId);
    try {
      await db.collection(COLLECTIONS.BLUFF_PRIVATE).doc(id).remove();
    } catch {
      /* ignore */
    }
  }
}

async function incrementUserDiamond(userId, delta) {
  const db = getDb();
  const _ = db.command;
  const user = await getUserById(userId);
  if (!user) {
    const err = new Error('USER_NOT_FOUND');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  await db
    .collection(COLLECTIONS.USERS)
    .doc(user._id)
    .update({
      data: {
        diamond: _.inc(delta),
        updatedDate: serverDate(),
      },
    });
}

module.exports = {
  getDb,
  serverDate,
  nowMs,
  getUserByOpenId,
  getUserById,
  getRoom,
  getGame,
  updateGameDoc,
  incrementUserDiamond,
  setBluffDice,
  getBluffDice,
  getAllBluffDiceForGame,
  clearBluffPrivateForGame,
};
