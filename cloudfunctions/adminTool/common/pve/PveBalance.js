const { getDb, serverDate } = require('../db');
const { COLLECTIONS } = require('../constants');

const PVE_BALANCE_SCOPE_TYPES = {
  GLOBAL: 'global',
  CHAPTER: 'chapter',
  UNIT: 'unit',
};

const PVE_BALANCE_UNIT_TYPES = {
  PLAYER: 'player',
  MONSTER: 'monster',
  BOSS: 'boss',
  EQUIPMENT: 'equipment',
};

const PVE_BALANCE_FIELD_RULES = {
  player: {
    initialHp: { type: 'integer', min: 1, max: 999999 },
    initialGold: { type: 'integer', min: 0, max: 999999 },
    initialAnima: { type: 'integer', min: 0, max: 999999 },
    baseAttack: { type: 'integer', min: 0, max: 999999 },
    baseAttackRange: { type: 'integer', min: 0, max: 20 },
    apBase: { type: 'integer', min: 0, max: 99 },
    moveCost: { type: 'integer', min: 0, max: 99 },
    attackCost: { type: 'integer', min: 0, max: 99 },
    openChestCost: { type: 'integer', min: 0, max: 99 },
    openExitCost: { type: 'integer', min: 0, max: 99 },
    useInteractCost: { type: 'integer', min: 0, max: 99 },
    useHotSpringCost: { type: 'integer', min: 0, max: 99 },
    useAltarCost: { type: 'integer', min: 0, max: 99 },
  },
  monster: {
    hpMultiplier: { type: 'number', min: 0, max: 100 },
    attackMultiplier: { type: 'number', min: 0, max: 100 },
    rangeDelta: { type: 'integer', min: -20, max: 20 },
    aggroRadiusDelta: { type: 'integer', min: -20, max: 20 },
    armorDelta: { type: 'integer', min: -9999, max: 9999 },
  },
  boss: {
    hpMultiplier: { type: 'number', min: 0, max: 100 },
    attackMultiplier: { type: 'number', min: 0, max: 100 },
    rangeDelta: { type: 'integer', min: -20, max: 20 },
    aggroRadiusDelta: { type: 'integer', min: -20, max: 20 },
    armorDelta: { type: 'integer', min: -9999, max: 9999 },
  },
  equipment: {
    weaponBaseMultiplier: { type: 'number', min: 0, max: 100 },
    armorBaseMultiplier: { type: 'number', min: 0, max: 100 },
    helmetBaseMultiplier: { type: 'number', min: 0, max: 100 },
    shoesBaseMultiplier: { type: 'number', min: 0, max: 100 },
    trinketBaseMultiplier: { type: 'number', min: 0, max: 100 },
  },
};

const DEFAULT_BALANCE_CONFIG = {
  player: {
    initialHp: 280,
    initialGold: 0,
    initialAnima: 0,
    baseAttack: 10,
    baseAttackRange: 1,
    apBase: 8,
    moveCost: 1,
    attackCost: 3,
    openChestCost: 1,
    openExitCost: 1,
    useInteractCost: 1,
    useHotSpringCost: 1,
    useAltarCost: 1,
  },
  monster: {
    hpMultiplier: 1,
    attackMultiplier: 1,
    rangeDelta: 0,
    aggroRadiusDelta: 0,
    armorDelta: 0,
  },
  boss: {
    hpMultiplier: 1,
    attackMultiplier: 1,
    rangeDelta: 0,
    aggroRadiusDelta: 0,
    armorDelta: 0,
  },
  equipment: {
    weaponBaseMultiplier: 1,
    armorBaseMultiplier: 1,
    helmetBaseMultiplier: 1,
    shoesBaseMultiplier: 1,
    trinketBaseMultiplier: 1,
  },
};

const CHAPTER_SCOPE_OPTIONS = [
  { id: 'chapter_1', label: '第1章' },
  { id: 'chapter_2', label: '第2章' },
  { id: 'chapter_3', label: '第3章' },
  { id: 'chapter_4', label: '第4章' },
  { id: 'chapter_5', label: '第5章' },
];

