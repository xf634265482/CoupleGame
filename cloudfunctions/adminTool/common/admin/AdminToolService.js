const {
  getDb,
  getUserById,
  getUserByOpenId,
  getPveSaveByUserId,
  putPveSave,
  deletePveSave,
  clearPendingPveRun,
  serverDate,
} = require('../db');
const { COLLECTIONS } = require('../constants');
const { DESTINY_TREE_NODES } = require('../pve/PveDestinyTree');
const { STAMINA_MAX } = require('../pve/PveStamina');
const {
  ADMIN_ACTIONS,
  RESOURCE_TYPES,
  RESOURCE_LIMITS,
  LOG_LIMIT,
  RESET_LEADERBOARD_CONFIRM,
  getCurrentEnvId,
  getEnvLabel,
} = require('./AdminConstants');

function getPveBalanceApi() {
  return require('../pve/PveBalance');
}

const UNIT_SCOPE_CHAPTER_MAP = {
  'boss:GOBLIN_CHIEF': 'chapter_1',
  'monster:GOBLIN_WARRIOR': 'chapter_1',
  'monster:GOBLIN_ARCHER': 'chapter_1',
  'monster:FROST_GOBLIN': 'chapter_1',
  'monster:FIRE_GOBLIN': 'chapter_1',
  'monster:SPIRIT_RAT': 'chapter_1',
  'boss:QUICKSAND_SCORPION': 'chapter_2',
  'monster:DESERT_RAIDER': 'chapter_2',
  'monster:SANDWORM_LARVA': 'chapter_2',
  'monster:POISON_SCORPION': 'chapter_2',
  'monster:SPIRIT_BEETLE': 'chapter_2',
  'boss:FROST_GIANT': 'chapter_3',
  'monster:SNOW_WOLF': 'chapter_3',
  'monster:ICE_SLIME': 'chapter_3',
  'monster:FROST_SPRITE': 'chapter_3',
  'monster:SPIRIT_ELF': 'chapter_3',
  'boss:LAVA_LORD': 'chapter_4',
  'monster:LAVA_GRUNT': 'chapter_4',
  'monster:LAVA_CRAB': 'chapter_4',
  'monster:FIRE_ELEMENTAL': 'chapter_4',
  'monster:SPIRIT_EMBER': 'chapter_4',
  'boss:FATE_GUARDIAN': 'chapter_5',
  'monster:SHADOW_ASSASSIN': 'chapter_5',
  'monster:FATE_WATCHER': 'chapter_5',
  'monster:VOID_WORM': 'chapter_5',
  'monster:SPIRIT_MIRAGE': 'chapter_5',
};

function ensureReason(reason) {
  const value = String(reason || '').trim();
  if (!value) {
    const err = new Error('ADMIN_REASON_REQUIRED');
    err.code = 'ADMIN_REASON_REQUIRED';
    throw err;
  }
  return value;
}

function ensureIntegerAmount(amount) {
  if (!Number.isInteger(amount)) {
    const err = new Error('ADMIN_AMOUNT_MUST_BE_INTEGER');
    err.code = 'ADMIN_AMOUNT_MUST_BE_INTEGER';
    throw err;
  }
}

function ensureResourceLimit(resourceType, amount) {
  const limit = RESOURCE_LIMITS[resourceType];
  if (!limit) {
    const err = new Error('ADMIN_UNSUPPORTED_RESOURCE');
    err.code = 'ADMIN_UNSUPPORTED_RESOURCE';
    throw err;
  }
  if (Math.abs(amount) > limit) {
    const err = new Error(`ADMIN_AMOUNT_EXCEEDS_LIMIT:${limit}`);
    err.code = 'ADMIN_AMOUNT_EXCEEDS_LIMIT';
    throw err;
  }
}

