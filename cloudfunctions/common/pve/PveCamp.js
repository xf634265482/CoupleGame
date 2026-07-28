const ENHANCE_COST = [0, 30, 60, 110, 180, 280];
/** 出售基础价：原金币价的 50%，防刷装换星尘。 */
const SELL_BASE = { COMMON: 5, FINE: 10, RARE: 20, EPIC: 40, LEGENDARY: 80 };
const SYNTH_STARDUST = { COMMON: 15, FINE: 30, RARE: 60, EPIC: 120 };
const QUALITY_ORDER = ['COMMON', 'FINE', 'RARE', 'EPIC', 'LEGENDARY'];

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function requireItem(profile, instanceId) {
  const index = profile.equipmentInventory.findIndex((x) => x.instanceId === instanceId);
  if (index < 0) fail('PVE_EQUIPMENT_NOT_OWNED', '未持有该装备');
  return { item: profile.equipmentInventory[index], index };
}

function nextQuality(quality) {
  const idx = QUALITY_ORDER.indexOf(quality);
  if (idx < 0 || idx >= QUALITY_ORDER.length - 1) return null;
  return QUALITY_ORDER[idx + 1];
}

function rawBaseStat(item) {
  if (typeof item.baseStat === 'number' && Number.isFinite(item.baseStat) && item.baseStat > 0) {
    return item.baseStat;
  }
  return 1;
}

function synthesizeEquipment(profile, request) {
  const ids = Array.isArray(request.instanceIds) ? request.instanceIds : [];
  if (ids.length !== 3 || new Set(ids).size !== 3) {
    fail('PVE_EQUIPMENT_SYNTH_NEED_THREE', '合成需要三件不同的装备');
  }
  const equipped = new Set(Object.values(profile.equipmentLoadout || {}).filter(Boolean));
  const materials = ids.map((id) => {
    const { item } = requireItem(profile, id);
    if (item.locked) fail('PVE_EQUIPMENT_LOCKED', '锁定装备不能用于合成');
    if (equipped.has(id)) fail('PVE_EQUIPMENT_EQUIPPED', '已装备物品不能用于合成');
    return item;
  });
  const [a, b, c] = materials;
  if (
    a.definitionId !== b.definitionId
    || a.definitionId !== c.definitionId
    || a.quality !== b.quality
    || a.quality !== c.quality
  ) {
    fail('PVE_EQUIPMENT_SYNTH_MISMATCH', '合成材料须同名同品质');
  }
  const quality = nextQuality(a.quality);
  if (!quality) fail('PVE_EQUIPMENT_SYNTH_MAX_QUALITY', '传奇装备无法继续合成');
  const cost = SYNTH_STARDUST[a.quality];
  if (cost == null) fail('PVE_EQUIPMENT_SYNTH_MAX_QUALITY', '传奇装备无法继续合成');
  if (profile.gold < cost) fail('PVE_STARDUST_NOT_ENOUGH', '星尘不足');
  const baseStat = Math.round((rawBaseStat(a) + rawBaseStat(b) + rawBaseStat(c)) / 3);
  const consume = new Set(ids);
  const result = {
    instanceId: `synth_${Date.now()}_${Math.floor(Math.random() * 1e9)}`,
    definitionId: a.definitionId,
    quality,
    enhanceLevel: 0,
    locked: false,
    baseStat,
  };
  return {
    ...profile,
    gold: profile.gold - cost,
    equipmentInventory: [
      ...profile.equipmentInventory.filter((x) => !consume.has(x.instanceId)).map((x) => ({ ...x })),
      result,
    ],
  };
}

function manageEquipment(profile, request) {
  if (request.action === 'SYNTHESIZE') {
    return synthesizeEquipment(profile, request);
  }
  const { item, index } = requireItem(profile, request.instanceId);
  const inventory = profile.equipmentInventory.map((x) => ({ ...x }));
  const equipped = Object.values(profile.equipmentLoadout).includes(item.instanceId);
  if (request.action === 'TOGGLE_LOCK') {
    inventory[index] = { ...item, locked: !item.locked };
    return { ...profile, equipmentInventory: inventory };
  }
  if (request.action === 'ENHANCE') {
    if (item.enhanceLevel >= 5) fail('PVE_EQUIPMENT_MAX_ENHANCE', '装备已强化至上限');
    const level = item.enhanceLevel + 1;
    const cost = ENHANCE_COST[level];
    if (profile.gold < cost) fail('PVE_STARDUST_NOT_ENOUGH', '星尘不足');
    inventory[index] = { ...item, enhanceLevel: level };
    return { ...profile, gold: profile.gold - cost, equipmentInventory: inventory };
  }
  if (request.action === 'SELL') {
    if (item.locked) fail('PVE_EQUIPMENT_LOCKED', '锁定装备不能出售');
    if (equipped) fail('PVE_EQUIPMENT_EQUIPPED', '已装备物品不能出售');
    let invested = 0;
    for (let i = 1; i <= item.enhanceLevel; i += 1) invested += ENHANCE_COST[i];
    const price = (SELL_BASE[item.quality] ?? 0) + Math.floor(invested * 0.5);
    return {
      ...profile,
      gold: profile.gold + price,
      equipmentInventory: inventory.filter((x) => x.instanceId !== item.instanceId),
    };
  }
  fail('PVE_INVALID_CAMP_ACTION', '未知装备管理动作');
}

function saveMinghenPreset(profile, request) {
  const name = typeof request.name === 'string' ? request.name.trim().slice(0, 12) : '';
  if (!name) fail('PVE_INVALID_PRESET_NAME', '方案名称不能为空');
  const id = typeof request.id === 'string' && request.id ? request.id : `preset_${Date.now()}`;
  const preset = { id, name, entries: profile.minghenLoadout.map((x) => ({ ...x })) };
  const existing = profile.minghenPresets.findIndex((x) => x.id === id);
  let presets = profile.minghenPresets.map((x) => ({ ...x, entries: x.entries.map((e) => ({ ...e })) }));
  if (existing >= 0) presets[existing] = preset;
  else {
    if (presets.length >= 5) fail('PVE_PRESET_LIMIT', '最多保存5套命痕方案');
    presets.push(preset);
  }
  return { ...profile, minghenPresets: presets };
}

/** Explicit I→II: level=2, copies unchanged. */
function synthesizeMinghen(profile, request) {
  const id = typeof request.id === 'string' ? request.id : '';
  if (!id) fail('PVE_INVALID_MINGHEN_ID', '命痕无效');
  const owned = profile.minghenCollection?.[id];
  if (!owned) fail('PVE_MINGHEN_NOT_OWNED', '未持有该命痕');
  if ((profile.minghenLoadout || []).some((x) => x.id === id)) {
    fail('PVE_MINGHEN_EQUIPPED', '已装配命痕不能用于合成');
  }
  if (owned.level !== 1) fail('PVE_MINGHEN_ALREADY_II', '已是II级或更高');
  if ((owned.copies || 0) < 2) fail('PVE_MINGHEN_COPIES_SHORT', '副本不足，需要至少2枚');
  return {
    ...profile,
    minghenCollection: {
      ...profile.minghenCollection,
      [id]: { ...owned, level: 2 },
    },
  };
}

module.exports = {
  ENHANCE_COST,
  SELL_BASE,
  SYNTH_STARDUST,
  manageEquipment,
  saveMinghenPreset,
  synthesizeMinghen,
};