const UNIT_SCOPE_OPTIONS = [
  { id: 'player:ADVENTURER', unitType: 'player', label: '玩家初始模板 / 冒险者' },
  { id: 'boss:GOBLIN_CHIEF', unitType: 'boss', label: 'Boss / 哥布林酋长' },
  { id: 'boss:QUICKSAND_SCORPION', unitType: 'boss', label: 'Boss / 流沙巨蝎' },
  { id: 'boss:FROST_GIANT', unitType: 'boss', label: 'Boss / 冰霜巨人' },
  { id: 'boss:LAVA_LORD', unitType: 'boss', label: 'Boss / 熔岩领主' },
  { id: 'boss:FATE_GUARDIAN', unitType: 'boss', label: 'Boss / 命运守卫' },
  { id: 'monster:GOBLIN_WARRIOR', unitType: 'monster', label: '怪物 / 哥布林战士' },
  { id: 'monster:GOBLIN_ARCHER', unitType: 'monster', label: '怪物 / 哥布林弓手' },
  { id: 'monster:FROST_GOBLIN', unitType: 'monster', label: '怪物 / 冰霜哥布林' },
  { id: 'monster:FIRE_GOBLIN', unitType: 'monster', label: '怪物 / 赤焰哥布林' },
  { id: 'monster:SPIRIT_RAT', unitType: 'monster', label: '怪物 / 灵鼠' },
  { id: 'monster:DESERT_RAIDER', unitType: 'monster', label: '怪物 / 沙漠劫匪' },
  { id: 'monster:SANDWORM_LARVA', unitType: 'monster', label: '怪物 / 沙虫幼体' },
  { id: 'monster:POISON_SCORPION', unitType: 'monster', label: '怪物 / 毒蝎' },
  { id: 'monster:SPIRIT_BEETLE', unitType: 'monster', label: '怪物 / 灵甲虫' },
  { id: 'monster:SNOW_WOLF', unitType: 'monster', label: '怪物 / 雪狼' },
  { id: 'monster:ICE_SLIME', unitType: 'monster', label: '怪物 / 冰史莱姆' },
  { id: 'monster:FROST_SPRITE', unitType: 'monster', label: '怪物 / 冰霜精灵' },
  { id: 'monster:SPIRIT_ELF', unitType: 'monster', label: '怪物 / 灵精灵' },
  { id: 'monster:LAVA_GRUNT', unitType: 'monster', label: '怪物 / 熔岩士兵' },
  { id: 'monster:LAVA_CRAB', unitType: 'monster', label: '怪物 / 熔岩蟹' },
  { id: 'monster:FIRE_ELEMENTAL', unitType: 'monster', label: '怪物 / 火元素' },
  { id: 'monster:SPIRIT_EMBER', unitType: 'monster', label: '怪物 / 灵炎魂' },
  { id: 'monster:SHADOW_ASSASSIN', unitType: 'monster', label: '怪物 / 暗影刺客' },
  { id: 'monster:FATE_WATCHER', unitType: 'monster', label: '怪物 / 命运守望者' },
  { id: 'monster:VOID_WORM', unitType: 'monster', label: '怪物 / 虚空蠕虫' },
  { id: 'monster:SPIRIT_MIRAGE', unitType: 'monster', label: '怪物 / 灵幻像' },
];

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

function deepClone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function mergeBalanceConfig(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const next = deepClone(base || {});
  for (const [sectionKey, rules] of Object.entries(PVE_BALANCE_FIELD_RULES)) {
    const patchSection = patch[sectionKey];
    if (!patchSection || typeof patchSection !== 'object') continue;
    if (!next[sectionKey] || typeof next[sectionKey] !== 'object') {
      next[sectionKey] = {};
    }
    for (const fieldKey of Object.keys(rules)) {
      if (patchSection[fieldKey] === undefined) continue;
      next[sectionKey][fieldKey] = patchSection[fieldKey];
    }
  }
  return next;
}