async function getTargetUser({ userId, openId, keyword }) {
  const userIdText = String(userId || '').trim();
  const openIdText = String(openId || '').trim();
  const keywordText = String(keyword || '').trim();

  let user = null;
  if (userIdText) user = await getUserById(userIdText);
  if (!user && openIdText) user = await getUserByOpenId(openIdText);
  if (!user && keywordText) user = await getUserById(keywordText);
  if (!user && keywordText) user = await getUserByOpenId(keywordText);

  if (!user) {
    const err = new Error('GM_TARGET_USER_NOT_FOUND');
    err.code = 'GM_TARGET_USER_NOT_FOUND';
    throw err;
  }

  return user;
}

function toSaveSummary(save) {
  if (!save) return null;
  return {
    runSeed: save.runSeed,
    status: save.status,
    chapter: save.chapter,
    floor: save.floor,
    updatedAt: save.updatedAt,
    classId: save.player?.classId || '',
    runGold: Number(save.player?.gold || 0),
    bagCount: Array.isArray(save.player?.bag) ? save.player.bag.length : 0,
    scrolls: Number(save.player?.scrolls || 0),
    relicCount: Array.isArray(save.player?.relics) ? save.player.relics.length : 0,
  };
}

function getLastActiveAt(user) {
  return user.updatedDate || user.createdDate || user.updatedAt || user.createdAt || null;
}

function toPlayerListItem(user, save) {
  return {
    nickname: user.nickname || '玩家',
    openId: user._openid || '',
    userId: user.id,
    lastActiveAt: getLastActiveAt(user),
    diamond: Number(user.diamond || 0),
    destinyShards: Number(user.destinyShards || 0),
    highestFloor: Number(user.pveHighestFloor || 0),
    hasActiveExpedition: Boolean(save),
    chapter: Number(save?.chapter || 0),
    floor: Number(save?.floor || 0),
    classId: save?.player?.classId || '',
  };
}

function toPlayerView(user, save) {
  const unlockedTreeNodes = user.unlockedTreeNodes ?? [];
  const codex = user.pveCodex ?? {};
  return {
    nickname: user.nickname || '玩家',
    avatarUrl: user.avatarUrl || '',
    openId: user._openid || '',
    userId: user.id,
    lastActiveAt: getLastActiveAt(user),
    diamond: Number(user.diamond || 0),
    destinyShards: Number(user.destinyShards || 0),
    highestFloor: Number(user.pveHighestFloor || 0),
    tutorialCompleted: user.pveTutorialCompleted === true,
    stamina: Number(user.pveStamina || 0),
    hasPendingRun: Number.isInteger(user.pvePendingRunSeed) && user.pvePendingRunSeed > 0,
    destinyTreeProgress: {
      unlockedCount: unlockedTreeNodes.length,
      unlockedNodes: unlockedTreeNodes,
      totalNodes: DESTINY_TREE_NODES.length,
    },
    codexCounts: {
      monsters: Array.isArray(codex.monsters) ? codex.monsters.length : 0,
      equipment: Array.isArray(codex.equipment) ? codex.equipment.length : 0,
      relics: Array.isArray(codex.relics) ? codex.relics.length : 0,
    },
    activeExpedition: save ? {
      chapter: Number(save.chapter || 0),
      floor: Number(save.floor || 0),
      classId: save.player?.classId || '',
      runGold: Number(save.player?.gold || 0),
      bagCount: Array.isArray(save.player?.bag) ? save.player.bag.length : 0,
      scrolls: Number(save.player?.scrolls || 0),
      relicCount: Array.isArray(save.player?.relics) ? save.player.relics.length : 0,
      saveUpdatedAt: save.updatedAt || null,
    } : null,
  };
}

