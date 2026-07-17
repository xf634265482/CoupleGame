// Boss 专属掉落清单（design Boss设计V1 / 掉落系统）：
// 每个 Boss 设 3 件专属道具，击杀时从中等概率随机 1 件必掉（无玩家选择，重复挑战乐趣）。
//
// trait id 命名约定：boss_<效果>_<数值>，实际效果见 BossEquipTraitEffects / CombatSystem。
// （Task #2 仅定义数据骨架，效果挂钩在后续 task 完成）。

import type { EquipItem, EquipQuality, EquipSlot, PveBalanceSnapshot } from '../PveTypes';
import type { Rng } from '../rng';
import { getBalancedEquipmentBaseStat } from '../PveBalance';
import { IMPLICIT_WEAPON_AXE, IMPLICIT_WEAPON_SPEAR, IMPLICIT_WEAPON_SWORD } from '../EquipmentSystem';

/** Boss id 联合（与 CHAPTER_BOSS 同步）。 */
export type BossId = 'GOBLIN_CHIEF' | 'QUICKSAND_SCORPION' | 'FROST_GIANT' | 'LAVA_LORD' | 'FATE_GUARDIAN';

export type BossSpoilTemplate = {
  slot: EquipSlot;
  quality: EquipQuality;
  name: string;
  baseStat: number;
  baseStatMax?: number;
  implicit?: string;
  /** 装备词条 id（效果实现见 BossEquipTraitEffects.ts / CombatSystem.ts 等）。 */
  trait: string;
};

/**
 * Boss 专属掉落表：每 Boss 3 件，击杀时等概率随机给 1 件（必掉）。
 *
 * 设计原则：
 * - 武器类强调主动输出（流血/灼烧/暴击）
 * - 防具/头盔类强调被动减伤或环境免疫（灼烧免疫、冰面减伤）
 * - 饰品类强调质变机制（召唤、铺地形、致死复活）
 * - 品质随章节递增（RARE → EPIC → LEGENDARY），数值随 EQUIPMENT_TEMPLATES 同档对齐
 */
export const BOSS_SPOILS: Record<BossId, readonly BossSpoilTemplate[]> = {
  GOBLIN_CHIEF: [
    { slot: 'WEAPON', quality: 'RARE', name: '哥布林酋长战斧', baseStat: 30, implicit: IMPLICIT_WEAPON_AXE, trait: 'on_hit_lifesteal_1' },
    { slot: 'TRINKET', quality: 'RARE', name: '战争号角', baseStat: 15, trait: 'boss_summon_warrior' },
    { slot: 'HELMET', quality: 'RARE', name: '破旧王冠', baseStat: 60, trait: 'boss_stun_on_hurt' },
  ],
  QUICKSAND_SCORPION: [
    { slot: 'WEAPON', quality: 'EPIC', name: '毒蝎尾刺', baseStat: 50, implicit: IMPLICIT_WEAPON_SPEAR, trait: 'boss_bleed_on_hit' },
    { slot: 'SHOES', quality: 'EPIC', name: '流沙护腿', baseStat: 4, trait: 'boss_sand_immune' },
    { slot: 'TRINKET', quality: 'EPIC', name: '甲壳护符', baseStat: 20, trait: 'boss_phys_reduce_15' },
  ],
  FROST_GIANT: [
    { slot: 'WEAPON', quality: 'EPIC', name: '寒冰巨剑', baseStat: 50, implicit: IMPLICIT_WEAPON_SWORD, trait: 'boss_slow_on_hit' },
    { slot: 'HELMET', quality: 'EPIC', name: '霜甲战盔', baseStat: 100, trait: 'boss_ice_reduce_20' },
    { slot: 'TRINKET', quality: 'EPIC', name: '永冻指环', baseStat: 20, trait: 'boss_active_ice' },
  ],
  LAVA_LORD: [
    { slot: 'WEAPON', quality: 'LEGENDARY', name: '熔岩战锤', baseStat: 80, implicit: IMPLICIT_WEAPON_AXE, trait: 'boss_burn_on_hit' },
    { slot: 'ARMOR', quality: 'LEGENDARY', name: '焰心护胸', baseStat: 60, trait: 'boss_burn_immune' },
    { slot: 'TRINKET', quality: 'LEGENDARY', name: '烈焰指环', baseStat: 30, trait: 'boss_kill_heal_8' },
  ],
  FATE_GUARDIAN: [
    { slot: 'WEAPON', quality: 'LEGENDARY', name: '命运之刃', baseStat: 80, implicit: IMPLICIT_WEAPON_SWORD, trait: 'boss_crit_15' },
    { slot: 'HELMET', quality: 'LEGENDARY', name: '预言面具', baseStat: 140, trait: 'boss_show_intent' },
    { slot: 'TRINKET', quality: 'LEGENDARY', name: '守卫圣盾', baseStat: 30, trait: 'boss_revive_50' },
  ],
} as const;

/** 按中文名查找 Boss 专属战利品模板（营地/永久背包回退用）。 */
export function findBossSpoilByName(name: string): BossSpoilTemplate | null {
  for (const table of Object.values(BOSS_SPOILS)) {
    const found = table.find((tpl) => tpl.name === name);
    if (found) return found;
  }
  return null;
}

/**
 * 从指定 Boss 的专属掉落表中等概率随机 1 件，生成 EquipItem 实例。
 * 击杀 Boss 必调用一次，结果作为 100% 必掉的专属奖励。
 */
export function rollBossSpoil(
  rng: Rng,
  bossId: BossId,
  chapter = 1,
  balanceSnapshot?: PveBalanceSnapshot | null,
): EquipItem {
  const table = BOSS_SPOILS[bossId];
  const template = rng.pick(table);
  const uid = rng.int(100000, 999999);
  const scaledStat = getBalancedEquipmentBaseStat(
    balanceSnapshot,
    chapter,
    template.slot,
    template.baseStat,
  );
  const scaledMax = getBalancedEquipmentBaseStat(
    balanceSnapshot,
    chapter,
    template.slot,
    template.baseStatMax ?? template.baseStat,
  );
  return {
    id: `equip_${bossId.toLowerCase()}_${template.slot.toLowerCase()}_${uid}`,
    slot: template.slot,
    quality: template.quality,
    name: template.name,
    baseStat: scaledStat,
    baseStatMax: Math.max(scaledStat, scaledMax),
    implicit: template.implicit,
    trait: template.trait,
  };
}
