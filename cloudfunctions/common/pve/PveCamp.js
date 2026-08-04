const ENHANCE_COST = [0, 20, 40, 70, 120, 180];
const ENHANCE_QUENCH_SAND = [0, 2, 3, 5, 8, 12];
/** 出售基础价：原金币价的 50%，防刷装换星尘。 */
const SELL_BASE = { COMMON: 5, FINE: 10, RARE: 20, EPIC: 40, LEGENDARY: 80 };
const SYNTH_STARDUST = { COMMON: 10, FINE: 20, RARE: 40, EPIC: 80 };
const SYNTH_FUSION_CORE = { COMMON: 1, FINE: 2, RARE: 3, EPIC: 5 };
const SELL_FUSION_CORE = { COMMON: 0, FINE: 0, RARE: 1, EPIC: 2, LEGENDARY: 3 };
const QUALITY_ORDER = ['COMMON', 'FINE', 'RARE', 'EPIC', 'LEGENDARY'];
const BAG_STEPS = [25, 35, 45, 60];
const BAG_UPGRADE_COST = {
  25: { stardust: 120, voidHide: 3 },
  35: { stardust: 240, voidHide: 6 },
  45: { stardust: 400, voidHide: 10 },
};

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function normalizeBagCapacity(value) {
  return BAG_STEPS.includes(value) ? value : 25;
}

function normalizeMaterials(value) {
  const src = value && typeof value === 'object' ? value : {};
  return {
    quenchSand: Number.isInteger(src.quenchSand) && src.quenchSand >= 0 ? src.quenchSand : 0,
    fusionCore: Number.isInteger(src.fusionCore) && src.fusionCore >= 0 ? src.fusionCore : 0,
    voidHide: Number.isInteger(src.voidHide) && src.voidHide >= 0 ? src.voidHide : 0,
  };
}