async function writeAdminLog({ account, targetUser, action, payload, before, after, reason, requestSource, success }) {
  const result = await getDb().collection(COLLECTIONS.ADMIN_LOGS).add({
    data: {
      adminAccountId: account.id,
      adminUsername: account.username,
      targetOpenId: targetUser?._openid || '',
      targetUserId: targetUser?.id || '',
      action,
      payload: payload || {},
      before: before || null,
      after: after || null,
      reason: reason || '',
      requestSource: requestSource || 'gm-web',
      env: {
        envId: getCurrentEnvId(),
        envLabel: getEnvLabel(),
      },
      success: success !== false,
      createdAt: serverDate(),
    },
  });
  return {
    logId: result?._id || '',
  };
}

async function getPlayerAction(payload) {
  const user = await getTargetUser(payload || {});
  const save = await getPveSaveByUserId(user.id);
  return {
    ok: true,
    player: toPlayerView(user, save),
  };
}

async function listPlayersAction(payload) {
  const keyword = String(payload?.keyword || '').trim();
  const safeLimit = Math.max(1, Math.min(50, Number(payload?.limit) || 20));
  const db = getDb();

  let users = [];
  if (keyword) {
    const matchedMap = new Map();
    const exactUser = await getUserById(keyword);
    if (exactUser) matchedMap.set(exactUser.id, exactUser);
    const exactOpen = await getUserByOpenId(keyword);
    if (exactOpen) matchedMap.set(exactOpen.id, exactOpen);

    if (matchedMap.size < safeLimit) {
      const nicknameQuery = await db
        .collection(COLLECTIONS.USERS)
        .where({
          nickname: db.RegExp({
            regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            options: 'i',
          }),
        })
        .limit(safeLimit)
        .get();
      for (const user of nicknameQuery.data || []) {
        matchedMap.set(user.id, user);
      }
    }

    users = Array.from(matchedMap.values()).slice(0, safeLimit);
  } else {
    const recentUsers = await db
      .collection(COLLECTIONS.USERS)
      .orderBy('updatedDate', 'desc')
      .limit(safeLimit)
      .get();
    users = recentUsers.data || [];
  }

  const players = [];
  for (const user of users) {
    const save = await getPveSaveByUserId(user.id);
    players.push(toPlayerListItem(user, save));
  }

  players.sort((a, b) => {
    const left = Number(a.lastActiveAt || 0);
    const right = Number(b.lastActiveAt || 0);
    return right - left;
  });

  return {
    ok: true,
    players,
  };
}

