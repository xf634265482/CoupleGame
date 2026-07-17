const { MAX_READY_FLOOR, PROFESSION_IDS } = require('./PveProfile');

const CHALLENGE_MODES = ['PROGRESSION', 'HUNT', 'TRIAL', 'PRACTICE'];
const CHALLENGE_RESULT_STATUSES = ['CLEAR', 'DEAD', 'WITHDRAW'];
const EQUIPMENT_SLOTS = ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'];
const MAX_MINGHEN_SLOTS = 8;

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateMinghenLoadout(value) {
  if (!Array.isArray(value) || value.length > MAX_MINGHEN_SLOTS) {
    fail('PVE_INVALID_MINGHEN_LOADOUT', `命痕装配必须为不超过 ${MAX_MINGHEN_SLOTS} 项的数组`);
  }
  const ids = new Set();
  return value.map((entry) => {
    if (!isPlainObject(entry) || typeof entry.id !== 'string' || !entry.id) {
      fail('PVE_INVALID_MINGHEN_LOADOUT', '命痕条目缺少合法 id');
    }
    if (ids.has(entry.id)) {
      fail('PVE_DUPLICATE_MINGHEN', `同名命痕不能重复装配: ${entry.id}`);
    }
    if (![1, 2, 3].includes(entry.level)) {
      fail('PVE_INVALID_MINGHEN_LEVEL', `命痕等级不合法: ${entry.id}`);
    }
    ids.add(entry.id);
    return { id: entry.id, level: entry.level };
  });
}

function validateEquipmentLoadout(value) {
  if (!isPlainObject(value)) {
    fail('PVE_INVALID_EQUIPMENT_LOADOUT', '装备配置必须为对象');
  }
  const result = {};
  for (const key of Object.keys(value)) {
    if (!EQUIPMENT_SLOTS.includes(key)) {
      fail('PVE_INVALID_EQUIPMENT_SLOT', `未知装备槽位: ${key}`);
    }
    if (typeof value[key] !== 'string' || !value[key]) {
      fail('PVE_INVALID_EQUIPMENT_INSTANCE', `装备实例 id 不合法: ${key}`);
    }
    result[key] = value[key];
  }
  return result;
}

function validateStartFloorChallengeRequest(profile, request) {
  if (!isPlainObject(profile) || !isPlainObject(request)) {
    fail('PVE_INVALID_CHALLENGE_REQUEST', '挑战请求不合法');
  }
  const floor = Number(request.floor);
  if (!Number.isInteger(floor) || floor < 1 || floor > MAX_READY_FLOOR) {
    fail('PVE_INVALID_FLOOR', 'floor 不合法');
  }
  if (!CHALLENGE_MODES.includes(request.mode)) {
    fail('PVE_INVALID_CHALLENGE_MODE', '挑战模式不合法');
  }
  if (!PROFESSION_IDS.includes(request.professionId)) {
    fail('PVE_INVALID_PROFESSION', '职业不合法');
  }
  if (profile.professions?.[request.professionId]?.unlocked !== true) {
    fail('PVE_PROFESSION_LOCKED', '职业尚未解锁');
  }
  if (floor > profile.highestUnlockedFloor) {
    fail('PVE_FLOOR_LOCKED', '楼层尚未解锁');
  }
  // 已通关楼层允许重复挑战；下一可挑战层同样受 highestUnlockedFloor 限制。
  if (request.mode !== 'PROGRESSION' && floor > profile.highestClearedFloor) {
    fail('PVE_REPLAY_FLOOR_NOT_CLEARED', '非推进模式只能挑战已通关层');
  }

  const trackedMinghenId = request.trackedMinghenId == null ? null : request.trackedMinghenId;
  if (trackedMinghenId !== null && (typeof trackedMinghenId !== 'string' || !trackedMinghenId)) {
    fail('PVE_INVALID_TRACKING_TARGET', '追踪命痕 id 不合法');
  }
  if (request.mode === 'HUNT' && trackedMinghenId === null) {
    fail('PVE_HUNT_TARGET_REQUIRED', '定向狩猎必须指定命痕');
  }
  if (request.mode === 'HUNT' && (profile.tracking?.state !== 'HUNT'
    || profile.tracking.floor !== floor || profile.tracking.minghenId !== trackedMinghenId)) {
    fail('PVE_TRACKING_MISMATCH', '定向狩猎与当前追踪状态不一致');
  }
  if (request.mode === 'TRIAL' && (profile.tracking?.state !== 'TRIAL_READY'
    || profile.tracking.floor !== floor || profile.tracking.minghenId !== trackedMinghenId)) {
    fail('PVE_TRIAL_NOT_READY', '命痕升格试炼尚未就绪');
  }

  return {
    floor,
    mode: request.mode,
    professionId: request.professionId,
    equipmentLoadout: validateEquipmentLoadout(request.equipmentLoadout ?? {}),
    minghenLoadout: validateMinghenLoadout(request.minghenLoadout ?? []),
    trackedMinghenId,
    abandonActive: request.abandonActive === true,
  };
}