function removeEmptySections(config) {
  if (!config || typeof config !== 'object') return {};
  const next = {};
  for (const [sectionKey, sectionValue] of Object.entries(config)) {
    if (!sectionValue || typeof sectionValue !== 'object') continue;
    const cleanedSection = {};
    for (const [fieldKey, fieldValue] of Object.entries(sectionValue)) {
      if (fieldValue === undefined) continue;
      cleanedSection[fieldKey] = fieldValue;
    }
    if (Object.keys(cleanedSection).length > 0) {
      next[sectionKey] = cleanedSection;
    }
  }
  return next;
}

function ensureNumberByRule(sectionKey, fieldKey, value) {
  const rule = PVE_BALANCE_FIELD_RULES[sectionKey]?.[fieldKey];
  if (!rule) {
    const err = new Error(`PVE_BALANCE_FIELD_NOT_ALLOWED:${sectionKey}.${fieldKey}`);
    err.code = 'PVE_BALANCE_FIELD_NOT_ALLOWED';
    throw err;
  }
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    const err = new Error(`PVE_BALANCE_FIELD_INVALID:${sectionKey}.${fieldKey}`);
    err.code = 'PVE_BALANCE_FIELD_INVALID';
    throw err;
  }
  if (rule.type === 'integer' && !Number.isInteger(value)) {
    const err = new Error(`PVE_BALANCE_FIELD_INTEGER_REQUIRED:${sectionKey}.${fieldKey}`);
    err.code = 'PVE_BALANCE_FIELD_INTEGER_REQUIRED';
    throw err;
  }
  if (value < rule.min || value > rule.max) {
    const err = new Error(`PVE_BALANCE_FIELD_OUT_OF_RANGE:${sectionKey}.${fieldKey}`);
    err.code = 'PVE_BALANCE_FIELD_OUT_OF_RANGE';
    throw err;
  }
  return value;
}

function normalizeBalanceConfig(input) {
  const source = input && typeof input === 'object' ? input : {};
  const normalized = {};

  for (const [sectionKey, rules] of Object.entries(PVE_BALANCE_FIELD_RULES)) {
    const sectionInput = source[sectionKey];
    if (!sectionInput || typeof sectionInput !== 'object') continue;
    const sectionOutput = {};
    for (const fieldKey of Object.keys(rules)) {
      if (sectionInput[fieldKey] === undefined || sectionInput[fieldKey] === null || sectionInput[fieldKey] === '') {
        continue;
      }
      sectionOutput[fieldKey] = ensureNumberByRule(sectionKey, fieldKey, Number(sectionInput[fieldKey]));
    }
    if (Object.keys(sectionOutput).length > 0) {
      normalized[sectionKey] = sectionOutput;
    }
  }

  return normalized;
}

function normalizeScopeType(scopeType) {
  const value = String(scopeType || '').trim();
  if (
    value !== PVE_BALANCE_SCOPE_TYPES.GLOBAL
    && value !== PVE_BALANCE_SCOPE_TYPES.CHAPTER
    && value !== PVE_BALANCE_SCOPE_TYPES.UNIT
  ) {
    const err = new Error('PVE_BALANCE_SCOPE_TYPE_INVALID');
    err.code = 'PVE_BALANCE_SCOPE_TYPE_INVALID';
    throw err;
  }
  return value;
}

function normalizeScopeId(scopeType, scopeId) {
  const value = String(scopeId || '').trim();
  if (scopeType === PVE_BALANCE_SCOPE_TYPES.GLOBAL) {
    return 'default';
  }
  if (!value) {
    const err = new Error('PVE_BALANCE_SCOPE_ID_REQUIRED');
    err.code = 'PVE_BALANCE_SCOPE_ID_REQUIRED';
    throw err;
  }
  if (scopeType === PVE_BALANCE_SCOPE_TYPES.CHAPTER) {
    const found = CHAPTER_SCOPE_OPTIONS.find((item) => item.id === value);
    if (!found) {
      const err = new Error('PVE_BALANCE_SCOPE_ID_INVALID');
      err.code = 'PVE_BALANCE_SCOPE_ID_INVALID';
      throw err;
    }
    return value;
  }
  if (scopeType === PVE_BALANCE_SCOPE_TYPES.UNIT) {
    const found = UNIT_SCOPE_OPTIONS.find((item) => item.id === value);
    if (!found) {
      const err = new Error('PVE_BALANCE_SCOPE_ID_INVALID');
      err.code = 'PVE_BALANCE_SCOPE_ID_INVALID';
      throw err;
    }
    return value;
  }
  return value;
}

