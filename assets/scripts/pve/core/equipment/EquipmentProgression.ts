import type { EquipItem, EquipQuality, EquipSlot, Equipment } from '../PveTypes';
import type { PveEquipmentInstance } from '../PveProgressionTypes';
import { PVE_EQUIPMENT_SLOTS } from '../PveProgressionTypes';
import { getClassicEquipmentTemplate } from '../EquipmentSystem';
import { findBossSpoilByName } from '../bosses/BossSpoils';
import { getFixedEquipmentDefinition } from './EquipmentDefinition';

export type ResolvedEquipTemplate = {
  name: string;
  slot: EquipSlot;
  quality: EquipQuality;
  baseStatMin: number;
  baseStatMax: number;
  implicit?: string;
  trait?: string;
  legendaryId?: string;
};

/** 旧库模板优先；缺失时回退 Boss 战利品定义，避免营地 UNKNOWN_EQUIPMENT_DEFINITION。 */
export function resolveEquipTemplate(name: string): ResolvedEquipTemplate | null {
  const classic = getClassicEquipmentTemplate(name);
  if (classic) return classic;
  const spoil = findBossSpoilByName(name);
  if (!spoil) return null;
  return {
    name: spoil.name,
    slot: spoil.slot,
    quality: spoil.quality,
    baseStatMin: spoil.baseStat,
    baseStatMax: spoil.baseStatMax ?? spoil.baseStat,
    implicit: spoil.implicit,
    trait: spoil.trait,
  };
}

export const QUALITY_MULTIPLIER = { COMMON: 1, FINE: 1.15, RARE: 1.32, EPIC: 1.52, LEGENDARY: 1.75 } as const;
export const QUALITY_SELL_PRICE = { COMMON: 5, FINE: 10, RARE: 20, EPIC: 40, LEGENDARY: 80 } as const;
/** 强化星尘（+1…+5）；另耗 ENHANCE_QUENCH_SAND。 */
export const ENHANCE_COST = [0, 20, 40, 70, 120, 180] as const;
export const ENHANCE_QUENCH_SAND = [0, 2, 3, 5, 8, 12] as const;
/** 三合一升品星尘；另耗 SYNTH_FUSION_CORE。 */
export const SYNTH_STARDUST = { COMMON: 10, FINE: 20, RARE: 40, EPIC: 80 } as const;
export const SYNTH_FUSION_CORE = { COMMON: 1, FINE: 2, RARE: 3, EPIC: 5 } as const;
export const QUALITY_ORDER = ['COMMON', 'FINE', 'RARE', 'EPIC', 'LEGENDARY'] as const;

export type CampMaterials = {
  quenchSand: number;
  fusionCore: number;
  voidHide: number;
  bondCore: number;
};

export function normalizeCampMaterials(
  value?: Partial<CampMaterials> | null,
): CampMaterials {
  return {
    quenchSand: Number.isInteger(value?.quenchSand) && (value?.quenchSand ?? 0) >= 0
      ? (value!.quenchSand as number)
      : 0,
    fusionCore: Number.isInteger(value?.fusionCore) && (value?.fusionCore ?? 0) >= 0
      ? (value!.fusionCore as number)
      : 0,
    voidHide: Number.isInteger(value?.voidHide) && (value?.voidHide ?? 0) >= 0
      ? (value!.voidHide as number)
      : 0,
    bondCore: Number.isInteger(value?.bondCore) && (value?.bondCore ?? 0) >= 0
      ? (value!.bondCore as number)
      : 0,
  };
}

export function sellMaterialGrants(instance: PveEquipmentInstance): CampMaterials {
  const fusionByQuality: Record<EquipQuality, number> = {
    COMMON: 0, FINE: 0, RARE: 1, EPIC: 2, LEGENDARY: 3,
  };
  return {
    quenchSand: 1 + Math.max(0, instance.enhanceLevel),
    fusionCore: fusionByQuality[instance.quality] ?? 0,
    voidHide: 0,
    bondCore: 0,
  };
}

export function nextEquipQuality(quality: EquipQuality): EquipQuality | null {
  const idx = QUALITY_ORDER.indexOf(quality);
  if (idx < 0 || idx >= QUALITY_ORDER.length - 1) return null;
  return QUALITY_ORDER[idx + 1]!;
}

