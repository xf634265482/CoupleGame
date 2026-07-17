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
const {
  COLLECTIONS,
  PVE_DIFFICULTY_ORDER,
  PVE_FLOORS_PER_CHAPTER,
  PVE_TOTAL_FLOORS,
} = require('../constants');
const { STAMINA_MAX } = require('../pve/PveStamina');
const { normalizeProfile, resetCampInventory, resetExpeditionProgress } = require('../pve/PveProfile');
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

const PLAYER_CLASS_IDS = new Set(['ADVENTURER', 'BERSERKER', 'ARCHER', 'ROGUE']);
const AWAKEN_FORM_DEFS = {
  BERSERKER_1: { classId: 'BERSERKER', name: '鐙傛垬澹风牬闃靛瀷', statTrait: 'eagle_eye', traitId: 'awakened_cleave' },
  BERSERKER_2: { classId: 'BERSERKER', name: '鐙傛垬澹峰棞鏉€鍨?, statTrait: 'swift', traitId: 'awakened_frenzy' },
  ARCHER_1: { classId: 'ARCHER', name: '灏勬墜路寮哄嚮鍨?, statTrait: 'strengthen_attack_up', traitId: 'awakened_power_shot' },
  ARCHER_2: { classId: 'ARCHER', name: '灏勬墜路娓稿嚮鍨?, statTrait: 'swift', traitId: 'awakened_volley' },
  ROGUE_1: { classId: 'ROGUE', name: '闅愬尶鑰吢峰鍐冲瀷', statTrait: 'strengthen_attack_up', traitId: 'awakened_execute' },
  ROGUE_2: { classId: 'ROGUE', name: '闅愬尶鑰吢峰奖琚瀷', statTrait: 'eagle_eye', traitId: 'awakened_shadow_strike' },
};
const AWAKEN_FORM_IDS = new Set(Object.keys(AWAKEN_FORM_DEFS));
const AWAKEN_TRAIT_IDS = new Set(
  Object.values(AWAKEN_FORM_DEFS).flatMap((form) => [form.statTrait, form.traitId]),
);

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

function ensureActiveSave(save) {
  if (save) return save;
  const err = new Error('GM_ACTIVE_SAVE_REQUIRED');
  err.code = 'GM_ACTIVE_SAVE_REQUIRED';
  throw err;
}

function ensurePlayerClassId(classId) {
  const value = String(classId || '').trim();
  if (!PLAYER_CLASS_IDS.has(value)) {
    const err = new Error('GM_INVALID_CLASS_ID');
    err.code = 'GM_INVALID_CLASS_ID';
    throw err;
  }
  return value;
}

function ensureTargetFloor(targetFloor) {
  const value = Number(targetFloor);
  if (!Number.isInteger(value)) {
    const err = new Error('GM_TARGET_FLOOR_MUST_BE_INTEGER');
    err.code = 'GM_TARGET_FLOOR_MUST_BE_INTEGER';
    throw err;
  }
  if (value < 1 || value > PVE_TOTAL_FLOORS) {
    const err = new Error(`GM_TARGET_FLOOR_OUT_OF_RANGE:${PVE_TOTAL_FLOORS}`);
    err.code = 'GM_TARGET_FLOOR_OUT_OF_RANGE';
    throw err;
  }
  return value;
}

function ensureDifficultyTier(difficultyTier) {
  const value = String(difficultyTier || '').trim().toUpperCase();
  if (!PVE_DIFFICULTY_ORDER.includes(value)) {
    const err = new Error('GM_INVALID_DIFFICULTY_TIER');
    err.code = 'GM_INVALID_DIFFICULTY_TIER';
    throw err;
  }
  return value;
}

function chapterOfFloor(floor) {
  if (!Number.isInteger(floor) || floor <= 0) return 1;
  return Math.floor((floor - 1) / PVE_FLOORS_PER_CHAPTER) + 1;
}

function getDisplayedFloor(save) {
  if (!save) return 0;
  const baseFloor = Number(save.floor || 0);
  if (save.floorState) return Math.max(1, Math.min(PVE_TOTAL_FLOORS, baseFloor));
  return Math.max(1, Math.min(PVE_TOTAL_FLOORS, baseFloor + 1));
}

function getDisplayedChapter(save) {
  if (!save) return 0;
  return chapterOfFloor(getDisplayedFloor(save));
}

function ensureAwakenForm(classId, awakenForm) {
  const value = String(awakenForm || '').trim();
  if (!value) return '';
  if (!AWAKEN_FORM_IDS.has(value)) {
    const err = new Error('GM_INVALID_AWAKEN_FORM');
    err.code = 'GM_INVALID_AWAKEN_FORM';
    throw err;
  }
  if (AWAKEN_FORM_DEFS[value].classId !== classId) {
    const err = new Error('GM_AWAKEN_FORM_CLASS_MISMATCH');
    err.code = 'GM_AWAKEN_FORM_CLASS_MISMATCH';
    throw err;
  }
  return value;
}

function buildNextClassStatePlayer(player, classId, awakenForm) {
  const nextAwakenForm = classId === 'ADVENTURER' ? '' : ensureAwakenForm(classId, awakenForm);
  const currentTraits = Array.isArray(player?.classTraits) ? player.classTraits : [];
  const cleanedTraits = currentTraits.filter((traitId) => !AWAKEN_TRAIT_IDS.has(traitId));
  const nextTraits = [...cleanedTraits];

  if (nextAwakenForm) {
    const form = AWAKEN_FORM_DEFS[nextAwakenForm];
    if (!nextTraits.includes(form.statTrait)) nextTraits.push(form.statTrait);
    if (!nextTraits.includes(form.traitId)) nextTraits.push(form.traitId);
  }

  return {
    ...(player || {}),
    classId,
    awakenForm: nextAwakenForm || undefined,
    classTraits: nextTraits,
  };
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

async function getUserByDocId(docId) {
  if (!docId) return null;
  try {
    const { data } = await getDb().collection(COLLECTIONS.USERS).doc(docId).get();
    return data || null;
  } catch (err) {
    const code = String(err?.code || err?.errCode || err?.message || '');
    if (code.includes('NOT_FOUND') || code.includes('-502005')) return null;
    throw err;
  }
}

async function collectTargetUserDocs(user) {
  const docs = new Map();
  const addDoc = (entry) => {
    if (entry?._id) docs.set(entry._id, entry);
  };
  addDoc(user);
  const tasks = [];
  if (user?._id) tasks.push(getUserByDocId(user._id).then((entry) => [entry]));
  if (user?.id) {
    tasks.push(getDb()
      .collection(COLLECTIONS.USERS)
      .where({ id: user.id })
      .limit(10)
      .get()
      .then(({ data }) => data || []));
  }
  if (user?._openid) {
    tasks.push(getDb()
      .collection(COLLECTIONS.USERS)
      .where({ _openid: user._openid })
      .limit(10)
      .get()
      .then(({ data }) => data || []));
  }
  const results = await Promise.all(tasks);
  for (const entries of results) {
    for (const entry of entries || []) addDoc(entry);
  }
  return [...docs.values()];
}

async function getUserDocsByDocIds(docIds) {
  const uniqueDocIds = [...new Set((docIds || []).filter(Boolean))];
  const docs = await Promise.all(uniqueDocIds.map((docId) => getUserByDocId(docId)));
  return docs.filter(Boolean);
}

async function overwriteUserDocsByIds(docIds, data) {
  const uniqueDocIds = [...new Set((docIds || []).filter(Boolean))];
  await Promise.all(uniqueDocIds.map((docId) => (
    getDb().collection(COLLECTIONS.USERS).doc(docId).update({ data })
  )));
  return uniqueDocIds;
}

async function overwriteUserDocsWithPveProfile(docIds, profile, extra = {}, removeFields = []) {
  const uniqueDocIds = [...new Set((docIds || []).filter(Boolean))];
  const normalizedProfile = normalizeProfile(profile);
  const docs = await getUserDocsByDocIds(uniqueDocIds);
  await Promise.all(docs.map((doc) => {
    const { _id, ...docData } = doc;
    const nextDoc = {
      ...docData,
      ...extra,
      pveProfile: normalizedProfile,
    };
    for (const fieldName of removeFields) {
      delete nextDoc[fieldName];
    }
    return getDb().collection(COLLECTIONS.USERS).doc(_id).set({ data: nextDoc });
  }));
  return docs.map((doc) => doc._id);
}

function summarizeResetUserDoc(userDoc) {
  const profile = normalizeProfile(userDoc?.pveProfile);
  return {
    docId: userDoc?._id || '',
    userId: userDoc?.id || '',
    openId: userDoc?._openid || '',
    nickname: userDoc?.nickname || '',
    updatedDate: userDoc?.updatedDate || null,
    ...buildCampResetVerification(profile),
  };
}

function buildUserDocsResetVerification(docs) {
  const userDocs = docs.map(summarizeResetUserDoc);
  return {
    matchedUserDocCount: userDocs.length,
    userDocs,
    staleUserDocs: userDocs.filter((doc) => !isCampResetVerificationClear(doc)),
  };
}

async function verifyUserDocsResetByIds(docIds) {
  return buildUserDocsResetVerification(await getUserDocsByDocIds(docIds));
}

function toSaveSummary(save) {
  if (!save) return null;
  return {
    runSeed: save.runSeed,
    status: save.status,
    chapter: getDisplayedChapter(save),
    floor: getDisplayedFloor(save),
    persistedChapter: Number(save.chapter || 0),
    persistedFloor: Number(save.floor || 0),
    difficultyTier: String(save.difficultyTier || ''),
    floorStatePresent: Boolean(save.floorState),
    updatedAt: save.updatedAt,
    classId: save.player?.classId || '',
    awakenForm: save.player?.awakenForm || '',
    classTraits: Array.isArray(save.player?.classTraits) ? save.player.classTraits : [],
    classFragments: save.player?.classFragments || {},
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
    nickname: user.nickname || '鐜╁',
    openId: user._openid || '',
    userId: user.id,
    lastActiveAt: getLastActiveAt(user),
    diamond: Number(user.diamond || 0),
    destinyShards: Number(user.destinyShards || 0),
    highestFloor: Number(user.pveHighestFloor || 0),
    hasActiveExpedition: Boolean(save),
    chapter: getDisplayedChapter(save),
    floor: getDisplayedFloor(save),
    classId: save?.player?.classId || '',
  };
}

function toPlayerView(user, save) {
  const profile = normalizeProfile(user.pveProfile);
  return {
    nickname: user.nickname || '鐜╁',
    avatarUrl: user.avatarUrl || '',
    openId: user._openid || '',
    userId: user.id,
    lastActiveAt: getLastActiveAt(user),
    diamond: Number(user.diamond || 0),
    highestFloor: Number(user.pveHighestFloor || 0),
    tutorialCompleted: user.pveTutorialCompleted === true,
    stamina: Number(user.pveStamina || 0),
    hasPendingRun: Number.isInteger(user.pvePendingRunSeed) && user.pvePendingRunSeed > 0,
    campInventory: {
      minghen: Object.keys(profile.minghenCollection || {}).length,
      minghenLoadout: Array.isArray(profile.minghenLoadout) ? profile.minghenLoadout.length : 0,
      minghenPresets: Array.isArray(profile.minghenPresets) ? profile.minghenPresets.length : 0,
      equipment: Array.isArray(profile.equipmentInventory) ? profile.equipmentInventory.length : 0,
      equipmentLoadout: Object.keys(profile.equipmentLoadout || {}).length,
      activeChallengeId: profile.activeChallengeId || '',
    },
    activeExpedition: save ? {
      chapter: getDisplayedChapter(save),
      floor: getDisplayedFloor(save),
      classId: save.player?.classId || '',
      awakenForm: save.player?.awakenForm || '',
      classFragments: save.player?.classFragments || {},
      difficultyTier: String(save.difficultyTier || ''),
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

async function removeDocumentIfExists(collectionName, docId) {
  if (!docId) return false;
  try {
    await getDb().collection(collectionName).doc(docId).remove();
    return true;
  } catch (err) {
    const code = String(err?.code || err?.errCode || err?.message || '');
    if (code.includes('NOT_FOUND') || code.includes('-502005')) return false;
    throw err;
  }
}

async function removeActivePveChallengesForUser(userId, explicitChallengeId = '') {
  const removedIds = new Set();
  if (await removeDocumentIfExists(COLLECTIONS.PVE_CHALLENGES, explicitChallengeId)) {
    removedIds.add(explicitChallengeId);
  }
  for (let guard = 0; guard < 10; guard += 1) {
    const { data } = await getDb()
      .collection(COLLECTIONS.PVE_CHALLENGES)
      .where({ userId, status: 'ACTIVE' })
      .limit(20)
      .get();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const challenge of data) {
      if (!challenge?._id || removedIds.has(challenge._id)) continue;
      if (await removeDocumentIfExists(COLLECTIONS.PVE_CHALLENGES, challenge._id)) {
        removedIds.add(challenge._id);
      }
    }
  }
  return [...removedIds];
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
  } else if (resourceType === RESOURCE_TYPES.DIAMOND) {
    const fieldName = 'diamond';
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

async function updatePlayerClassStateAction(account, payload, requestSource) {
  const reason = ensureReason(payload?.reason);
  const classId = ensurePlayerClassId(payload?.classId);
  const user = await getTargetUser(payload || {});
  const save = ensureActiveSave(await getPveSaveByUserId(user.id));
  const nextPlayer = buildNextClassStatePlayer(save.player, classId, payload?.awakenForm);

  const before = {
    save: toSaveSummary(save),
  };

  await putPveSave(user.id, {
    openId: save.openId,
    runSeed: save.runSeed,
    status: save.status,
    chapter: save.chapter,
    floor: save.floor,
    player: nextPlayer,
    floorState: save.floorState || null,
    balanceSnapshot: save.balanceSnapshot || null,
    difficultyTier: save.difficultyTier || null,
  }, save.version);

  const userAfter = await getUserById(user.id);
  const saveAfter = await getPveSaveByUserId(user.id);
  await writeAdminLog({
    account,
    targetUser: user,
    action: ADMIN_ACTIONS.UPDATE_PLAYER_CLASS_STATE,
    payload: {
      classId,
      awakenForm: nextPlayer.awakenForm || '',
    },
    before,
    after: {
      save: toSaveSummary(saveAfter),
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

async function jumpExpeditionFloorAction(account, payload, requestSource) {
  const reason = ensureReason(payload?.reason);
  const targetFloor = ensureTargetFloor(payload?.targetFloor);
  const difficultyTier = ensureDifficultyTier(payload?.difficultyTier);
  const user = await getTargetUser(payload || {});
  const save = ensureActiveSave(await getPveSaveByUserId(user.id));
  const targetChapter = chapterOfFloor(targetFloor);
  const persistedFloor = Math.max(0, targetFloor - 1);
  const nextPlayer = {
    ...(save.player || {}),
    maxChapterCleared: Math.max(Number(save.player?.maxChapterCleared || 0), Math.max(0, targetChapter - 1)),
  };

  const before = {
    save: toSaveSummary(save),
  };

  await putPveSave(user.id, {
    openId: save.openId,
    runSeed: save.runSeed,
    status: 'ACTIVE',
    chapter: persistedFloor > 0 ? chapterOfFloor(persistedFloor) : 1,
    floor: persistedFloor,
    player: nextPlayer,
    floorState: null,
    balanceSnapshot: save.balanceSnapshot || null,
    difficultyTier,
  }, save.version);

  const userAfter = await getUserById(user.id);
  const saveAfter = await getPveSaveByUserId(user.id);
  await writeAdminLog({
    account,
    targetUser: user,
    action: ADMIN_ACTIONS.JUMP_EXPEDITION_FLOOR,
    payload: {
      targetFloor,
      difficultyTier,
    },
    before,
    after: {
      save: toSaveSummary(saveAfter),
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

async function getBalanceConfigDetailAction(payload) {
  const { getBalanceConfigDetail } = getPveBalanceApi();
  const scopeType = String(payload?.scopeType || '').trim();
  const scopeId = String(payload?.scopeId || '').trim();
  const detail = await getBalanceConfigDetail(scopeType, scopeId);
  return {
    ok: true,
    configDoc: detail.configDoc,
    configs: detail.configs,
    catalog: detail.catalog,
    balanceDetail: {
      scopeType: detail.scopeType,
      scopeId: detail.scopeId,
      overrideConfig: detail.overrideConfig,
      effectiveConfig: detail.effectiveConfig,
      codeDefaultConfig: detail.codeDefaultConfig,
      unitScopeChapterMap: detail.unitScopeChapterMap,
    },
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

async function removeBalanceFieldOverrideAction(account, payload, requestSource) {
  const { removeBalanceFieldOverride, listBalanceConfigs, buildBalanceCatalog, getBalanceConfigDetail } = getPveBalanceApi();
  const reason = ensureReason(payload?.reason);
  const scopeType = String(payload?.scopeType || '').trim();
  const scopeId = String(payload?.scopeId || '').trim();
  const section = String(payload?.section || '').trim();
  const field = String(payload?.field || '').trim();
  const beforeDetail = await getBalanceConfigDetail(scopeType, scopeId);
  const result = await removeBalanceFieldOverride({
    scopeType,
    scopeId,
    section,
    field,
    account,
  });
  const afterDetail = await getBalanceConfigDetail(scopeType, scopeId);

  const logResult = await writeAdminLog({
    account,
    targetUser: null,
    action: ADMIN_ACTIONS.REMOVE_BALANCE_FIELD_OVERRIDE,
    payload: { scopeType, scopeId, section, field },
    before: {
      configDoc: result.before,
      overrideConfig: beforeDetail.overrideConfig,
      effectiveConfig: beforeDetail.effectiveConfig,
      codeDefaultConfig: beforeDetail.codeDefaultConfig,
    },
    after: {
      configDoc: result.after,
      overrideConfig: afterDetail.overrideConfig,
      effectiveConfig: afterDetail.effectiveConfig,
      codeDefaultConfig: afterDetail.codeDefaultConfig,
      removed: result.removed === true,
    },
    reason,
    requestSource,
    success: true,
  });

  return {
    ok: true,
    removed: result.removed === true,
    configDoc: afterDetail.configDoc,
    configs: await listBalanceConfigs(),
    catalog: buildBalanceCatalog(),
    balanceDetail: {
      scopeType: afterDetail.scopeType,
      scopeId: afterDetail.scopeId,
      overrideConfig: afterDetail.overrideConfig,
      effectiveConfig: afterDetail.effectiveConfig,
      codeDefaultConfig: afterDetail.codeDefaultConfig,
      unitScopeChapterMap: afterDetail.unitScopeChapterMap,
    },
    verification: {
      configPersisted: true,
      logWritten: Boolean(logResult.logId),
      logId: logResult.logId || '',
      scopeType,
      scopeId,
    },
  };
}

async function removeBalanceSectionOverrideAction(account, payload, requestSource) {
  const { removeBalanceSectionOverride, listBalanceConfigs, buildBalanceCatalog, getBalanceConfigDetail } = getPveBalanceApi();
  const reason = ensureReason(payload?.reason);
  const scopeType = String(payload?.scopeType || '').trim();
  const scopeId = String(payload?.scopeId || '').trim();
  const section = String(payload?.section || '').trim();
  const beforeDetail = await getBalanceConfigDetail(scopeType, scopeId);
  const result = await removeBalanceSectionOverride({
    scopeType,
    scopeId,
    section,
    account,
  });
  const afterDetail = await getBalanceConfigDetail(scopeType, scopeId);

  const logResult = await writeAdminLog({
    account,
    targetUser: null,
    action: ADMIN_ACTIONS.REMOVE_BALANCE_SECTION_OVERRIDE,
    payload: { scopeType, scopeId, section },
    before: {
      configDoc: result.before,
      overrideConfig: beforeDetail.overrideConfig,
      effectiveConfig: beforeDetail.effectiveConfig,
      codeDefaultConfig: beforeDetail.codeDefaultConfig,
    },
    after: {
      configDoc: result.after,
      overrideConfig: afterDetail.overrideConfig,
      effectiveConfig: afterDetail.effectiveConfig,
      codeDefaultConfig: afterDetail.codeDefaultConfig,
      removed: result.removed === true,
    },
    reason,
    requestSource,
    success: true,
  });

  return {
    ok: true,
    removed: result.removed === true,
    configDoc: afterDetail.configDoc,
    configs: await listBalanceConfigs(),
    catalog: buildBalanceCatalog(),
    balanceDetail: {
      scopeType: afterDetail.scopeType,
      scopeId: afterDetail.scopeId,
      overrideConfig: afterDetail.overrideConfig,
      effectiveConfig: afterDetail.effectiveConfig,
      codeDefaultConfig: afterDetail.codeDefaultConfig,
      unitScopeChapterMap: afterDetail.unitScopeChapterMap,
    },
    verification: {
      configPersisted: true,
      logWritten: Boolean(logResult.logId),
      logId: logResult.logId || '',
      scopeType,
      scopeId,
    },
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
  const reason = ensureReason(payload?.reason || '鍚屾浠撳簱鏁板€兼枃妗?);
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

function buildCampResetVerification(profile, extra = {}) {
  return {
    minghenCount: Object.keys(profile.minghenCollection || {}).length,
    minghenLoadoutCount: Array.isArray(profile.minghenLoadout) ? profile.minghenLoadout.length : 0,
    minghenPresetCount: Array.isArray(profile.minghenPresets) ? profile.minghenPresets.length : 0,
    equipmentCount: Array.isArray(profile.equipmentInventory) ? profile.equipmentInventory.length : 0,
    equipmentLoadoutCount: Object.keys(profile.equipmentLoadout || {}).length,
    activeChallengeId: profile.activeChallengeId || '',
    ...extra,
  };
}

function isCampResetVerificationClear(verification) {
  return verification.minghenCount === 0
    && verification.minghenLoadoutCount === 0
    && verification.minghenPresetCount === 0
    && verification.equipmentCount === 0
    && verification.equipmentLoadoutCount === 0
    && !verification.activeChallengeId;
}

async function forceVerifyPveProfileReset(user, desiredProfile, options = {}) {
  const targetDocs = await collectTargetUserDocs(user);
  const targetDocIds = targetDocs.map((doc) => doc._id).filter(Boolean);
  const resetExtra = {
    updatedDate: serverDate(),
  };
  const removeFields = [];
  if (options.clearLegacyPveGrowth) {
    removeFields.push('unlockedTreeNodes', 'destinyShards');
  }
  if (options.clearPendingRun) {
    removeFields.push('pvePendingRunSeed');
  }
  const overwrittenUserDocIds = await overwriteUserDocsWithPveProfile(targetDocIds, desiredProfile, resetExtra, removeFields);
  let verifiedDocs = await getUserDocsByDocIds(overwrittenUserDocIds);
  let allDocsVerification = buildUserDocsResetVerification(verifiedDocs);
  let userAfter = verifiedDocs.find((doc) => doc._id === user._id)
    || verifiedDocs.find((doc) => doc.id === user.id)
    || await getUserById(user.id);
  let verifiedProfile = normalizeProfile((userAfter || { pveProfile: desiredProfile }).pveProfile);
  let verification = buildCampResetVerification(verifiedProfile);
  let forcedRewrite = false;

  if (!isCampResetVerificationClear(verification) || allDocsVerification.staleUserDocs.length > 0) {
    forcedRewrite = true;
    await overwriteUserDocsWithPveProfile(overwrittenUserDocIds, desiredProfile, resetExtra, removeFields);
    verifiedDocs = await getUserDocsByDocIds(overwrittenUserDocIds);
    allDocsVerification = buildUserDocsResetVerification(verifiedDocs);
    userAfter = verifiedDocs.find((doc) => doc._id === user._id)
      || verifiedDocs.find((doc) => doc.id === user.id)
      || await getUserById(user.id);
    verifiedProfile = normalizeProfile((userAfter || { pveProfile: desiredProfile }).pveProfile);
    verification = buildCampResetVerification(verifiedProfile);
  }

  return {
    userAfter,
    verifiedProfile,
    verification: {
      ...verification,
      forcedRewrite,
      overwrittenUserDocIds,
      matchedUserDocCount: allDocsVerification.matchedUserDocCount,
      userDocs: allDocsVerification.userDocs,
      staleUserDocs: allDocsVerification.staleUserDocs,
    },
  };
}

async function resetExpeditionAction(account, payload, requestSource) {
  const reason = ensureReason(payload?.reason);
  const user = await getTargetUser(payload || {});
  console.info('[GM][resetExpedition] start', {
    targetDocId: user._id || '',
    targetUserId: user.id || '',
    targetOpenId: user._openid || '',
    requestSource,
  });
  const save = await getPveSaveByUserId(user.id);
  const before = {
    save: toSaveSummary(save),
    hasPendingRun: Number.isInteger(user.pvePendingRunSeed) && user.pvePendingRunSeed > 0,
    profile: normalizeProfile(user.pveProfile),
  };

  if (save) {
    await deletePveSave(save._id);
  }
  await clearPendingPveRun(user.id);
  const previousChallengeId = before.profile.activeChallengeId;
  const removedChallengeIds = await removeActivePveChallengesForUser(user.id, previousChallengeId);
  const resetProfile = resetExpeditionProgress(before.profile);
  const {
    userAfter,
    verifiedProfile,
    verification,
  } = await forceVerifyPveProfileReset(user, resetProfile, { clearLegacyPveGrowth: true, clearPendingRun: true });
  const resetDiagnostic = {
    ...verification,
    removedChallengeIds,
    pendingRunCleared: !(Number.isInteger(userAfter?.pvePendingRunSeed) && userAfter.pvePendingRunSeed > 0),
    activeSaveCleared: Boolean(save),
  };
  console.info('[GM][resetExpedition] verified', {
    targetDocId: user._id || '',
    targetUserId: user.id || '',
    targetOpenId: user._openid || '',
    diagnostic: resetDiagnostic,
  });
  await writeAdminLog({
    account,
    targetUser: user,
    action: ADMIN_ACTIONS.RESET_EXPEDITION,
    payload: {},
    before,
    after: {
      save: null,
      hasPendingRun: Number.isInteger(userAfter?.pvePendingRunSeed) && userAfter.pvePendingRunSeed > 0,
      profile: verifiedProfile,
      removedChallengeIds,
      verification: resetDiagnostic,
    },
    reason,
    requestSource,
    success: true,
  });

  return {
    ok: true,
    player: toPlayerView(userAfter, null),
    verification: resetDiagnostic,
  };
}

async function resetCampInventoryAction(account, payload, requestSource) {
  const reason = ensureReason(payload?.reason);
  const user = await getTargetUser(payload || {});
  console.info('[GM][resetCampInventory] start', {
    targetDocId: user._id || '',
    targetUserId: user.id || '',
    targetOpenId: user._openid || '',
    requestSource,
  });
  const currentUser = await getUserByDocId(user._id);
  if (!currentUser) {
    const err = new Error('GM_TARGET_USER_NOT_FOUND');
    err.code = 'GM_TARGET_USER_NOT_FOUND';
    throw err;
  }
  const before = normalizeProfile(currentUser.pveProfile);
  const profile = resetCampInventory(before);
  const removedChallengeIds = await removeActivePveChallengesForUser(user.id, before.activeChallengeId);
  const saveAfter = await getPveSaveByUserId(user.id);
  if (saveAfter) await deletePveSave(saveAfter._id);
  await clearPendingPveRun(user.id);
  const {
    userAfter,
    verifiedProfile,
    verification,
  } = await forceVerifyPveProfileReset(user, profile, { clearPendingRun: true });
  const resetDiagnostic = {
    ...verification,
    removedChallengeIds,
    activeSaveCleared: Boolean(saveAfter),
  };
  console.info('[GM][resetCampInventory] verified', {
    targetDocId: user._id || '',
    targetUserId: user.id || '',
    targetOpenId: user._openid || '',
    diagnostic: resetDiagnostic,
  });
  await writeAdminLog({
    account,
    targetUser: user,
    action: ADMIN_ACTIONS.RESET_CAMP_INVENTORY,
    payload: {},
    before: { profile: before, activeSaveId: saveAfter?._id || null },
    after: { profile: verifiedProfile, activeSaveId: null, removedChallengeIds, verification: resetDiagnostic },
    reason,
    requestSource,
    success: true,
  });
  return {
    ok: true,
    player: toPlayerView(userAfter || { ...user, pveProfile: verifiedProfile }, null),
    verification: resetDiagnostic,
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
  case ADMIN_ACTIONS.GET_BALANCE_CONFIG_DETAIL:
    return getBalanceConfigDetailAction(payload);
  case ADMIN_ACTIONS.SAVE_BALANCE_CONFIG:
    return saveBalanceConfigAction(account, payload, requestSource);
  case ADMIN_ACTIONS.RESET_BALANCE_CONFIG:
    return resetBalanceConfigAction(account, payload, requestSource);
  case ADMIN_ACTIONS.REMOVE_BALANCE_FIELD_OVERRIDE:
    return removeBalanceFieldOverrideAction(account, payload, requestSource);
  case ADMIN_ACTIONS.REMOVE_BALANCE_SECTION_OVERRIDE:
    return removeBalanceSectionOverrideAction(account, payload, requestSource);
  case ADMIN_ACTIONS.SYNC_BALANCE_DOCS_PREVIEW:
    return syncBalanceDocsPreviewAction();
  case ADMIN_ACTIONS.SYNC_BALANCE_DOCS_LOG:
    return syncBalanceDocsLogAction(account, payload, requestSource);
  case ADMIN_ACTIONS.ADJUST_RESOURCES:
    return adjustResourcesAction(account, payload, requestSource);
  case ADMIN_ACTIONS.JUMP_EXPEDITION_FLOOR:
    return jumpExpeditionFloorAction(account, payload, requestSource);
  case ADMIN_ACTIONS.UPDATE_PLAYER_CLASS_STATE:
    return updatePlayerClassStateAction(account, payload, requestSource);
  case ADMIN_ACTIONS.RESET_EXPEDITION:
    return resetExpeditionAction(account, payload, requestSource);
  case ADMIN_ACTIONS.RESET_CAMP_INVENTORY:
    return resetCampInventoryAction(account, payload, requestSource);
  case ADMIN_ACTIONS.RESET_TUTORIAL:
    return resetTutorialAction(account, payload, requestSource);
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