async function adjustResourcesAction(account, payload, requestSource) {
  const resourceType = String(payload?.resourceType || '').trim();
  const amount = Number(payload?.amount);
  const reason = ensureReason(payload?.reason);
  ensureIntegerAmount(amount);
  ensureResourceLimit(resourceType, amount);

  const user = await getTargetUser(payload || {});
  const save = await getPveSaveByUserId(user.id);

  let before = null;
  let after = null;

  if (resourceType === RESOURCE_TYPES.RUN_GOLD) {
    if (!save) {
      const err = new Error('GM_ACTIVE_SAVE_REQUIRED');
      err.code = 'GM_ACTIVE_SAVE_REQUIRED';
      throw err;
    }

    const currentGold = Number(save.player?.gold || 0);
    const nextGold = currentGold + amount;
    if (nextGold < 0) {
      const err = new Error('GM_RUN_GOLD_NEGATIVE_NOT_ALLOWED');
      err.code = 'GM_RUN_GOLD_NEGATIVE_NOT_ALLOWED';
      throw err;
    }

    const nextPlayer = { ...(save.player || {}), gold: nextGold };
    const saved = await putPveSave(user.id, {
      openId: save.openId,
      runSeed: save.runSeed,
      status: save.status,
      chapter: save.chapter,
      floor: save.floor,
      player: nextPlayer,
      floorState: save.floorState || null,
      balanceSnapshot: save.balanceSnapshot || null,
    }, save.version);

    before = { runGold: currentGold };
    after = { runGold: Number(saved.player?.gold || 0) };
  } else if (resourceType === RESOURCE_TYPES.DIAMOND || resourceType === RESOURCE_TYPES.DESTINY_SHARDS) {
    const fieldName = resourceType === RESOURCE_TYPES.DIAMOND ? 'diamond' : 'destinyShards';
    const currentValue = Number(user[fieldName] || 0);
    const nextValue = currentValue + amount;
    if (nextValue < 0) {
      const err = new Error('GM_RESOURCE_NEGATIVE_NOT_ALLOWED');
      err.code = 'GM_RESOURCE_NEGATIVE_NOT_ALLOWED';
      throw err;
    }

    await getDb().collection(COLLECTIONS.USERS).doc(user._id).update({
      data: {
        [fieldName]: nextValue,
        updatedDate: serverDate(),
      },
    });

    before = { [fieldName]: currentValue };
    after = { [fieldName]: nextValue };
  } else if (resourceType === RESOURCE_TYPES.STAMINA) {
    const currentValue = Number(user.pveStamina || 0);
    const nextValue = currentValue + amount;
    if (nextValue < 0) {
      const err = new Error('GM_RESOURCE_NEGATIVE_NOT_ALLOWED');
      err.code = 'GM_RESOURCE_NEGATIVE_NOT_ALLOWED';
      throw err;
    }

    await getDb().collection(COLLECTIONS.USERS).doc(user._id).update({
      data: {
        pveStamina: Math.min(STAMINA_MAX, nextValue),
        pveStaminaUpdatedAt: Date.now(),
        updatedDate: serverDate(),
      },
    });

    before = { stamina: currentValue };
    after = { stamina: Math.min(STAMINA_MAX, nextValue) };
  } else {
    const err = new Error('ADMIN_UNSUPPORTED_RESOURCE');
    err.code = 'ADMIN_UNSUPPORTED_RESOURCE';
    throw err;
  }

  const userAfter = await getUserById(user.id);
  const saveAfter = await getPveSaveByUserId(user.id);
  await writeAdminLog({
    account,
    targetUser: user,
    action: ADMIN_ACTIONS.ADJUST_RESOURCES,
    payload: {
      resourceType,
      amount,
    },
    before,
    after,
    reason,
    requestSource,
    success: true,
  });

  return {
    ok: true,
    player: toPlayerView(userAfter, saveAfter),
  };
}

async function listBalanceConfigsAction() {
  const { listBalanceConfigs, buildBalanceCatalog } = getPveBalanceApi();
  return {
    ok: true,
    configs: await listBalanceConfigs(),
    catalog: buildBalanceCatalog(),
  };
}

async function getBalanceConfigAction(payload) {
  const { getBalanceConfig, toBalanceConfigView, buildBalanceCatalog } = getPveBalanceApi();
  const scopeType = String(payload?.scopeType || '').trim();
  const scopeId = String(payload?.scopeId || '').trim();
  const config = await getBalanceConfig(scopeType, scopeId);
  return {
    ok: true,
    configDoc: toBalanceConfigView(config),
    catalog: buildBalanceCatalog(),
  };
}

async function saveBalanceConfigAction(account, payload, requestSource) {
  const { saveBalanceConfig, listBalanceConfigs, buildBalanceCatalog, getBalanceConfig, toBalanceConfigView } = getPveBalanceApi();
  const reason = ensureReason(payload?.reason);
  const scopeType = String(payload?.scopeType || '').trim();
  const scopeId = String(payload?.scopeId || '').trim();
  const result = await saveBalanceConfig({
    scopeType,
    scopeId,
    config: payload?.config,
    account,
  });

  const logResult = await writeAdminLog({
    account,
    targetUser: null,
    action: ADMIN_ACTIONS.SAVE_BALANCE_CONFIG,
    payload: {
      scopeType,
      scopeId,
      config: payload?.config || {},
    },
    before: result.before,
    after: result.after,
    reason,
    requestSource,
    success: true,
  });

  const persistedConfig = await getBalanceConfig(scopeType, scopeId);
  const persistedConfigView = toBalanceConfigView(persistedConfig);

  return {
    ok: true,
    configDoc: persistedConfigView || result.after,
    configs: await listBalanceConfigs(),
    catalog: buildBalanceCatalog(),
    verification: {
      configPersisted: Boolean(persistedConfigView),
      logWritten: Boolean(logResult.logId),
      logId: logResult.logId || '',
      scopeType,
      scopeId,
    },
  };
}

