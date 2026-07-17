/**
 * 浜戞暟鎹簱璁块棶灏佽
 * 浣跨敤鍓嶄簯鍑芥暟椤诲凡 cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
 */

const cloud = require('wx-server-sdk');
const { COLLECTIONS, PVE_DIFFICULTY_ORDER } = require('./constants');
const {
  STAMINA_MAX,
  resolveStamina,
  consumeForNewRun,
} = require('./pve/PveStamina');

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
 * 璇诲彇鐢ㄦ埛 PVE 鍏冭繘搴﹀揩鐓э紙鍛借繍纰庣墖浣欓 + 閽荤煶浣欓 + 鎴愬氨 + 鍥鹃壌锛夛紝鐢ㄤ簬 loadMeta action锛堚啋 AC-20锛夈€?
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
    destinyShards: user?.destinyShards ?? 0,
    diamond: user?.diamond ?? 0,
    stamina: stamina.stamina,
    staminaMax: STAMINA_MAX,
    staminaNextRecoveryAt: stamina.nextRecoveryAt,
    hasPendingRun: Number.isInteger(user?.pvePendingRunSeed) && user.pvePendingRunSeed > 0,
    nextRunCost: Number.isInteger(user?.pvePendingRunSeed) && user.pvePendingRunSeed > 0
      ? 0
      : user?.pveFirstRunStarted === true ? 20 : 0,
    highestFloor: user?.pveProfile?.highestClearedFloor ?? 0,
    unlockedTreeNodes: user?.unlockedTreeNodes ?? [],
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

/**
 * PVE 鍏冭繘搴﹁处鎴疯祫浜у叆璐︼細閽荤煶锛堜笌 PVP 鍏变韩锛? 鍛借繍纰庣墖锛圥VE 涓撳睘锛屸啋 ddl-sql.md 搂2锛夈€?
 * 鏀寔澶嶅悎鎺掕姒滄洿鏂帮紙鈫?AC-P3-7锛夊拰闅惧害閫氬叧璁板綍锛堚啋 AC-P3-6锛夈€?
 *
 * @param {string} userId
 * @param {{ diamond?: number, destinyShards?: number, highestFloor?: number,
 *           tier?: string, classId?: string, awakenForm?: string,
 *           isClearRecord?: boolean }} opts
 *   - tier: 闅惧害妗ｏ紙缂虹渷 NORMAL锛屸啋 AC-P3-10 鑰佽处鍙峰吋瀹癸級
 *   - isClearRecord: true 鏃惰褰曢€氬叧璇ラ毦搴︽。锛堢敤浜庝笅涓€妗ｈВ閿佹牎楠岋級
 */