export type SynthesizeEquipmentError =
  | 'SYNTH_NEED_THREE'
  | 'SYNTH_NOT_OWNED'
  | 'SYNTH_LOCKED'
  | 'SYNTH_EQUIPPED'
  | 'SYNTH_MISMATCH'
  | 'SYNTH_MAX_QUALITY'
  | 'GOLD_NOT_ENOUGH'
  | 'FUSION_CORE_NOT_ENOUGH';

/**
 * 同名同品质三合一升品（纯函数，供单测；云端 PveCamp 为权威）。
 * instanceIds 须恰好 3 个且互异。
 */
export function synthesizeEquipment(
  inventory: readonly PveEquipmentInstance[],
  loadout: Readonly<Record<string, string | undefined>>,
  instanceIds: readonly string[],
  gold: number,
  newInstanceId: string,
  materials: CampMaterials = { quenchSand: 0, fusionCore: 999, voidHide: 0, bondCore: 0 },
): {
  inventory: PveEquipmentInstance[];
  gold: number;
  cost: number;
  fusionCoreCost: number;
  materials: CampMaterials;
  result: PveEquipmentInstance;
} {
  if (instanceIds.length !== 3 || new Set(instanceIds).size !== 3) {
    throw new Error('SYNTH_NEED_THREE');
  }
  const equipped = new Set(Object.values(loadout).filter((id): id is string => !!id));
  const mats = instanceIds.map((id) => {
    const item = inventory.find((entry) => entry.instanceId === id);
    if (!item) throw new Error('SYNTH_NOT_OWNED');
    if (item.locked) throw new Error('SYNTH_LOCKED');
    if (equipped.has(id)) throw new Error('SYNTH_EQUIPPED');
    return item;
  });
  const [a, b, c] = mats;
  if (
    a.definitionId !== b.definitionId
    || a.definitionId !== c.definitionId
    || a.quality !== b.quality
    || a.quality !== c.quality
  ) {
    throw new Error('SYNTH_MISMATCH');
  }
  const nextQuality = nextEquipQuality(a.quality);
  if (!nextQuality) throw new Error('SYNTH_MAX_QUALITY');
  const cost = SYNTH_STARDUST[a.quality as keyof typeof SYNTH_STARDUST];
  const fusionCoreCost = SYNTH_FUSION_CORE[a.quality as keyof typeof SYNTH_FUSION_CORE];
  if (cost == null || fusionCoreCost == null) throw new Error('SYNTH_MAX_QUALITY');
  if (gold < cost) throw new Error('GOLD_NOT_ENOUGH');
  const bag = normalizeCampMaterials(materials);
  if (bag.fusionCore < fusionCoreCost) throw new Error('FUSION_CORE_NOT_ENOUGH');
  const baseStat = Math.round(
    (rawEquipBaseStat(a) + rawEquipBaseStat(b) + rawEquipBaseStat(c)) / 3,
  );
  const consume = new Set(instanceIds);
  const result: PveEquipmentInstance = {
    instanceId: newInstanceId,
    definitionId: a.definitionId,
    quality: nextQuality,
    enhanceLevel: 0,
    locked: false,
    baseStat,
  };
  return {
    inventory: [...inventory.filter((item) => !consume.has(item.instanceId)), result],
    gold: gold - cost,
    cost,
    fusionCoreCost,
    materials: { ...bag, fusionCore: bag.fusionCore - fusionCoreCost },
    result,
  };
}

/** 统计可作合成材料的同名同品质件数（未锁、未穿）。 */
export function countSynthesizeEligible(
  inventory: readonly PveEquipmentInstance[],
  loadout: Readonly<Record<string, string | undefined>>,
  definitionId: string,
  quality: EquipQuality,
): number {
  const equipped = new Set(Object.values(loadout).filter((id): id is string => !!id));
  return inventory.filter(
    (item) =>
      item.definitionId === definitionId
      && item.quality === quality
      && !item.locked
      && !equipped.has(item.instanceId),
  ).length;
}

/** 以 primary 为锚点，再选强化最低的两件凑满三合一。 */
export function pickSynthesizeMaterials(
  inventory: readonly PveEquipmentInstance[],
  loadout: Readonly<Record<string, string | undefined>>,
  primaryInstanceId: string,
): string[] | null {
  const primary = inventory.find((item) => item.instanceId === primaryInstanceId);
  if (!primary) return null;
  const equipped = new Set(Object.values(loadout).filter((id): id is string => !!id));
  if (primary.locked || equipped.has(primary.instanceId)) return null;
  if (!nextEquipQuality(primary.quality)) return null;
  const others = inventory
    .filter(
      (item) =>
        item.instanceId !== primary.instanceId
        && item.definitionId === primary.definitionId
        && item.quality === primary.quality
        && !item.locked
        && !equipped.has(item.instanceId),
    )
    .sort((a, b) => a.enhanceLevel - b.enhanceLevel || a.instanceId.localeCompare(b.instanceId));
  if (others.length < 2) return null;
  return [primary.instanceId, others[0]!.instanceId, others[1]!.instanceId];
}