function buildBalanceConfigId(scopeType, scopeId) {
  return `${scopeType}:${scopeId}`;
}

function buildBalanceCatalog() {
  return {
    scopeTypes: [
      { id: PVE_BALANCE_SCOPE_TYPES.GLOBAL, label: '全局默认' },
      { id: PVE_BALANCE_SCOPE_TYPES.CHAPTER, label: '章节覆盖' },
      { id: PVE_BALANCE_SCOPE_TYPES.UNIT, label: '单体覆盖' },
    ],
    chapterOptions: CHAPTER_SCOPE_OPTIONS,
    unitOptions: UNIT_SCOPE_OPTIONS,
    fieldRules: deepClone(PVE_BALANCE_FIELD_RULES),
  };
}

function buildBalanceConfigsMap(configs) {
  const map = new Map();
  for (const config of configs || []) {
    map.set(config.id, config);
  }
  return map;
}

function resolveEffectiveBalanceConfigFromMap(configMap, scopeType, scopeId) {
  const normalizedScopeType = normalizeScopeType(scopeType);
  const normalizedScopeId = normalizeScopeId(normalizedScopeType, scopeId);
  let resolved = getDefaultBalanceConfig();
  resolved = mergeBalanceConfig(resolved, configMap.get('global:default')?.config || null);

  if (normalizedScopeType === PVE_BALANCE_SCOPE_TYPES.CHAPTER) {
    resolved = mergeBalanceConfig(resolved, configMap.get(buildBalanceConfigId(normalizedScopeType, normalizedScopeId))?.config || null);
    return resolved;
  }

  if (normalizedScopeType === PVE_BALANCE_SCOPE_TYPES.UNIT) {
    const chapterScopeId = UNIT_SCOPE_CHAPTER_MAP[normalizedScopeId];
    if (chapterScopeId) {
      resolved = mergeBalanceConfig(resolved, configMap.get(buildBalanceConfigId(PVE_BALANCE_SCOPE_TYPES.CHAPTER, chapterScopeId))?.config || null);
    }
    resolved = mergeBalanceConfig(resolved, configMap.get(buildBalanceConfigId(normalizedScopeType, normalizedScopeId))?.config || null);
  }

  return resolved;
}

function getDefaultBalanceConfig() {
  return deepClone(DEFAULT_BALANCE_CONFIG);
}

function toBalanceConfigView(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    scopeType: doc.scopeType,
    scopeId: doc.scopeId,
    enabled: doc.enabled !== false,
    config: deepClone(doc.config || {}),
    updatedBy: doc.updatedBy || '',
    updatedByName: doc.updatedByName || '',
    updatedAt: doc.updatedAt || null,
    createdAt: doc.createdAt || null,
  };
}

async function listBalanceConfigs() {
  const { data } = await getDb()
    .collection(COLLECTIONS.PVE_BALANCE_CONFIGS)
    .get();
  return (data || [])
    .sort((left, right) => {
      const leftKey = `${left.scopeType || ''}:${left.scopeId || ''}`;
      const rightKey = `${right.scopeType || ''}:${right.scopeId || ''}`;
      return leftKey.localeCompare(rightKey);
    })
    .map(toBalanceConfigView);
}

async function getBalanceConfig(scopeType, scopeId) {
  const normalizedScopeType = normalizeScopeType(scopeType);
  const normalizedScopeId = normalizeScopeId(normalizedScopeType, scopeId);
  const id = buildBalanceConfigId(normalizedScopeType, normalizedScopeId);
  const { data } = await getDb()
    .collection(COLLECTIONS.PVE_BALANCE_CONFIGS)
    .where({ id })
    .limit(1)
    .get();
  return data[0] || null;
}