const QUALITIES = ['COMMON', 'FINE', 'RARE', 'EPIC', 'LEGENDARY'];

function validateLootedEquipment(value) {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.length > 40) {
    fail('PVE_INVALID_LOOTED_EQUIPMENT', '击杀掉落装备列表不合法');
  }
  const ids = new Set();
  return value.map((item) => {
    if (!isPlainObject(item)
      || typeof item.instanceId !== 'string' || !item.instanceId || item.instanceId.length > 80
      || typeof item.definitionId !== 'string' || !item.definitionId || item.definitionId.length > 32
      || !QUALITIES.includes(item.quality)
      || !Number.isInteger(item.enhanceLevel) || item.enhanceLevel < 0 || item.enhanceLevel > 5
      || (item.locked != null && item.locked !== true && item.locked !== false)) {
      fail('PVE_INVALID_LOOTED_EQUIPMENT', '击杀掉落装备条目不合法');
    }
    if (ids.has(item.instanceId)) {
      fail('PVE_DUPLICATE_LOOTED_EQUIPMENT', `掉落装备实例重复: ${item.instanceId}`);
    }
    ids.add(item.instanceId);
    return {
      instanceId: item.instanceId,
      definitionId: item.definitionId,
      quality: item.quality,
      enhanceLevel: item.enhanceLevel,
      locked: item.locked === true,
      ...(Number.isFinite(item.baseStat) && item.baseStat > 0 ? { baseStat: Math.floor(item.baseStat) } : {}),
    };
  });
}

