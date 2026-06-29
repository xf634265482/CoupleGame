import type { EquipItem, EquipSlot } from '../core/PveTypes';
import { SHOES_FIRST_MOVE_THRESHOLD, SHOES_REVEAL_BONUS_THRESHOLD, SHOES_STEALTH_THRESHOLD, shoesStealthReduction } from '../core/EquipmentSystem';

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
  boss_active_ice: '主动冰冻',
  boss_ice_reduce_20: '站冰面时减伤 20%',
  boss_burn_on_hit: '命中附加灼烧',
  boss_burn_immune: '灼烧免疫',
  boss_kill_heal_8: '击杀回复 8 HP',
  boss_crit_15: '15% 概率暴击x2',
  boss_revive_50: '致死复活（回50%HP，每层1次）',
};

function slotEffectDesc(slot: EquipSlot, baseStat: number): string {
  switch (slot) {
    case 'WEAPON':
      return `攻击力 +${baseStat}`;
    case 'HELMET':
      return `最大HP +${baseStat}`;
    case 'ARMOR':
      return `每次受伤减伤 ${baseStat} 点`;
    case 'TRINKET':
      return `灵气获取量 +${baseStat}%`;
    case 'SHOES': {
      const parts: string[] = [`靴子等级 ${baseStat}`];
      if (baseStat >= SHOES_REVEAL_BONUS_THRESHOLD) parts.push('移动后视野 +1');
      if (baseStat >= SHOES_FIRST_MOVE_THRESHOLD) parts.push('每回合首次移动免费');
      if (baseStat >= SHOES_STEALTH_THRESHOLD) parts.push(`怪物仇恨半径 -${shoesStealthReduction(baseStat)}`);
      return parts.join(' · ');
    }
  }
}

export function formatEquipDetailBody(item: EquipItem): string {
  const qualityStr = QUALITY_LABEL[item.quality] ?? item.quality;
  const slotStr = SLOT_LABEL[item.slot];
  const traitLine = item.trait
    ? `词条：${TRAIT_CN[item.trait] ?? '特殊词条'}`
    : '词条：未洗炼';

  return [
    `${slotStr} · ${qualityStr}`,
    `主属性：${slotEffectDesc(item.slot, item.baseStat)}`,
    traitLine,
  ].join('\n');
}