async function resetBalanceConfigAction(account, payload, requestSource) {
  const { resetBalanceConfig, listBalanceConfigs, buildBalanceCatalog } = getPveBalanceApi();
  const reason = ensureReason(payload?.reason);
  const scopeType = String(payload?.scopeType || '').trim();
  const scopeId = String(payload?.scopeId || '').trim();
  const result = await resetBalanceConfig(scopeType, scopeId);

  await writeAdminLog({
    account,
    targetUser: null,
    action: ADMIN_ACTIONS.RESET_BALANCE_CONFIG,
    payload: { scopeType, scopeId },
    before: result.before,
    after: result.after,
    reason,
    requestSource,
    success: true,
  });

  return {
    ok: true,
    removed: result.removed === true,
    configs: await listBalanceConfigs(),
    catalog: buildBalanceCatalog(),
  };
}

async function syncBalanceDocsPreviewAction() {
  const {
    buildBalanceCatalog,
    getDefaultBalanceConfig,
    listBalanceConfigs,
    loadBalanceSnapshot,
  } = getPveBalanceApi();

  return {
    ok: true,
    docSyncPreview: {
      generatedAt: Date.now(),
      envId: getCurrentEnvId(),
      envLabel: getEnvLabel(),
      defaultConfig: getDefaultBalanceConfig(),
      snapshot: await loadBalanceSnapshot(),
      configs: await listBalanceConfigs(),
      catalog: buildBalanceCatalog(),
      unitScopeChapterMap: UNIT_SCOPE_CHAPTER_MAP,
    },
  };
}

async function syncBalanceDocsLogAction(account, payload, requestSource) {
  const reason = ensureReason(payload?.reason || '同步仓库数值文档');
  const files = Array.isArray(payload?.files) ? payload.files : [];
  const summary = payload?.summary && typeof payload.summary === 'object' ? payload.summary : {};
  const syncedAt = payload?.syncedAt || null;

  const logResult = await writeAdminLog({
    account,
    targetUser: null,
    action: ADMIN_ACTIONS.SYNC_BALANCE_DOCS_LOG,
    payload: {
      files,
      summary,
      syncedAt,
    },
    before: {
      requestedFileCount: files.length,
    },
    after: {
      syncedAt,
      updatedFileCount: Number(summary.updatedFileCount || 0),
      targetFiles: Array.isArray(summary.targetFiles) ? summary.targetFiles : [],
    },
    reason,
    requestSource,
    success: true,
  });

  return {
    ok: true,
    logId: logResult.logId,
  };
}

async function resetExpeditionAction(account, payload, requestSource) {
  const reason = ensureReason(payload?.reason);
  const user = await getTargetUser(payload || {});
  const save = await getPveSaveByUserId(user.id);
  const before = {
    save: toSaveSummary(save),
    hasPendingRun: Number.isInteger(user.pvePendingRunSeed) && user.pvePendingRunSeed > 0,
  };

  if (save) {
    await deletePveSave(save._id);
  }
  await clearPendingPveRun(user.id);

  const userAfter = await getUserById(user.id);
  await writeAdminLog({
    account,
    targetUser: user,
    action: ADMIN_ACTIONS.RESET_EXPEDITION,
    payload: {},
    before,
    after: {
      save: null,
      hasPendingRun: Number.isInteger(userAfter?.pvePendingRunSeed) && userAfter.pvePendingRunSeed > 0,
    },
    reason,
    requestSource,
    success: true,
  });

  return {
    ok: true,
    player: toPlayerView(userAfter, null),
  };
}