/** 实例上的原始浮动主数值（未乘品质/强化）；缺省或非法时取模板区间中点。 */
export function rawEquipBaseStat(instance: Pick<PveEquipmentInstance, 'definitionId' | 'baseStat'>): number {
  const tpl = resolveEquipTemplate(instance.definitionId);
  if (!tpl) throw new Error('UNKNOWN_EQUIPMENT_DEFINITION');
  if (typeof instance.baseStat === 'number' && Number.isFinite(instance.baseStat) && instance.baseStat > 0) {
    return instance.baseStat;
  }
  return Math.round((tpl.baseStatMin + tpl.baseStatMax) / 2);
}

/** 品质 × 强化倍率后的主数值。 */
export function scaleEquipPrimaryStat(
  raw: number,
  quality: EquipQuality,
  enhanceLevel = 0,
): number {
  const multiplier = QUALITY_MULTIPLIER[quality] * (1 + enhanceLevel * 0.06);
  return Math.round(raw * multiplier);
}

function scaledBaseStat(instance: PveEquipmentInstance): number {
  return scaleEquipPrimaryStat(rawEquipBaseStat(instance), instance.quality, instance.enhanceLevel);
}

export function scaledEquipmentStats(instance: PveEquipmentInstance) {
  const tpl = resolveEquipTemplate(instance.definitionId);
  if (!tpl) throw new Error('UNKNOWN_EQUIPMENT_DEFINITION');
  const scaled = scaledBaseStat(instance);
  const def = getFixedEquipmentDefinition(instance.definitionId);
  return {
    power: tpl.slot === 'WEAPON' ? scaled : 0,
    maxHp: tpl.slot === 'HELMET' || tpl.slot === 'SHOES' || tpl.slot === 'TRINKET' ? scaled : 0,
    armor: tpl.slot === 'ARMOR' ? scaled : 0,
    fixed: { ...def.fixed },
  };
}

/**
 * 当前生效主数值 / 该件模板上限经品质·强化后的上限。
 * `EquipItem.baseStat` 必须是原始浮动值（与营地库存一致），禁止再写入已缩放值。
 */
export function effectiveEquipPrimaryRange(item: EquipItem): { current: number; max: number } {
  const tpl = item.name ? resolveEquipTemplate(item.name) : null;
  const rawCurrent = item.baseStat;
  const rawMax = Math.max(rawCurrent, item.baseStatMax ?? tpl?.baseStatMax ?? rawCurrent);
  const enhance = item.enhanceLevel ?? 0;
  return {
    current: scaleEquipPrimaryStat(rawCurrent, item.quality, enhance),
    max: scaleEquipPrimaryStat(rawMax, item.quality, enhance),
  };
}

export function equipInstanceFromItem(item: EquipItem): PveEquipmentInstance | null {
  if (!item.name) return null;
  return {
    instanceId: item.id,
    definitionId: item.name,
    quality: item.quality,
    enhanceLevel: item.enhanceLevel ?? 0,
    locked: false,
    baseStat: item.baseStat,
  };
}

export function scaledStatsForEquipItem(item: EquipItem) {
  const instance = equipInstanceFromItem(item);
  if (!instance) return null;
  if (!resolveEquipTemplate(instance.definitionId)) return null;
  return scaledEquipmentStats(instance);
}


/** 局内 EquipItem：保留原始浮动 baseStat，战斗/UI 再按品质·强化缩放。 */
export function toFixedEquipItem(instance: PveEquipmentInstance): EquipItem {
  const tpl = resolveEquipTemplate(instance.definitionId);
  if (!tpl) throw new Error('UNKNOWN_EQUIPMENT_DEFINITION');
  const rawBase = rawEquipBaseStat(instance);
  return {
    id: instance.instanceId,
    slot: tpl.slot,
    quality: instance.quality,
    name: tpl.name,
    baseStat: rawBase,
    baseStatMax: tpl.baseStatMax,
    enhanceLevel: instance.enhanceLevel,
    ...(tpl.implicit ? { implicit: tpl.implicit } : {}),
    ...(tpl.legendaryId ? { legendaryId: tpl.legendaryId } : {}),
    ...(tpl.trait ? { trait: tpl.trait } : {}),
  };
}

