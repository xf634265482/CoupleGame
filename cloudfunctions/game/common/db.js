/**
 * 云数据库访问封装
 * 使用前云函数须已 cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
 */

const cloud = require('wx-server-sdk');
const { COLLECTIONS } = require('./constants');
const { canUnlockNode, getNodeDef } = require('./pve/PveDestinyTree');

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

  // 云库字段曾为 null 时，不能直接 merge 子字段（会报 Cannot create field 'seat'…）
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
 * 读取用户 PVE 元进度快照（命运碎片余额 + 钻石余额 + 成就 + 图鉴），用于 loadMeta action（→ AC-20）。
 * 若字段不存在则返回安全默认值（首次读取时）。
 */
async function getUserPveMeta(userId) {
  const user = await getUserById(userId);
  return {
    destinyShards: user?.destinyShards ?? 0,
    diamond: user?.diamond ?? 0,
    achievements: user?.achievements ?? [],
    codex: {
      monsters: user?.pveCodex?.monsters ?? [],
      equipment: user?.pveCodex?.equipment ?? [],
    },
    unlockedTreeNodes: user?.unlockedTreeNodes ?? [],
  };
}

/**
 * 追加 PVE 元进度条目（成就 + 图鉴，→ AC-20）：读取已有数据 → 合并去重 → 写回。
 * 幂等：已有的条目不会重复写入。
 */
