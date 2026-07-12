const { PROFESSION_IDS } = require('./PveProfile');

const CHALLENGE_MODES = ['PROGRESSION', 'HUNT', 'TRIAL', 'PRACTICE'];
const CHALLENGE_RESULT_STATUSES = ['CLEAR', 'DEAD', 'WITHDRAW'];
const EQUIPMENT_SLOTS = ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'];
const MAX_FLOOR = 35;
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
  if (!Number.isInteger(floor) || floor < 1 || floor > MAX_FLOOR) {
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
  if (request.mode === 'PROGRESSION' && floor !== profile.highestUnlockedFloor) {
    fail('PVE_INVALID_PROGRESSION_FLOOR', '推进模式只能挑战当前最高解锁层');
  }
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

  return {
    floor,
    mode: request.mode,
    professionId: request.professionId,
    equipmentLoadout: validateEquipmentLoadout(request.equipmentLoadout ?? {}),
    minghenLoadout: validateMinghenLoadout(request.minghenLoadout ?? []),
    trackedMinghenId,
  };
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
  return {
    challengeId: request.challengeId,
    status: request.status,
    clearTurns,
    completedOptionalObjectiveIds: [...new Set(completedOptionalObjectiveIds)],
  };
}

module.exports = {
  CHALLENGE_MODES,
  CHALLENGE_RESULT_STATUSES,
  EQUIPMENT_SLOTS,
  MAX_FLOOR,
  MAX_MINGHEN_SLOTS,
  validateMinghenLoadout,
  validateEquipmentLoadout,
  validateStartFloorChallengeRequest,
  validateSettleFloorChallengeRequest,
};