async function getBalanceConfigDetail(scopeType, scopeId) {
  const normalizedScopeType = normalizeScopeType(scopeType);
  const normalizedScopeId = normalizeScopeId(normalizedScopeType, scopeId);
  const configs = await listBalanceConfigs();
  const configMap = buildBalanceConfigsMap(configs);
  const configDoc = configMap.get(buildBalanceConfigId(normalizedScopeType, normalizedScopeId)) || null;
  return {
    scopeType: normalizedScopeType,
    scopeId: normalizedScopeId,
    configDoc,
    overrideConfig: deepClone(configDoc?.config || {}),
    effectiveConfig: resolveEffectiveBalanceConfigFromMap(configMap, normalizedScopeType, normalizedScopeId),
    codeDefaultConfig: getDefaultBalanceConfig(),
    configs,
    catalog: buildBalanceCatalog(),
    unitScopeChapterMap: deepClone(UNIT_SCOPE_CHAPTER_MAP),
  };
}

async function saveBalanceConfig({ scopeType, scopeId, config, account }) {
  const normalizedScopeType = normalizeScopeType(scopeType);
  const normalizedScopeId = normalizeScopeId(normalizedScopeType, scopeId);
  const normalizedConfig = normalizeBalanceConfig(config);
  const id = buildBalanceConfigId(normalizedScopeType, normalizedScopeId);
  const collection = getDb().collection(COLLECTIONS.PVE_BALANCE_CONFIGS);
  const existing = await getBalanceConfig(normalizedScopeType, normalizedScopeId);
  const data = {
    id,
    scopeType: normalizedScopeType,
    scopeId: normalizedScopeId,
    enabled: true,
    config: normalizedConfig,
    updatedBy: account.id,
    updatedByName: account.displayName || account.username,
    updatedAt: serverDate(),
  };

  if (existing && existing._id) {
    await collection.doc(existing._id).update({ data });
    const updated = await getBalanceConfig(normalizedScopeType, normalizedScopeId);
    return {
      before: toBalanceConfigView(existing),
      after: toBalanceConfigView(updated),
    };
  }

  await collection.add({
    data: {
      ...data,
      createdAt: serverDate(),
    },
  });
  const created = await getBalanceConfig(normalizedScopeType, normalizedScopeId);
  return {
    before: null,
    after: toBalanceConfigView(created),
  };
}

async function resetBalanceConfig(scopeType, scopeId) {
  const existing = await getBalanceConfig(scopeType, scopeId);
  if (!existing || !existing._id) {
    return {
      before: null,
      after: null,
      removed: false,
    };
  }
  await getDb().collection(COLLECTIONS.PVE_BALANCE_CONFIGS).doc(existing._id).remove();
  return {
    before: toBalanceConfigView(existing),
    after: null,
    removed: true,
  };
}

async function removeBalanceFieldOverride({ scopeType, scopeId, section, field, account }) {
  const normalizedScopeType = normalizeScopeType(scopeType);
  const normalizedScopeId = normalizeScopeId(normalizedScopeType, scopeId);
  const sectionKey = String(section || '').trim();
  const fieldKey = String(field || '').trim();
  if (!PVE_BALANCE_FIELD_RULES[sectionKey]?.[fieldKey]) {
    const err = new Error(`PVE_BALANCE_FIELD_NOT_ALLOWED:${sectionKey}.${fieldKey}`);
    err.code = 'PVE_BALANCE_FIELD_NOT_ALLOWED';
    throw err;
  }

  const existing = await getBalanceConfig(normalizedScopeType, normalizedScopeId);
  if (!existing || !existing._id) {
    return {
      before: null,
      after: null,
      removed: false,
    };
  }

  const nextConfig = deepClone(existing.config || {});
  if (!nextConfig[sectionKey] || nextConfig[sectionKey][fieldKey] === undefined) {
    return {
      before: toBalanceConfigView(existing),
      after: toBalanceConfigView(existing),
      removed: false,
    };
  }

  delete nextConfig[sectionKey][fieldKey];
  const cleanedConfig = removeEmptySections(nextConfig);
  if (Object.keys(cleanedConfig).length === 0) {
    return resetBalanceConfig(normalizedScopeType, normalizedScopeId);
  }

  await getDb().collection(COLLECTIONS.PVE_BALANCE_CONFIGS).doc(existing._id).update({
    data: {
      config: cleanedConfig,
      updatedBy: account.id,
      updatedByName: account.displayName || account.username,
      updatedAt: serverDate(),
    },
  });
  const updated = await getBalanceConfig(normalizedScopeType, normalizedScopeId);
  return {
    before: toBalanceConfigView(existing),
    after: toBalanceConfigView(updated),
    removed: true,
  };
}