async function resetTutorialAction(account, payload, requestSource) {
  const reason = ensureReason(payload?.reason);
  const user = await getTargetUser(payload || {});
  const before = { tutorialCompleted: user.pveTutorialCompleted === true };

  await getDb().collection(COLLECTIONS.USERS).doc(user._id).update({
    data: {
      pveTutorialCompleted: false,
      updatedDate: serverDate(),
    },
  });

  const userAfter = await getUserById(user.id);
  const saveAfter = await getPveSaveByUserId(user.id);
  await writeAdminLog({
    account,
    targetUser: user,
    action: ADMIN_ACTIONS.RESET_TUTORIAL,
    payload: {},
    before,
    after: { tutorialCompleted: false },
    reason,
    requestSource,
    success: true,
  });

  return {
    ok: true,
    player: toPlayerView(userAfter, saveAfter),
  };
}

function getRefundFromNodes(nodeIds) {
  const costMap = new Map(DESTINY_TREE_NODES.map((node) => [node.id, Number(node.cost || 0)]));
  return (nodeIds || []).reduce((sum, nodeId) => sum + (costMap.get(nodeId) || 0), 0);
}

async function resetDestinyTreeOnlyAction(account, payload, requestSource) {
  const reason = ensureReason(payload?.reason);
  const user = await getTargetUser(payload || {});
  const beforeNodes = Array.isArray(user.unlockedTreeNodes) ? user.unlockedTreeNodes : [];

  await getDb().collection(COLLECTIONS.USERS).doc(user._id).update({
    data: {
      unlockedTreeNodes: [],
      updatedDate: serverDate(),
    },
  });

  const userAfter = await getUserById(user.id);
  const saveAfter = await getPveSaveByUserId(user.id);
  await writeAdminLog({
    account,
    targetUser: user,
    action: ADMIN_ACTIONS.RESET_DESTINY_TREE_ONLY,
    payload: {},
    before: {
      unlockedTreeNodes: beforeNodes,
      destinyShards: Number(user.destinyShards || 0),
    },
    after: {
      unlockedTreeNodes: [],
      destinyShards: Number(userAfter?.destinyShards || 0),
    },
    reason,
    requestSource,
    success: true,
  });

  return {
    ok: true,
    player: toPlayerView(userAfter, saveAfter),
  };
}

async function resetDestinyTreeAndRefundAction(account, payload, requestSource) {
  const reason = ensureReason(payload?.reason);
  const user = await getTargetUser(payload || {});
  const beforeNodes = Array.isArray(user.unlockedTreeNodes) ? user.unlockedTreeNodes : [];
  const refund = getRefundFromNodes(beforeNodes);

  await getDb().collection(COLLECTIONS.USERS).doc(user._id).update({
    data: {
      unlockedTreeNodes: [],
      destinyShards: Number(user.destinyShards || 0) + refund,
      updatedDate: serverDate(),
    },
  });

  const userAfter = await getUserById(user.id);
  const saveAfter = await getPveSaveByUserId(user.id);
  await writeAdminLog({
    account,
    targetUser: user,
    action: ADMIN_ACTIONS.RESET_DESTINY_TREE_AND_REFUND,
    payload: { refund },
    before: {
      unlockedTreeNodes: beforeNodes,
      destinyShards: Number(user.destinyShards || 0),
    },
    after: {
      unlockedTreeNodes: [],
      destinyShards: Number(userAfter?.destinyShards || 0),
    },
    reason,
    requestSource,
    success: true,
  });

  return {
    ok: true,
    player: toPlayerView(userAfter, saveAfter),
  };
}