function withMaterials(profile, materials) {
  return { ...profile, materials: normalizeMaterials(materials) };
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

/** CLEAR 结算材料；TRIAL/PRACTICE 为 0。Boss=floor%7===0；精英位=floor%7===2。 */
function settlementMaterialGrants(floor, mode) {
  if (mode === 'TRIAL' || mode === 'PRACTICE') {
    return { quenchSand: 0, fusionCore: 0, voidHide: 0 };
  }
  const safeFloor = Number.isInteger(floor) && floor > 0 ? floor : 1;
  const rem = safeFloor % 7;
  const isBoss = rem === 0;
  const isElite = rem === 2;
  let quenchSand = 2 + rem;
  if (isBoss) quenchSand += 6;
  let fusionCore = 0;
  if (isBoss) fusionCore = 2;
  else if (isElite) fusionCore = 1;
  let voidHide = 0;
  if (isBoss) voidHide = 2;
  else if (isElite) voidHide = 1;
  return { quenchSand, fusionCore, voidHide };
}

function sellMaterialGrants(item) {
  return {
    quenchSand: 1 + Math.max(0, item.enhanceLevel | 0),
    fusionCore: SELL_FUSION_CORE[item.quality] ?? 0,
    voidHide: 0,
  };
}

function synthesizeEquipment(profile, request) {
  const ids = Array.isArray(request.instanceIds) ? request.instanceIds : [];
  if (ids.length !== 3 || new Set(ids).size !== 3) {
    fail('PVE_EQUIPMENT_SYNTH_NEED_THREE', '合成需要三件不同的装备');
  }
  const equipped = new Set(Object.values(profile.equipmentLoadout || {}).filter(Boolean));
  const mats = ids.map((id) => {
    const { item } = requireItem(profile, id);
    if (item.locked) fail('PVE_EQUIPMENT_LOCKED', '锁定装备不能用于合成');
    if (equipped.has(id)) fail('PVE_EQUIPMENT_EQUIPPED', '已装备物品不能用于合成');
    return item;
  });
  const [a, b, c] = mats;
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
  const stardustCost = SYNTH_STARDUST[a.quality];
  const coreCost = SYNTH_FUSION_CORE[a.quality];
  if (stardustCost == null || coreCost == null) {
    fail('PVE_EQUIPMENT_SYNTH_MAX_QUALITY', '传奇装备无法继续合成');
  }
  if (profile.gold < stardustCost) fail('PVE_STARDUST_NOT_ENOUGH', '星尘不足');
  const bag = normalizeMaterials(profile.materials);
  if (bag.fusionCore < coreCost) fail('PVE_FUSION_CORE_NOT_ENOUGH', '聚星核不足');
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
  return withMaterials(
    {
      ...profile,
      gold: profile.gold - stardustCost,
      equipmentInventory: [
        ...profile.equipmentInventory.filter((x) => !consume.has(x.instanceId)).map((x) => ({ ...x })),
        result,
      ],
    },
    { ...bag, fusionCore: bag.fusionCore - coreCost },
  );
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
    const sandCost = ENHANCE_QUENCH_SAND[level];
    if (profile.gold < cost) fail('PVE_STARDUST_NOT_ENOUGH', '星尘不足');
    const bag = normalizeMaterials(profile.materials);
    if (bag.quenchSand < sandCost) fail('PVE_QUENCH_SAND_NOT_ENOUGH', '淬星砂不足');
    inventory[index] = { ...item, enhanceLevel: level };
    return withMaterials(
      { ...profile, gold: profile.gold - cost, equipmentInventory: inventory },
      { ...bag, quenchSand: bag.quenchSand - sandCost },
    );
  }
  if (request.action === 'SELL') {
    if (item.locked) fail('PVE_EQUIPMENT_LOCKED', '锁定装备不能出售');
    if (equipped) fail('PVE_EQUIPMENT_EQUIPPED', '已装备物品不能出售');
    let invested = 0;
    for (let i = 1; i <= item.enhanceLevel; i += 1) invested += ENHANCE_COST[i];
    const price = (SELL_BASE[item.quality] ?? 0) + Math.floor(invested * 0.5);
    const grant = sellMaterialGrants(item);
    const bag = normalizeMaterials(profile.materials);
    return withMaterials(
      {
        ...profile,
        gold: profile.gold + price,
        equipmentInventory: inventory.filter((x) => x.instanceId !== item.instanceId),
      },
      {
        quenchSand: bag.quenchSand + grant.quenchSand,
        fusionCore: bag.fusionCore + grant.fusionCore,
        voidHide: bag.voidHide + grant.voidHide,
      },
    );
  }
  fail('PVE_INVALID_CAMP_ACTION', '未知装备管理动作');
}

function upgradeBag(profile) {
  const from = normalizeBagCapacity(profile.bagCapacity);
  const cost = BAG_UPGRADE_COST[from];
  if (!cost) fail('PVE_BAG_MAX', '背包已扩至上限');
  if (profile.gold < cost.stardust) fail('PVE_STARDUST_NOT_ENOUGH', '星尘不足');
  const bag = normalizeMaterials(profile.materials);
  if (bag.voidHide < cost.voidHide) fail('PVE_VOID_HIDE_NOT_ENOUGH', '虚空革不足');
  const to = BAG_STEPS[BAG_STEPS.indexOf(from) + 1];
  return {
    ...withMaterials(profile, {
      ...bag,
      voidHide: bag.voidHide - cost.voidHide,
    }),
    gold: profile.gold - cost.stardust,
    bagCapacity: to,
  };
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
  ENHANCE_QUENCH_SAND,
  SELL_BASE,
  SYNTH_STARDUST,
  SYNTH_FUSION_CORE,
  normalizeMaterials,
  normalizeBagCapacity,
  settlementMaterialGrants,
  sellMaterialGrants,
  manageEquipment,
  upgradeBag,
  saveMinghenPreset,
  synthesizeMinghen,
};