async function removeBalanceSectionOverride({ scopeType, scopeId, section, account }) {
  const normalizedScopeType = normalizeScopeType(scopeType);
  const normalizedScopeId = normalizeScopeId(normalizedScopeType, scopeId);
  const sectionKey = String(section || '').trim();
  if (!PVE_BALANCE_FIELD_RULES[sectionKey]) {
    const err = new Error(`PVE_BALANCE_SECTION_NOT_ALLOWED:${sectionKey}`);
    err.code = 'PVE_BALANCE_SECTION_NOT_ALLOWED';
    throw err;
  }

  const existing = await getBalanceConfig(normalizedScopeType, normalizedScopeId);
  if (!existing || !existing._id) {
    return {
      before: null,
      after: null,
      removed: false,
    };
  }

  const nextConfig = deepClone(existing.config || {});
  if (nextConfig[sectionKey] === undefined) {
    return {
      before: toBalanceConfigView(existing),
      after: toBalanceConfigView(existing),
      removed: false,
    };
  }

  delete nextConfig[sectionKey];
  const cleanedConfig = removeEmptySections(nextConfig);
  if (Object.keys(cleanedConfig).length === 0) {
    return resetBalanceConfig(normalizedScopeType, normalizedScopeId);
  }

  await getDb().collection(COLLECTIONS.PVE_BALANCE_CONFIGS).doc(existing._id).update({
    data: {
      config: cleanedConfig,
      updatedBy: account.id,
      updatedByName: account.displayName || account.username,
      updatedAt: serverDate(),
    },
  });
  const updated = await getBalanceConfig(normalizedScopeType, normalizedScopeId);
  return {
    before: toBalanceConfigView(existing),
    after: toBalanceConfigView(updated),
    removed: true,
  };
}

async function loadBalanceSnapshot() {
  const { data } = await getDb()
    .collection(COLLECTIONS.PVE_BALANCE_CONFIGS)
    .where({ enabled: true })
    .get();

  const snapshot = {
    globalConfig: {},
    chapterConfigs: {},
    unitConfigs: {},
  };

  for (const doc of data || []) {
    const config = deepClone(doc.config || {});
    if (doc.scopeType === PVE_BALANCE_SCOPE_TYPES.GLOBAL) {
      snapshot.globalConfig = mergeBalanceConfig(snapshot.globalConfig, config);
    } else if (doc.scopeType === PVE_BALANCE_SCOPE_TYPES.CHAPTER) {
      snapshot.chapterConfigs[doc.scopeId] = mergeBalanceConfig(snapshot.chapterConfigs[doc.scopeId] || {}, config);
    } else if (doc.scopeType === PVE_BALANCE_SCOPE_TYPES.UNIT) {
      snapshot.unitConfigs[doc.scopeId] = mergeBalanceConfig(snapshot.unitConfigs[doc.scopeId] || {}, config);
    }
  }

  return snapshot;
}

module.exports = {
  PVE_BALANCE_SCOPE_TYPES,
  PVE_BALANCE_UNIT_TYPES,
  PVE_BALANCE_FIELD_RULES,
  getDefaultBalanceConfig,
  buildBalanceCatalog,
  buildBalanceConfigsMap,
  toBalanceConfigView,
  listBalanceConfigs,
  getBalanceConfig,
  getBalanceConfigDetail,
  saveBalanceConfig,
  resetBalanceConfig,
  removeBalanceFieldOverride,
  removeBalanceSectionOverride,
  loadBalanceSnapshot,
  normalizeBalanceConfig,
  normalizeScopeType,
  normalizeScopeId,
  mergeBalanceConfig,
  resolveEffectiveBalanceConfigFromMap,
  UNIT_SCOPE_CHAPTER_MAP,
};