function validateSettleFloorChallengeRequest(request) {
  if (!isPlainObject(request) || typeof request.challengeId !== 'string' || !request.challengeId) {
    fail('PVE_INVALID_CHALLENGE_ID', 'challengeId 不合法');
  }
  if (!CHALLENGE_RESULT_STATUSES.includes(request.status)) {
    fail('PVE_INVALID_CHALLENGE_STATUS', '挑战结算状态不合法');
  }
  const clearTurns = request.clearTurns == null ? undefined : Number(request.clearTurns);
  if (clearTurns !== undefined && (!Number.isInteger(clearTurns) || clearTurns < 1)) {
    fail('PVE_INVALID_CLEAR_TURNS', 'clearTurns 不合法');
  }
  const completedOptionalObjectiveIds = request.completedOptionalObjectiveIds ?? [];
  if (!Array.isArray(completedOptionalObjectiveIds)
    || completedOptionalObjectiveIds.some((id) => typeof id !== 'string' || !id)) {
    fail('PVE_INVALID_OPTIONAL_OBJECTIVES', '可选目标列表不合法');
  }
  const professionHighlightCount = request.professionHighlightCount ?? 0;
  if (!Number.isInteger(professionHighlightCount) || professionHighlightCount < 0 || professionHighlightCount > 3) {
    fail('PVE_INVALID_HIGHLIGHT_COUNT', '职业高光次数不合法');
  }
  for (const key of ['selectedMinghenId']) {
    if (request[key] != null && (typeof request[key] !== 'string' || !request[key])) {
      fail('PVE_INVALID_REWARD_SELECTION', `${key} 不合法`);
    }
  }
  const lootedEquipment = validateLootedEquipment(request.lootedEquipment);
  const equipmentLoadout = request.equipmentLoadout == null
    ? undefined
    : validateEquipmentLoadout(request.equipmentLoadout);
  let lootedStardust;
  if (request.lootedStardust != null) {
    if (!Number.isInteger(request.lootedStardust) || request.lootedStardust < 0 || request.lootedStardust > 50000) {
      fail('PVE_INVALID_LOOTED_STARDUST', '本层星尘入账不合法');
    }
    lootedStardust = request.lootedStardust;
  }
  let trialEvidence;
  if (request.trialEvidence != null) {
    if (!isPlainObject(request.trialEvidence)) fail('PVE_INVALID_TRIAL_EVIDENCE', '试炼摘要必须为对象');
    trialEvidence = {};
    for (const [key, value] of Object.entries(request.trialEvidence)) {
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(key) || !Number.isInteger(value) || value < 0 || value > 9999) fail('PVE_INVALID_TRIAL_EVIDENCE', '试炼摘要字段不合法');
      trialEvidence[key] = value;
    }
  }
  return {
    challengeId: request.challengeId,
    status: request.status,
    clearTurns,
    completedOptionalObjectiveIds: [...new Set(completedOptionalObjectiveIds)],
    ...(request.professionHighlightCount == null ? {} : { professionHighlightCount }),
    ...(request.selectedMinghenId == null ? {} : { selectedMinghenId: request.selectedMinghenId }),
    ...(lootedEquipment === undefined ? {} : { lootedEquipment }),
    ...(equipmentLoadout === undefined ? {} : { equipmentLoadout }),
    ...(lootedStardust === undefined ? {} : { lootedStardust }),
    ...(request.huntBonusAchieved == null ? {} : { huntBonusAchieved: request.huntBonusAchieved === true }),
    ...(request.trialCompleted == null ? {} : { trialCompleted: request.trialCompleted === true }),
    ...(trialEvidence === undefined ? {} : { trialEvidence }),
  };
}

function validateSaveFloorChallengeRuntimeRequest(request) {
  if (!isPlainObject(request) || typeof request.challengeId !== 'string' || !request.challengeId) {
    fail('PVE_INVALID_CHALLENGE_ID', 'challengeId 不合法');
  }
  if (typeof request.serializedRuntime !== 'string'
    || request.serializedRuntime.length < 2
    || request.serializedRuntime.length > 900000) {
    fail('PVE_INVALID_RUNTIME_SAVE', '楼层运行态存档大小不合法');
  }
  let parsed;
  try {
    parsed = JSON.parse(request.serializedRuntime);
  } catch (_err) {
    fail('PVE_INVALID_RUNTIME_SAVE', '楼层运行态存档不是合法 JSON');
  }
  const runtime = parsed?.runtime;
  const version = Number(parsed?.version);
  if (![1, 2].includes(version) || runtime?.version !== version || runtime?.status !== 'ACTIVE') {
    fail('PVE_INVALID_RUNTIME_SAVE', '楼层运行态版本或状态不合法');
  }
  if (!Number.isInteger(runtime.turn) || runtime.turn < 1) {
    fail('PVE_INVALID_RUNTIME_TURN', '楼层运行态回合不合法');
  }
  return {
    challengeId: request.challengeId,
    serializedRuntime: request.serializedRuntime,
    runtime,
    version,
    turn: runtime.turn,
  };
}

module.exports = {
  CHALLENGE_MODES,
  CHALLENGE_RESULT_STATUSES,
  EQUIPMENT_SLOTS,
  MAX_READY_FLOOR,
  MAX_MINGHEN_SLOTS,
  validateMinghenLoadout,
  validateEquipmentLoadout,
  validateStartFloorChallengeRequest,
  validateSettleFloorChallengeRequest,
  validateSaveFloorChallengeRuntimeRequest,
};