async function incrementUserPveRewards(userId, {
  diamond = 0,
  destinyShards = 0,
  highestFloor = 0,
  tier = 'NORMAL',
  classId = '',
  awakenForm = '',
  isClearRecord = false,
} = {}) {
  const db = getDb();
  const _ = db.command;
  const user = await getUserById(userId);
  if (!user) {
    const err = new Error('USER_NOT_FOUND');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  const data = { updatedDate: serverDate() };
  if (diamond) data.diamond = _.inc(diamond);
  if (destinyShards) data.destinyShards = _.inc(destinyShards);

  // 澶嶅悎鎺掕姒滐細(tierLevel DESC, floor DESC, updatedAt ASC)锛屸啋 AC-P3-7
  const newTierLevel = PVE_DIFFICULTY_ORDER.indexOf(tier) >= 0
    ? PVE_DIFFICULTY_ORDER.indexOf(tier)
    : 0;
  const curTierLevel = user.pveHighestTierLevel ?? 0;
  const curFloor = user.pveHighestFloor ?? 0;

  // 浠呭綋澶嶅悎鎴愮哗涓ユ牸楂樹簬鍘嗗彶鏃舵洿鏂帮紙tier 鏇撮珮 OR 鍚?tier 涓?floor 鏇撮珮锛?
  const isHigherRecord =
    newTierLevel > curTierLevel ||
    (newTierLevel === curTierLevel && highestFloor > curFloor);

  if (isHigherRecord && highestFloor > 0) {
    data.pveHighestFloor = Math.trunc(highestFloor);
    data.pveHighestTier = tier;
    data.pveHighestTierLevel = newTierLevel;
    data.pveHighestFloorUpdatedAt = serverDate();
    data.pveHighestClassId = classId || 'ADVENTURER';
    data.pveHighestAwakenForm = awakenForm || '';
  }

  // 闅惧害閫氬叧璁板綍锛氬啓鍏?pveClearedTiers锛堢敤浜庝笅涓€妗ｈВ閿佹牎楠岋紝鈫?AC-P3-6锛?
  if (isClearRecord) {
    const cleared = user.pveClearedTiers ?? [];
    if (!cleared.includes(tier)) {
      data.pveClearedTiers = _.push(tier);
    }
  }

  await db.collection(COLLECTIONS.USERS).doc(user._id).update({ data });
}

async function updateUserPveClassSnapshot(userId, classId = '', awakenForm = '') {
  const user = await getUserById(userId);
  if (!user) {
    const err = new Error('USER_NOT_FOUND');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  const nextClassId = classId || 'ADVENTURER';
  const nextAwakenForm = awakenForm || '';
  await getDb().collection(COLLECTIONS.USERS).doc(user._id).update({
    data: {
      pveCurrentClassId: nextClassId,
      pveCurrentAwakenForm: nextAwakenForm,
      updatedDate: serverDate(),
    },
  });
}

/**
 * 涓烘柊杩滃緛棰勭暀鏈嶅姟绔瀛愬苟鏉冨▉鎵ｉ櫎浣撳姏銆?
 * pending seed 浣垮鎴风閲嶈瘯淇濇寔骞傜瓑锛氬悓涓€杞皻鏈啓鍏ラ灞傚瓨妗ｅ墠涓嶄細閲嶅鎵ｈ垂銆?
 */
async function reservePveRunStart(user, proposedSeed) {
  const db = getDb();
  return db.runTransaction(async (transaction) => {
    const ref = transaction.collection(COLLECTIONS.USERS).doc(user._id);
    const snapshot = await ref.get();
    const doc = snapshot.data;
    if (!doc) {
      const err = new Error('USER_NOT_FOUND');
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const stamina = resolveStamina(
      doc.pveStamina ?? STAMINA_MAX,
      doc.pveStaminaUpdatedAt,
    );
    if (Number.isInteger(doc.pvePendingRunSeed) && doc.pvePendingRunSeed > 0) {
      return {
        runSeed: doc.pvePendingRunSeed,
        charged: 0,
        stamina,
      };
    }

    const consumed = consumeForNewRun(stamina, doc.pveFirstRunStarted === true);
    await ref.update({
      data: {
        pveStamina: consumed.stamina,
        pveStaminaUpdatedAt: consumed.updatedAt,
        pveFirstRunStarted: true,
        pvePendingRunSeed: proposedSeed,
        updatedDate: serverDate(),
      },
    });
    return {
      runSeed: proposedSeed,
      charged: consumed.charged,
      stamina: {
        stamina: consumed.stamina,
        updatedAt: consumed.updatedAt,
        nextRecoveryAt: consumed.stamina >= STAMINA_MAX
          ? null
          : consumed.updatedAt + 5 * 60 * 1000,
      },
    };
  });
}

async function clearPendingPveRun(userId) {
  const user = await getUserById(userId);
  if (!user || user.pvePendingRunSeed === undefined) return;
  await getDb().collection(COLLECTIONS.USERS).doc(user._id).update({
    data: {
      pvePendingRunSeed: getDb().command.remove(),
      updatedDate: serverDate(),
    },
  });
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

async function getPveSaveByUserId(userId) {
  const { data } = await getDb()
    .collection(COLLECTIONS.PVE_SAVES)
    .where({ userId })
    .limit(1)
    .get();
  return data[0] || null;
}

/**
 * 鍐欏叆/瑕嗙洊鐢ㄦ埛鐨?PVE 瀛樻。锛堟瘡鐢ㄦ埛涓€鏉℃椿璺冨瓨妗ｏ紝鈫?ddl-sql.md 搂1锛夈€?
 * 涓嶅瓨鍦ㄥ垯鍒涘缓锛涘凡瀛樺湪鍒欐寜涔愯閿佺増鏈鐩栨洿鏂般€?
 */
async function putPveSave(userId, patch, expectedVersion) {
  const db = getDb();
  const col = db.collection(COLLECTIONS.PVE_SAVES);
  const current = await getPveSaveByUserId(userId);

  if (!current) {
    const data = {
      ...patch,
      userId,
      version: 0,
      updatedAt: nowMs(),
    };
    const { _id } = await col.add({ data });
    return { ...data, _id };
  }

  if (expectedVersion !== undefined && current.version !== expectedVersion) {
    const err = new Error('PVE_SAVE_VERSION_CONFLICT');
    err.code = 'PVE_SAVE_VERSION_CONFLICT';
    throw err;
  }

  const data = {
    ...patch,
    version: current.version + 1,
    updatedAt: nowMs(),
  };
  await col.doc(current._id).update({ data });
  return { ...current, ...data, _id: current._id };
}

async function deletePveSave(saveId) {
  await getDb().collection(COLLECTIONS.PVE_SAVES).doc(saveId).remove();
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
  incrementUserPveRewards,
  updateUserPveClassSnapshot,
  reservePveRunStart,
  clearPendingPveRun,
  listPveLeaderboard,
  getUserPveMeta,
  updateUserPveMeta,
  getPveSaveByUserId,
  putPveSave,
  deletePveSave,
};