async function resetLeaderboardGlobalAction(account, payload, requestSource) {
  const reason = ensureReason(payload?.reason);
  const confirmText = String(payload?.confirmText || '').trim();
  if (confirmText !== RESET_LEADERBOARD_CONFIRM) {
    const err = new Error('GM_RESET_LEADERBOARD_CONFIRM_REQUIRED');
    err.code = 'GM_RESET_LEADERBOARD_CONFIRM_REQUIRED';
    throw err;
  }

  const command = getDb().command;
  const query = getDb().collection(COLLECTIONS.USERS).where({ pveHighestFloor: command.gt(0) });
  const { total } = await query.count();
  await query.update({
    data: {
      pveHighestFloor: 0,
      pveHighestFloorUpdatedAt: command.remove(),
      updatedDate: serverDate(),
    },
  });

  await writeAdminLog({
    account,
    targetUser: null,
    action: ADMIN_ACTIONS.RESET_LEADERBOARD_GLOBAL,
    payload: {},
    before: { affectedUsers: total },
    after: { affectedUsers: total, pveHighestFloor: 0 },
    reason,
    requestSource,
    success: true,
  });

  return {
    ok: true,
    affectedUsers: total,
  };
}

async function listLogsAction(payload) {
  const safeLimit = Math.max(1, Math.min(LOG_LIMIT, Number(payload?.limit) || LOG_LIMIT));
  const { data } = await getDb()
    .collection(COLLECTIONS.ADMIN_LOGS)
    .orderBy('createdAt', 'desc')
    .limit(safeLimit)
    .get();
  return {
    ok: true,
    logs: data,
  };
}

async function handleAdminAction({ account, action, payload, requestSource }) {
  switch (action) {
  case ADMIN_ACTIONS.GET_PLAYER:
    return getPlayerAction(payload);
  case ADMIN_ACTIONS.LIST_PLAYERS:
    return listPlayersAction(payload);
  case ADMIN_ACTIONS.LIST_BALANCE_CONFIGS:
    return listBalanceConfigsAction();
  case ADMIN_ACTIONS.GET_BALANCE_CONFIG:
    return getBalanceConfigAction(payload);
  case ADMIN_ACTIONS.SAVE_BALANCE_CONFIG:
    return saveBalanceConfigAction(account, payload, requestSource);
  case ADMIN_ACTIONS.RESET_BALANCE_CONFIG:
    return resetBalanceConfigAction(account, payload, requestSource);
  case ADMIN_ACTIONS.SYNC_BALANCE_DOCS_PREVIEW:
    return syncBalanceDocsPreviewAction();
  case ADMIN_ACTIONS.SYNC_BALANCE_DOCS_LOG:
    return syncBalanceDocsLogAction(account, payload, requestSource);
  case ADMIN_ACTIONS.ADJUST_RESOURCES:
    return adjustResourcesAction(account, payload, requestSource);
  case ADMIN_ACTIONS.RESET_EXPEDITION:
    return resetExpeditionAction(account, payload, requestSource);
  case ADMIN_ACTIONS.RESET_TUTORIAL:
    return resetTutorialAction(account, payload, requestSource);
  case ADMIN_ACTIONS.RESET_DESTINY_TREE_ONLY:
    return resetDestinyTreeOnlyAction(account, payload, requestSource);
  case ADMIN_ACTIONS.RESET_DESTINY_TREE_AND_REFUND:
    return resetDestinyTreeAndRefundAction(account, payload, requestSource);
  case ADMIN_ACTIONS.RESET_LEADERBOARD_GLOBAL:
    return resetLeaderboardGlobalAction(account, payload, requestSource);
  case ADMIN_ACTIONS.LIST_LOGS:
    return listLogsAction(payload);
  default: {
    const err = new Error('ADMIN_ACTION_NOT_ALLOWED');
    err.code = 'ADMIN_ACTION_NOT_ALLOWED';
    throw err;
  }
  }
}

module.exports = {
  handleAdminAction,
  toPlayerView,
};
