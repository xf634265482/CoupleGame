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
export const ENHANCE_COST = [0, 30, 60, 110, 180, 280] as const;

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

/** 固定鞋履的移动 AP 减免（旧随机鞋仍看 baseStat>0）。 */
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
      return '档位';
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
      return `档位 ${current} / ${max}`;
    case 'TRINKET':
      return `灵气 +${current} / ${max}%`;
  }
}

export function enhanceEquipment(instance: PveEquipmentInstance, gold: number) {
  if (instance.enhanceLevel >= 5) throw new Error('EQUIPMENT_MAX_ENHANCE');
  const nextLevel = instance.enhanceLevel + 1;
  const cost = ENHANCE_COST[nextLevel] ?? 0;
  if (gold < cost) throw new Error('GOLD_NOT_ENOUGH');
  return { instance: { ...instance, enhanceLevel: nextLevel }, gold: gold - cost, cost };
}

export function equipmentSellPrice(instance: PveEquipmentInstance): number {
  let invested = 0;
  for (let i = 1; i <= instance.enhanceLevel; i += 1) invested += ENHANCE_COST[i] ?? 0;
  return QUALITY_SELL_PRICE[instance.quality] + Math.floor(invested * 0.5);
}
