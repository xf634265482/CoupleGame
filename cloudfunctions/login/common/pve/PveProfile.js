const { resolveStamina } = require('./PveStamina');

const PROFILE_VERSION = 1;
const PROFESSION_IDS = ['WARRIOR', 'ARCHER', 'RANGER'];

function defaultMastery(unlocked, xp = 0, level = 1) {
  return {
    unlocked,
    xp,
    level,
    unlockedTechniqueIds: [],
  };
}

function createDefaultProfile(now = Date.now(), legacy = {}) {
  const stamina = resolveStamina(
    legacy.pveStamina,
    legacy.pveStaminaUpdatedAt,
    now,
  );
  return {
    version: PROFILE_VERSION,
    highestUnlockedFloor: 1,
    highestClearedFloor: 0,
    floorRecords: {},
    minghenCollection: {},
    minghenLoadout: [],
    minghenPresets: [],
    equipmentInventory: [],
    equipmentLoadout: {},
    gold: 0,
    minghenDust: 0,
    professions: {
      WARRIOR: defaultMastery(true),
      ARCHER: defaultMastery(false),
      RANGER: defaultMastery(false),
    },
    selectedProfessionId: 'WARRIOR',
    tracking: null,
    activeChallengeId: null,
    stamina: stamina.stamina,
    staminaUpdatedAt: stamina.updatedAt,
    staminaNextRecoveryAt: stamina.nextRecoveryAt,
    tutorialFreeChallengeConsumed: legacy.pveFirstRunStarted === true,
    updatedAt: now,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonNegativeInt(value, fallback = 0) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function normalizeMastery(value, fallback) {
  if (!isPlainObject(value)) return fallback;
  return {
    unlocked: value.unlocked === true,
    xp: nonNegativeInt(value.xp),
    level: Math.max(1, Math.min(10, nonNegativeInt(value.level, 1))),
    unlockedTechniqueIds: Array.isArray(value.unlockedTechniqueIds)
      ? [...new Set(value.unlockedTechniqueIds.filter((id) => typeof id === 'string'))]
      : [],
  };
}

/**
 * 测试阶段不迁移旧 PVE 资产：版本不匹配时直接创建全新档案。
 * 同版本只做防御性归一化，防止缺字段阻塞大厅。
 * 货币：gold 对外为「星尘」；读档时把 minghenDust 合并进 gold。
 */
function normalizeProfile(value, now = Date.now(), legacy = {}) {
  if (!isPlainObject(value) || value.version !== PROFILE_VERSION) {
    return createDefaultProfile(now, legacy);
  }

  const defaults = createDefaultProfile(now, legacy);
  const professions = {};
  for (const id of PROFESSION_IDS) {
    professions[id] = normalizeMastery(value.professions?.[id], defaults.professions[id]);
  }
  professions.WARRIOR.unlocked = true;

  const selectedProfessionId = PROFESSION_IDS.includes(value.selectedProfessionId)
    && professions[value.selectedProfessionId].unlocked
    ? value.selectedProfessionId
    : 'WARRIOR';

  const highestClearedFloor = Math.min(35, nonNegativeInt(value.highestClearedFloor));
  const highestUnlockedFloor = Math.max(
    1,
    Math.min(35, nonNegativeInt(value.highestUnlockedFloor, highestClearedFloor + 1)),
  );

  const mergedStardust = nonNegativeInt(value.gold) + nonNegativeInt(value.minghenDust);
  const stamina = resolveStamina(
    Number.isFinite(value.stamina) ? value.stamina : defaults.stamina,
    Number.isFinite(value.staminaUpdatedAt)
      ? value.staminaUpdatedAt
      : defaults.staminaUpdatedAt,
    now,
  );

  return {
    ...defaults,
    highestUnlockedFloor: Math.max(highestUnlockedFloor, Math.min(35, highestClearedFloor + 1)),
    highestClearedFloor,
    floorRecords: isPlainObject(value.floorRecords) ? value.floorRecords : {},
    minghenCollection: isPlainObject(value.minghenCollection) ? value.minghenCollection : {},
    minghenLoadout: Array.isArray(value.minghenLoadout) ? value.minghenLoadout : [],
    minghenPresets: Array.isArray(value.minghenPresets) ? value.minghenPresets : [],
    equipmentInventory: Array.isArray(value.equipmentInventory) ? value.equipmentInventory : [],
    equipmentLoadout: isPlainObject(value.equipmentLoadout) ? value.equipmentLoadout : {},
    gold: mergedStardust,
    minghenDust: 0,
    professions,
    selectedProfessionId,
    tracking: isPlainObject(value.tracking) ? value.tracking : null,
    activeChallengeId: typeof value.activeChallengeId === 'string' && value.activeChallengeId
      ? value.activeChallengeId
      : null,
    stamina: stamina.stamina,
    staminaUpdatedAt: stamina.updatedAt,
    staminaNextRecoveryAt: stamina.nextRecoveryAt,
    tutorialFreeChallengeConsumed:
      value.tutorialFreeChallengeConsumed === true
      || defaults.tutorialFreeChallengeConsumed,
    updatedAt: nonNegativeInt(value.updatedAt, now),
  };
}

function resetExpeditionProgress(value, now = Date.now()) {
  // GM 重置远征等同创建全新档案：不保留任何成长、构筑或营地资产。
  void value;
  return createDefaultProfile(now);
}

function resetCampInventory(value, now = Date.now()) {
  const profile = normalizeProfile(value, now);
  return {
    ...profile,
    minghenCollection: {},
    minghenLoadout: [],
    minghenPresets: [],
    equipmentInventory: [],
    equipmentLoadout: {},
    minghenDust: 0,
    activeChallengeId: null,
    updatedAt: now,
  };
}

module.exports = {
  PROFILE_VERSION,
  PROFESSION_IDS,
  createDefaultProfile,
  normalizeProfile,
  resetCampInventory,
  resetExpeditionProgress,
};
