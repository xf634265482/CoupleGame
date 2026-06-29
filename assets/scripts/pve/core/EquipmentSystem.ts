// 装备系统（design §11 AC-17 M2）：5 类槽位 × 5 品质阶，生成随机装备实例。
// rollEquipment 供 LootSystem 调用；装备属性在 CombatSystem 中计算：
//   WEAPON.baseStat → 攻击加成，ARMOR.baseStat → 受伤减伤，HELMET.baseStat → maxHp 加成
//   （equipItem/unequipItem 应用），SHOES/TRINKET 见各自阈值常量与 AnimaSystem。
// 纯函数，零框架依赖，所有随机走传入的 Rng（AC-13 确定性）。

import type { EquipItem, EquipQuality, EquipSlot, PveBalanceSnapshot, RunPlayer } from './PveTypes';
import type { Rng } from './rng';
import { getBalancedEquipmentBaseStat } from './PveBalance';

interface EquipTemplate {
  name: string;
  /** WEAPON: 攻击加成 / ARMOR: 减伤值 / HELMET: maxHp 加成 / SHOES、TRINKET: 见专属阈值/加成逻辑 */
  baseStat: number;
}

const EQUIPMENT_TEMPLATES: Record<EquipSlot, Record<EquipQuality, EquipTemplate>> = {
  WEAPON: {
    COMMON:    { name: '生锈短刃',   baseStat: 10 },
    FINE:      { name: '铁制长剑',   baseStat: 20 },
    RARE:      { name: '精钢剑',     baseStat: 30 },
    EPIC:      { name: '英雄之刃',   baseStat: 50 },
    LEGENDARY: { name: '命运之剑',   baseStat: 80 },
  },
  ARMOR: {
    COMMON:    { name: '皮革轻甲',   baseStat: 10 },
    FINE:      { name: '铁制锁甲',   baseStat: 20 },
    RARE:      { name: '精钢板甲',   baseStat: 30 },
    EPIC:      { name: '英雄铠甲',   baseStat: 40 },
    LEGENDARY: { name: '命运铠甲',   baseStat: 60 },
  },
  HELMET: {
    COMMON:    { name: '皮革头盔',   baseStat: 20 },
    FINE:      { name: '铁制战盔',   baseStat: 40 },
    RARE:      { name: '精钢头盔',   baseStat: 60 },
    EPIC:      { name: '英雄头冠',   baseStat: 100 },
    LEGENDARY: { name: '命运王冠',   baseStat: 140 },
  },
  SHOES: {
    COMMON:    { name: '布靴',       baseStat: 1 },
    FINE:      { name: '皮靴',       baseStat: 2 },
    RARE:      { name: '轻捷之靴',   baseStat: 3 },
    EPIC:      { name: '英雄战靴',   baseStat: 4 },
    LEGENDARY: { name: '疾风之靴',   baseStat: 5 },
  },
  TRINKET: {
    COMMON:    { name: '幸运铜币',   baseStat: 5 },
    FINE:      { name: '财运挂件',   baseStat: 10 },
    RARE:      { name: '聚财宝石',   baseStat: 15 },
    EPIC:      { name: '英雄徽章',   baseStat: 20 },
    LEGENDARY: { name: '命运碎晶',   baseStat: 30 },
  },
};

const EQUIP_SLOTS: readonly EquipSlot[] = ['WEAPON', 'ARMOR', 'HELMET', 'SHOES', 'TRINKET'];

// ── 靴子品质效果阈值 ─────────────────────────────────────
/** FINE+(baseStat≥2)：移动后视野揭示半径 +1。 */
export const SHOES_REVEAL_BONUS_THRESHOLD = 2;
/** RARE+(baseStat≥3)：每回合首次移动免费（0 AP）。 */
export const SHOES_FIRST_MOVE_THRESHOLD = 3;
/** EPIC+(baseStat≥4)：怪物仇恨半径缩小；EPIC→-2，LEGENDARY→-3。 */
export const SHOES_STEALTH_THRESHOLD = 4;

/** 靴子提供的怪物仇恨半径缩减量（类似 ROGUE 潜行词条，叠加生效）。 */
export function shoesStealthReduction(baseStat: number): number {
  if (baseStat < SHOES_STEALTH_THRESHOLD) return 0;
  return baseStat - 2; // EPIC(4)→2, LEGENDARY(5)→3
}

/**
 * 装备词条池（铁匠洗炼用，design §3 铁匠）。
 * M2 再扩展机械效果；M1 先存储 id 供 UI 展示。
 */
export const EQUIP_TRAIT_POOL: readonly string[] = [
  'equip_atk_up',   // 攻击 +10
  'equip_def_up',   // 防御 +10
  'equip_hp_up',    // 最大 HP +20
  'equip_crit_up',  // 暴击率 +5%（M2 实现）
  'equip_gold_up',  // 拾取金币 +10%（M2 实现）
  'equip_swift',    // 移动消耗 -1 AP（M2 实现）
];

/**
 * 生成指定槽位与品质的装备实例。
 * rng 用于生成唯一 id（保证同种子确定性，AC-13）。
 */
export function rollEquipment(
  rng: Rng,
  slot: EquipSlot,
  quality: EquipQuality,
  chapter = 1,
  balanceSnapshot?: PveBalanceSnapshot | null,
): EquipItem {
  const template = EQUIPMENT_TEMPLATES[slot][quality];
  const uid = rng.int(10000, 99999);
  return {
    id: `equip_${slot.toLowerCase()}_${quality.toLowerCase()}_${uid}`,
    slot,
    quality,
    name: template.name,
    baseStat: getBalancedEquipmentBaseStat(balanceSnapshot, chapter, slot, template.baseStat),
  };
}

/**
 * 从 5 个装备槽位中等概率随机选一个（AC-13：使用传入 rng，不消耗全局随机）。
 */
export function rollRandomSlot(rng: Rng): EquipSlot {
  return rng.pick(EQUIP_SLOTS);
}

/**
 * 装备指定物品到对应槽位（替换原有装备）。
 * HELMET.baseStat → maxHp 加成（design：头盔→提升HP）：按新旧 baseStat 差值同步调整
 * maxHp 与当前 hp，避免出现"提升头盔后 hp 超过/落后 maxHp"的状态。
 */
export function equipItem(player: RunPlayer, item: EquipItem): RunPlayer {
  const equipment = { ...player.equipment, [item.slot]: item };
  if (item.slot !== 'HELMET') {
    return { ...player, equipment };
  }
  const delta = item.baseStat - (player.equipment.HELMET?.baseStat ?? 0);
  const maxHp = player.maxHp + delta;
  return { ...player, equipment, maxHp, hp: Math.max(1, Math.min(maxHp, player.hp + delta)) };
}

/** 卸下指定槽位装备（变卖/替换前调用）；HELMET 卸下时同步移除其 maxHp 加成。 */
export function unequipItem(player: RunPlayer, slot: EquipSlot): RunPlayer {
  const item = player.equipment[slot];
  const equipment = { ...player.equipment };
  delete equipment[slot];
  if (slot !== 'HELMET' || !item) {
    return { ...player, equipment };
  }
  const maxHp = Math.max(1, player.maxHp - item.baseStat);
  return { ...player, equipment, maxHp, hp: Math.min(player.hp, maxHp) };
}

export { EQUIPMENT_TEMPLATES, EQUIP_SLOTS };