/** 已穿戴装备提供的最大生命加成（旧库头盔/鞋/饰品 + 固定缩放）。 */
export function equipmentMaxHpBonus(equipment: Equipment): number {
  let total = 0;
  for (const slot of PVE_EQUIPMENT_SLOTS) {
    const item = equipment[slot];
    if (!item) continue;
    const stats = scaledStatsForEquipItem(item);
    if (stats) {
      total += stats.maxHp;
      const def = getFixedEquipmentDefinition(item.name ?? item.fixedDefinitionId ?? '');
      if (def.fixed.maxHpPenalty) total -= def.fixed.maxHpPenalty;
    } else if (slot === 'HELMET') {
      total += item.baseStat ?? 0;
    }
  }
  return total;
}

/** 固定鞋履的移动 AP 减免（定义表字段；经典鞋以品质阶段表为准）。 */
export function fixedShoesMoveCostReduction(item: EquipItem | undefined): number {
  if (!item?.name) return 0;
  try {
    return getFixedEquipmentDefinition(item.name).fixed.moveCostReduction ?? 0;
  } catch {
    return 0;
  }
}

/** 固定头盔的迷雾揭示半径加成。 */
export function fixedHelmetFogBonus(item: EquipItem | undefined): number {
  if (!item?.name) return 0;
  try {
    return getFixedEquipmentDefinition(item.name).fixed.fogRadius ?? 0;
  } catch {
    return 0;
  }
}

function primaryStatLabel(slot: EquipSlot): string {
  switch (slot) {
    case 'WEAPON':
      return '攻击';
    case 'HELMET':
      return '生命';
    case 'ARMOR':
      return '护甲';
    case 'SHOES':
      return '生命';
    case 'TRINKET':
      return '灵气';
  }
}

/** 装备列表一行中的属性摘要（生效当前值/上限，含品质·强化；始终展示上限）。 */
export function equipStatSummaryForUi(item: EquipItem): string {
  const { current, max } = effectiveEquipPrimaryRange(item);
  if (current <= 0 && max <= 0) return '';
  const label = primaryStatLabel(item.slot);
  const suffix = item.slot === 'TRINKET' ? '%' : '';
  return `${label}+${current}/${max}${suffix}`;
}

/** 装备详情「主属性」文案：生效当前值 / 品质·强化后的浮动上限（始终展示上限）。 */
export function equipPrimaryStatDescription(item: EquipItem): string {
  const { current, max } = effectiveEquipPrimaryRange(item);
  switch (item.slot) {
    case 'WEAPON':
      return `攻击力 +${current} / ${max}`;
    case 'HELMET':
      return `最大HP +${current} / ${max}`;
    case 'ARMOR':
      return `护甲 +${current} / ${max}`;
    case 'SHOES':
      return `最大HP +${current} / ${max}`;
    case 'TRINKET':
      return `灵气 +${current} / ${max}%`;
  }
}

export function enhanceEquipment(
  instance: PveEquipmentInstance,
  gold: number,
  materials: CampMaterials = { quenchSand: 999, fusionCore: 0, voidHide: 0, bondCore: 0 },
) {
  if (instance.enhanceLevel >= 5) throw new Error('EQUIPMENT_MAX_ENHANCE');
  const nextLevel = instance.enhanceLevel + 1;
  const cost = ENHANCE_COST[nextLevel] ?? 0;
  const sandCost = ENHANCE_QUENCH_SAND[nextLevel] ?? 0;
  if (gold < cost) throw new Error('GOLD_NOT_ENOUGH');
  const bag = normalizeCampMaterials(materials);
  if (bag.quenchSand < sandCost) throw new Error('QUENCH_SAND_NOT_ENOUGH');
  return {
    instance: { ...instance, enhanceLevel: nextLevel },
    gold: gold - cost,
    cost,
    sandCost,
    materials: { ...bag, quenchSand: bag.quenchSand - sandCost },
  };
}

export function equipmentSellPrice(instance: PveEquipmentInstance): number {
  let invested = 0;
  for (let i = 1; i <= instance.enhanceLevel; i += 1) invested += ENHANCE_COST[i] ?? 0;
  return QUALITY_SELL_PRICE[instance.quality] + Math.floor(invested * 0.5);
}