async function updateUserPveMeta(userId, { newAchievements = [], codexMonsters = [], codexEquipment = [], codexRelics = [], diamond = 0 }) {
  const user = await getUserById(userId);
  if (!user) {
    const err = new Error('USER_NOT_FOUND');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  // 现有数据（安全默认）
  const existAch = new Set(user.achievements ?? []);
  const existMon = new Set(user.pveCodex?.monsters ?? []);
  const existEq  = new Set(user.pveCodex?.equipment ?? []);
  const existRelics = new Set(user.pveCodex?.relics ?? []);

  // 过滤出真正新增的条目
  const addAch = newAchievements.filter((id) => !existAch.has(id));
  const addMon = codexMonsters.filter((t)  => !existMon.has(t));
  const addEq  = codexEquipment.filter((s) => !existEq.has(s));
  const addRelics = codexRelics.filter((r) => !existRelics.has(r));

  // 钻石净变化（营地遗物宝箱）：边界校验余额不得 < 0
  let diamondDelta = Number.isFinite(diamond) ? Math.trunc(diamond) : 0;
  if (diamondDelta < 0) {
    const cur = user.diamond ?? 0;
    if (cur + diamondDelta < 0) {
      const err = new Error('INSUFFICIENT_DIAMOND');
      err.code = 'INSUFFICIENT_DIAMOND';
      throw err;
    }
  }

  if (addAch.length === 0 && addMon.length === 0 && addEq.length === 0 && addRelics.length === 0 && diamondDelta === 0) return;

  // 合并后写回（整体替换数组，兼容微信云数据库）
  const mergedAch = [...existAch, ...addAch];
  const mergedMon = [...existMon, ...addMon];
  const mergedEq  = [...existEq,  ...addEq];
  const mergedRelics = [...existRelics, ...addRelics];

  const data = {
    achievements: mergedAch,
    pveCodex: { monsters: mergedMon, equipment: mergedEq, relics: mergedRelics },
    updatedDate: serverDate(),
  };
  if (diamondDelta !== 0) {
    const _ = getDb().command;
    data.diamond = _.inc(diamondDelta);
  }

  await getDb()
    .collection(COLLECTIONS.USERS)
    .doc(user._id)
    .update({ data });
}

/** PVE 元进度账户资产入账：钻石（与 PVP 共享）+ 命运碎片（PVE 专属，→ ddl-sql.md §2）。 */
async function incrementUserPveRewards(userId, { diamond = 0, destinyShards = 0 }) {
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
  await db.collection(COLLECTIONS.USERS).doc(user._id).update({ data });
}

/**
 * 解锁命运树节点（权威校验，→ specs/260610-destiny-tree-ui/design.md）：
 * 重新读取用户当前 destinyShards/unlockedTreeNodes，用 canUnlockNode 校验
 * （节点存在/未解锁/碎片足够/同列顺序），通过则扣费并写入，否则抛 CANNOT_UNLOCK。
 * 返回最新的 PveMeta（与 getUserPveMeta 同形）。
 */
async function unlockUserTreeNode(userId, nodeId) {
  const user = await getUserById(userId);
  if (!user) {
    const err = new Error('USER_NOT_FOUND');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const meta = {
    destinyShards: user.destinyShards ?? 0,
    unlockedTreeNodes: user.unlockedTreeNodes ?? [],
  };

  if (!canUnlockNode(meta, nodeId)) {
    const err = new Error('CANNOT_UNLOCK');
    err.code = 'CANNOT_UNLOCK';
    throw err;
  }

  const def = getNodeDef(nodeId);
  const nextShards = meta.destinyShards - def.cost;
  const nextUnlocked = [...meta.unlockedTreeNodes, nodeId];

  await getDb()
    .collection(COLLECTIONS.USERS)
    .doc(user._id)
    .update({
      data: {
        destinyShards: nextShards,
        unlockedTreeNodes: nextUnlocked,
        updatedDate: serverDate(),
      },
    });

  return {
    destinyShards: nextShards,
    diamond: user.diamond ?? 0,
    achievements: user.achievements ?? [],
    codex: {
      monsters: user.pveCodex?.monsters ?? [],
      equipment: user.pveCodex?.equipment ?? [],
    },
    unlockedTreeNodes: nextUnlocked,
  };
}

/**
 * 重置命运树（→ specs/game-design/命运树设计V1.md §七）：
 * 扣除 TREE_RESET_DIAMOND_COST(20) 钻石，退还所有已解锁节点的命运碎片总和，清空 unlockedTreeNodes。
 * 校验失败抛出带 code 的 Error：INSUFFICIENT_DIAMOND / TREE_ALREADY_EMPTY。
 */
async function resetUserTreeNodes(userId) {
  const { DESTINY_TREE_NODES } = require('./pve/PveDestinyTree');
  const RESET_COST = 20;

  const user = await getUserById(userId);
  if (!user) {
    const err = new Error('USER_NOT_FOUND'); err.code = 'USER_NOT_FOUND'; throw err;
  }

  const unlocked = user.unlockedTreeNodes ?? [];
  if (unlocked.length === 0) {
    const err = new Error('命运树尚未解锁任何节点'); err.code = 'TREE_ALREADY_EMPTY'; throw err;
  }

  const diamond = user.diamond ?? 0;
  if (diamond < RESET_COST) {
    const err = new Error(`钻石不足（需要 ${RESET_COST}，当前 ${diamond}）`); err.code = 'INSUFFICIENT_DIAMOND'; throw err;
  }

  const nodeMap = Object.fromEntries(DESTINY_TREE_NODES.map((n) => [n.id, n.cost]));
  const refundShards = unlocked.reduce((sum, id) => sum + (nodeMap[id] ?? 0), 0);
  const nextShards = (user.destinyShards ?? 0) + refundShards;

  await getDb()
    .collection(COLLECTIONS.USERS)
    .doc(user._id)
    .update({
      data: {
        diamond: getDb().command.inc(-RESET_COST),
        destinyShards: nextShards,
        unlockedTreeNodes: [],
        updatedDate: serverDate(),
      },
    });

  return {
    destinyShards: nextShards,
    diamond: diamond - RESET_COST,
    achievements: user.achievements ?? [],
    codex: {
      monsters: user.pveCodex?.monsters ?? [],
      equipment: user.pveCodex?.equipment ?? [],
    },
    unlockedTreeNodes: [],
  };
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
 * 写入/覆盖用户的 PVE 存档（每用户一条活跃存档，→ ddl-sql.md §1）。
 * 不存在则创建；已存在则按乐观锁版本覆盖更新。
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
  getUserPveMeta,
  updateUserPveMeta,
  unlockUserTreeNode,
  resetUserTreeNodes,
  getPveSaveByUserId,
  putPveSave,
  deletePveSave,
};
