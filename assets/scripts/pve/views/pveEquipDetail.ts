import type { EquipItem, EquipSlot } from '../core/PveTypes';
import {
  SHOES_FIRST_MOVE_THRESHOLD,
  SHOES_REVEAL_BONUS_THRESHOLD,
  SHOES_STEALTH_THRESHOLD,
  shoesStealthReduction,
} from '../core/EquipmentSystem';
import { affixDescription } from '../core/AffixSystem';
import { legendaryDescription } from '../core/LegendarySystem';

const QUALITY_LABEL: Record<string, string> = {
  COMMON: '普通',
  FINE: '精良',
  RARE: '稀有',
  EPIC: '史诗',
  LEGENDARY: '传奇',
};

const SLOT_LABEL: Record<EquipSlot, string> = {
  WEAPON: '武器',
  HELMET: '头盔',
  ARMOR: '护甲',
  SHOES: '靴子',
  TRINKET: '饰品',
};

/** 基础款优缺点简短描述（AC-EQ-3，装备详情展示）。 */
const IMPLICIT_CN: Record<string, string> = {
  weapon_axe:    '高攻 / 攻击AP+1',
  weapon_spear:  '攻击范围+1 / 伤略低',
  armor_plate:   '高防 / 移动AP+1',
  helmet_heavy:  '高HP / 警戒范围+1',
  trinket_gold:  '金币获取加成',
};

const TRAIT_CN: Record<string, string> = {
  equip_atk_up: '攻击 +10',
  equip_def_up: '防御 +10',
  equip_hp_up: '最大HP +20',
  equip_crit_up: '暴击率 +5%',
  equip_gold_up: '拾取金币 +10%',
  equip_swift: '移动AP -1',
  on_hit_lifesteal_1: '命中吸血（回复HP）',
  boss_stun_on_hurt: '受击有概率眩晕攻击者',
  boss_bleed_on_hit: '命中附加流血',
  boss_sand_immune: '沙坑地形免疫',
  boss_phys_reduce_15: '物理减伤 15%',
  boss_slow_on_hit: '命中减速（冻结1回合）',
  boss_ice_reduce_20: '站冰面时减伤 20%',
  boss_burn_on_hit: '命中附加灼烧',
  boss_burn_immune: '灼烧免疫',
  boss_kill_heal_8: '击杀回复 8 HP',
  boss_crit_15: '15% 概率暴击x2',
  boss_revive_50: '致死复活（回50%HP，每层1次）',
  boss_summon_warrior: '召唤援军',
  boss_active_ice: '主动冰冻',
  boss_show_intent: '预知意图',
};

const TRAIT_DESC: Record<string, string> = {
  equip_atk_up: '攻击力额外提升 10 点',
  equip_def_up: '每次受伤额外减免 10 点伤害',
  equip_hp_up: '最大 HP 额外提升 20 点',
  equip_crit_up: '主动攻击暴击率额外提升 5%',
  equip_gold_up: '拾取金币额外提升 10%',
  equip_swift: '移动消耗 AP -1',
  on_hit_lifesteal_1: '主动攻击命中后回复少量生命',
  boss_stun_on_hurt: '受击时有概率反制并眩晕攻击者',
  boss_bleed_on_hit: '主动攻击命中后附加流血',
  boss_sand_immune: '无视流沙/沙坑地形带来的额外消耗',
  boss_phys_reduce_15: '受到的物理伤害降低 15%',
  boss_slow_on_hit: '主动攻击命中后冻结目标 1 回合',
  boss_active_ice: '主动攻击附带冰冻并触发铺冰效果',
  boss_ice_reduce_20: '站在冰面上时额外减伤 20%',
  boss_burn_on_hit: '主动攻击命中后附加灼烧',
  boss_burn_immune: '免疫灼烧伤害',
  boss_kill_heal_8: '击杀目标后回复 8 点生命',
  boss_crit_15: '主动攻击有 15% 概率造成 2 倍暴击',
  boss_revive_50: '致死时自动复活并回复 50% HP，每场远征仅 1 次',
  boss_summon_warrior: '每 5 回合主动召唤 1 名哥布林战士助战',
  boss_show_intent: '显示 Boss 下一回合的行动意图',
};

function slotEffectDesc(slot: EquipSlot, baseStat: number, baseStatMax?: number): string {
  const maxSuffix = baseStatMax !== undefined && baseStatMax !== baseStat ? ` / ${baseStatMax}` : '';
  switch (slot) {
    case 'WEAPON':
      return `攻击力 +${baseStat}${maxSuffix}`;
    case 'HELMET':
      return `最大HP +${baseStat}${maxSuffix}`;
    case 'ARMOR':
      return `减伤 ${baseStat}${maxSuffix} 点`;
    case 'TRINKET':
      return `灵气获取 +${baseStat}${maxSuffix}%`;
    case 'SHOES': {
      const parts: string[] = [`档位 ${baseStat}${maxSuffix}`];
      if (baseStat >= SHOES_REVEAL_BONUS_THRESHOLD) parts.push('视野+1');
      if (baseStat >= SHOES_FIRST_MOVE_THRESHOLD) parts.push('首步免费');
      if (baseStat >= SHOES_STEALTH_THRESHOLD) parts.push(`潜行-${shoesStealthReduction(baseStat)}`);
      return parts.join(' · ');
    }
  }
}

export function formatEquipDetailBody(item: EquipItem): string {
  const qualityStr = QUALITY_LABEL[item.quality] ?? item.quality;
  const slotStr = SLOT_LABEL[item.slot];
  const traitName = item.trait ? (TRAIT_CN[item.trait] ?? item.trait) : '';
  const traitDesc = item.trait ? (TRAIT_DESC[item.trait] ?? traitName) : '';
  const implicitDesc = item.implicit ? (IMPLICIT_CN[item.implicit] ?? item.implicit) : '';

  const lines = [
    `${slotStr} · ${qualityStr}`,
    `主属性：${slotEffectDesc(item.slot, item.baseStat, item.baseStatMax)}`,
  ];
  if (implicitDesc) {
    lines.push(`特性：${implicitDesc}`);
  }
  if (item.affixes && item.affixes.length > 0) {
    item.affixes.forEach((aff) => lines.push(affixDescription(aff)));
  } else if (!item.trait) {
    lines.push('词条：未洗炼');
  }
  if (item.trait) {
    lines.push(`词条：${traitName}`);
    lines.push(`效果：${traitDesc}`);
  }
  if (item.legendaryId) {
    lines.push(legendaryDescription(item.legendaryId));
  }
  return lines.join('\n');
}
