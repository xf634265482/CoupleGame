/**
 * 浜戞暟鎹簱璁块棶灏佽
 * 浣跨敤鍓嶄簯鍑芥暟椤诲凡 cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
 */

const cloud = require('wx-server-sdk');
const { COLLECTIONS } = require('./constants');
const {
  STAMINA_MAX,
  resolveStamina,
} = require('./pve/PveStamina');

function getDb() {
  return cloud.database();
}

function isTransientTransactionError(err) {
  const message = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === 'object'
    ? String(err.errCode ?? err.code ?? '')
    : '';
  return /TransactionBusy|TransactionConflict|DATABASE_TRANSACTION_FAIL|-501001|resourceunavailable|transaction\s+is\s+(conflict|busy)|modified by others/i.test(
    `${message} ${code}`,
  );
}

/**
 * 微信云库事务在并发 save/settle 同文档时会抛 TransactionBusy。
 * 在云函数内指数退避重试，避免教程通关/层结算被瞬时冲突永久打断。
 */
async function runTransactionWithRetry(handler, { attempts = 8, baseDelayMs = 60 } = {}) {
  const db = getDb();
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await db.runTransaction(handler);
    } catch (err) {
      lastErr = err;
      if (!isTransientTransactionError(err) || attempt === attempts - 1) throw err;
      const waitMs = Math.min(1800, baseDelayMs * (2 ** attempt))
        + Math.floor(Math.random() * 50);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastErr;
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
 * 鏇存柊瀵瑰眬鏂囨。锛堝叏閲忔浛鎹㈠瓧娈电敤 update锛屼紶 patch 瀵硅薄锛?
 * @param {string} gameId
 * @param {object} patch
 * @param {number} [expectedVersion] 涔愯閿侊紝涓嶅尮閰嶅垯鎶涢敊
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

  function isPlainDataObject(val) {
    return (
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      typeof val.operator !== 'string'
    );
  }

  function patchNestedField(field) {
    if (patch[field] === null || patch[field] === undefined) {
      if (patch[field] === null) {
        patch[field] = _.remove();
      }
      return;
    }
    if (isPlainDataObject(patch[field])) {
      patch[field] = _.set(JSON.parse(JSON.stringify(patch[field])));
    }
  }

  // 浜戝簱瀛楁鏇句负 null 鏃讹紝涓嶈兘鐩存帴 merge 瀛愬瓧娈碉紙浼氭姤 Cannot create field 'seat'鈥︼級
  patchNestedField('pendingInteraction');
  patchNestedField('movePause');
  patchNestedField('luckySpin');
  patchNestedField('eventState');

  await docRef.update({ data: patch });
  return getGame(gameId);
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

/**
 * 读取用户 PVE 账户快照，用于 loadMeta。
 * 鑻ュ瓧娈典笉瀛樺湪鍒欒繑鍥炲畨鍏ㄩ粯璁ゅ€硷紙棣栨璇诲彇鏃讹級銆?
 */
async function getUserPveMeta(userId) {
  const user = await getUserById(userId);
  const stamina = resolveStamina(
    user?.pveStamina ?? STAMINA_MAX,
    user?.pveStaminaUpdatedAt,
  );
  if (
    user
    && (
      user.pveStamina !== stamina.stamina
      || user.pveStaminaUpdatedAt !== stamina.updatedAt
    )
  ) {
    await getDb().collection(COLLECTIONS.USERS).doc(user._id).update({
      data: {
        pveStamina: stamina.stamina,
        pveStaminaUpdatedAt: stamina.updatedAt,
        updatedDate: serverDate(),
      },
    });
  }
  return {
    diamond: user?.diamond ?? 0,
    stamina: stamina.stamina,
    staminaMax: STAMINA_MAX,
    staminaNextRecoveryAt: stamina.nextRecoveryAt,
    highestFloor: user?.pveProfile?.highestClearedFloor ?? 0,
    tutorialCompleted: user?.pveTutorialCompleted === true,
  };
}

/**
 * 杩藉姞 PVE 鍏冭繘搴︽潯鐩紙鎴愬氨 + 鍥鹃壌锛屸啋 AC-20锛夛細璇诲彇宸叉湁鏁版嵁 鈫?鍚堝苟鍘婚噸 鈫?鍐欏洖銆?
 * 骞傜瓑锛氬凡鏈夌殑鏉＄洰涓嶄細閲嶅鍐欏叆銆?
 */
async function updateUserPveMeta(userId, {
  diamond = 0,
  tutorialCompleted = false,
  resetTutorial = false,
} = {}) {
  const user = await getUserById(userId);
  if (!user) {
    const err = new Error('USER_NOT_FOUND');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  // 閽荤煶鍑€鍙樺寲锛堣惀鍦伴仐鐗╁疂绠憋級锛氳竟鐣屾牎楠屼綑棰濅笉寰?< 0
  let diamondDelta = Number.isFinite(diamond) ? Math.trunc(diamond) : 0;
  if (diamondDelta < 0) {
    const cur = user.diamond ?? 0;
    if (cur + diamondDelta < 0) {
      const err = new Error('INSUFFICIENT_DIAMOND');
      err.code = 'INSUFFICIENT_DIAMOND';
      throw err;
    }
  }

  if (diamondDelta === 0 && !tutorialCompleted && !resetTutorial) return;

  const data = {
    updatedDate: serverDate(),
  };
  if (tutorialCompleted) data.pveTutorialCompleted = true;
  if (resetTutorial) data.pveTutorialCompleted = false;
  if (diamondDelta !== 0) {
    const _ = getDb().command;
    data.diamond = _.inc(diamondDelta);
  }

  await getDb()
    .collection(COLLECTIONS.USERS)
    .doc(user._id)
    .update({ data });
}

// DB 鍗曟鎷夊彇涓婇檺锛孞S 閲嶆帓鍚庡啀鎴彇 safeLimit銆?
// WeChat CloudDB 鍦?desc 鎺掑簭鏃舵妸 null/缂哄け瀛楁鎺掑湪鏈€鍓嶏紝瀵艰嚧鏃?pveHighestTierLevel 鐨?
// 鑰佽处鍙烽敊璇湴鎺掑湪 tierLevel=0 鐨勬柊璐﹀彿鍓嶉潰銆傛敼涓哄湪 JS 灞傚仛鎺掑簭锛宯ull 涓€寰嬭涓?0銆?
const LEADERBOARD_FETCH_CAP = 200;

/**
 * 鎺掕姒滄煡璇紙鈫?AC-508, AC-P3-7锛夛細
 * - 浠呭惈鑷冲皯閫氬叧绗?1 灞傜殑鐜╁锛坧veHighestFloor > 0锛?
 * - 涓绘帓搴忥細鏈€楂橀毦搴︽。绾у埆闄嶅簭锛坧veHighestTierLevel锛宯ull 瑙嗕负 0锛夛紱
 *   娆℃帓搴忥細妗ｅ唴鏈€娣卞眰闄嶅簭锛涚涓夋帓搴忥細棣栨鍒拌揪鏃堕棿鍗囧簭锛堝厛鍒板厛寰楋級
 * - 浠?DB 鎷夊彇鏈€澶?LEADERBOARD_FETCH_CAP 鏉″悗鍦?JS 閲岄噸鎺掞紝閬垮厤 CloudDB null 鎺掑簭寮傚父
 * - limit 鑼冨洿 [1, 100]锛岄粯璁?50锛屽喅瀹氭渶缁堣繑鍥炵殑 entries 鏁伴噺
 * - myRank 浠庢帓濂藉簭鐨勫畬鏁村垪琛ㄩ噷鏌ュ綋鍓嶇敤鎴蜂綅缃紝涓?entries 澶╃劧涓€鑷?
 */
async function listPveLeaderboard(userId, limit = 50) {
  const db = getDb();
  const _ = db.command;
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 50));

  const { data } = await db
    .collection(COLLECTIONS.USERS)
    .where({ 'pveProfile.highestClearedFloor': _.gt(0) })
    .orderBy('pveProfile.highestClearedFloor', 'desc')
    .limit(LEADERBOARD_FETCH_CAP)
    .get();

  data.sort((a, b) => {
    const fa = a.pveProfile?.highestClearedFloor ?? 0;
    const fb = b.pveProfile?.highestClearedFloor ?? 0;
    if (fb !== fa) return fb - fa;
    const da = a.pveProfile?.highestClearedAt ?? Infinity;
    const db2 = b.pveProfile?.highestClearedAt ?? Infinity;
    return da - db2;
  });

  let myRank = null;
  if (userId) {
    const myIndex = data.findIndex((u) => u.id === userId);
    if (myIndex >= 0) myRank = myIndex + 1;
  }

  const topUsers = data.slice(0, safeLimit);
  const entries = topUsers.map((user, index) => {
    return {
      rank: index + 1,
      userId: user.id,
      nickname: (user.nickname || '鐜╁').slice(0, 12),
      avatarUrl: user.avatarUrl || '',
      highestFloor: user.pveProfile?.highestClearedFloor ?? 0,
    };
  });

  return { entries, myRank };
}

module.exports = {
  getDb,
  runTransactionWithRetry,
  isTransientTransactionError,
  serverDate,
  nowMs,
  getUserByOpenId,
  getUserById,
  getRoom,
  getGame,
  updateGameDoc,
  incrementUserDiamond,
  listPveLeaderboard,
  getUserPveMeta,
  updateUserPveMeta,
};
