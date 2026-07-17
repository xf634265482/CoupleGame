import type { EquipItem, EquipQuality, EquipSlot } from './core/PveTypes';

export type EquipmentTierBundle = 'equipment_tier1' | 'equipment_tier2' | 'equipment_tier3';

export type EquipmentIconEntry = {
  itemName: string;
  slot: EquipSlot;
  quality: EquipQuality;
  bundle: EquipmentTierBundle;
  fileName: string;
};

const ENTRIES: EquipmentIconEntry[] = [
  { itemName: '生锈短刃', slot: 'WEAPON', quality: 'COMMON', bundle: 'equipment_tier1', fileName: 'common_weapon_rusty_short_dagger.jpg' },
  { itemName: '钝铁斧', slot: 'WEAPON', quality: 'COMMON', bundle: 'equipment_tier1', fileName: 'common_weapon_crude_iron_axe.jpg' },
  { itemName: '木矛', slot: 'WEAPON', quality: 'COMMON', bundle: 'equipment_tier1', fileName: 'common_weapon_wooden_spear.jpg' },
  { itemName: '皮革轻甲', slot: 'ARMOR', quality: 'COMMON', bundle: 'equipment_tier1', fileName: 'common_armor_leather_light_armor.jpg' },
  { itemName: '铁制板甲', slot: 'ARMOR', quality: 'COMMON', bundle: 'equipment_tier1', fileName: 'common_armor_iron_plate_armor.jpg' },
  { itemName: '棉布软甲', slot: 'ARMOR', quality: 'COMMON', bundle: 'equipment_tier1', fileName: 'common_armor_padded_cloth_armor.jpg' },
  { itemName: '皮革头盔', slot: 'HELMET', quality: 'COMMON', bundle: 'equipment_tier1', fileName: 'common_helmet_leather_helmet.jpg' },
  { itemName: '铁制重盔', slot: 'HELMET', quality: 'COMMON', bundle: 'equipment_tier1', fileName: 'common_helmet_heavy_iron_helmet.jpg' },
  { itemName: '布制轻盔', slot: 'HELMET', quality: 'COMMON', bundle: 'equipment_tier1', fileName: 'common_helmet_soft_cloth_hood.jpg' },
  { itemName: '布靴', slot: 'SHOES', quality: 'COMMON', bundle: 'equipment_tier1', fileName: 'common_shoes_cloth_shoes.jpg' },
  { itemName: '皮靴', slot: 'SHOES', quality: 'COMMON', bundle: 'equipment_tier1', fileName: 'common_shoes_leather_shoes.jpg' },
  { itemName: '沙地靴', slot: 'SHOES', quality: 'COMMON', bundle: 'equipment_tier1', fileName: 'common_shoes_desert_boots.jpg' },
  { itemName: '幸运铜币', slot: 'TRINKET', quality: 'COMMON', bundle: 'equipment_tier1', fileName: 'common_trinket_lucky_copper_coin.jpg' },
  { itemName: '灵力宝珠', slot: 'TRINKET', quality: 'COMMON', bundle: 'equipment_tier1', fileName: 'common_trinket_spirit_orb.jpg' },
  { itemName: '财运符', slot: 'TRINKET', quality: 'COMMON', bundle: 'equipment_tier1', fileName: 'common_trinket_fortune_charm.jpg' },

  { itemName: '铁制长剑', slot: 'WEAPON', quality: 'FINE', bundle: 'equipment_tier1', fileName: 'fine_weapon_iron_longsword.jpg' },
  { itemName: '铁战斧', slot: 'WEAPON', quality: 'FINE', bundle: 'equipment_tier1', fileName: 'fine_weapon_iron_battle_axe.jpg' },
  { itemName: '铁制长矛', slot: 'WEAPON', quality: 'FINE', bundle: 'equipment_tier1', fileName: 'fine_weapon_iron_spear.jpg' },
  { itemName: '铁制锁甲', slot: 'ARMOR', quality: 'FINE', bundle: 'equipment_tier1', fileName: 'fine_armor_iron_chainmail.jpg' },
  { itemName: '钢制板甲', slot: 'ARMOR', quality: 'FINE', bundle: 'equipment_tier1', fileName: 'fine_armor_steel_plate_armor.jpg' },
  { itemName: '皮质轻甲', slot: 'ARMOR', quality: 'FINE', bundle: 'equipment_tier1', fileName: 'fine_armor_hardened_leather_armor.jpg' },
  { itemName: '铁制战盔', slot: 'HELMET', quality: 'FINE', bundle: 'equipment_tier1', fileName: 'fine_helmet_iron_war_helmet.jpg' },
  { itemName: '钢制重盔', slot: 'HELMET', quality: 'FINE', bundle: 'equipment_tier1', fileName: 'fine_helmet_steel_heavy_helmet.jpg' },
  { itemName: '皮制轻盔', slot: 'HELMET', quality: 'FINE', bundle: 'equipment_tier1', fileName: 'fine_helmet_leather_light_hood.jpg' },
  { itemName: '旅行皮靴', slot: 'SHOES', quality: 'FINE', bundle: 'equipment_tier1', fileName: 'fine_shoes_travel_leather_boots.jpg' },
  { itemName: '轻便皮靴', slot: 'SHOES', quality: 'FINE', bundle: 'equipment_tier1', fileName: 'fine_shoes_light_leather_boots.jpg' },
  { itemName: '铁制战靴', slot: 'SHOES', quality: 'FINE', bundle: 'equipment_tier1', fileName: 'fine_shoes_iron_war_boots.jpg' },
  { itemName: '聚灵碧玉', slot: 'TRINKET', quality: 'FINE', bundle: 'equipment_tier1', fileName: 'fine_trinket_spirit_jade.jpg' },
  { itemName: '财运挂件', slot: 'TRINKET', quality: 'FINE', bundle: 'equipment_tier1', fileName: 'fine_trinket_fortune_pendant.jpg' },
  { itemName: '幸运吊坠', slot: 'TRINKET', quality: 'FINE', bundle: 'equipment_tier1', fileName: 'fine_trinket_lucky_pendant.jpg' },

  { itemName: '精钢剑', slot: 'WEAPON', quality: 'RARE', bundle: 'equipment_tier2', fileName: 'rare_weapon_steel_sword.jpg' },
  { itemName: '钢铁战斧', slot: 'WEAPON', quality: 'RARE', bundle: 'equipment_tier2', fileName: 'rare_weapon_steel_battle_axe.jpg' },
  { itemName: '精钢长枪', slot: 'WEAPON', quality: 'RARE', bundle: 'equipment_tier2', fileName: 'rare_weapon_steel_lance.jpg' },
  { itemName: '精钢锁甲', slot: 'ARMOR', quality: 'RARE', bundle: 'equipment_tier2', fileName: 'rare_armor_steel_chainmail.jpg' },
  { itemName: '精钢板甲', slot: 'ARMOR', quality: 'RARE', bundle: 'equipment_tier2', fileName: 'rare_armor_steel_plate_mail.jpg' },
  { itemName: '精制轻甲', slot: 'ARMOR', quality: 'RARE', bundle: 'equipment_tier2', fileName: 'rare_armor_refined_light_armor.jpg' },
  { itemName: '精钢战盔', slot: 'HELMET', quality: 'RARE', bundle: 'equipment_tier2', fileName: 'rare_helmet_steel_war_helmet.jpg' },
  { itemName: '精钢重盔', slot: 'HELMET', quality: 'RARE', bundle: 'equipment_tier2', fileName: 'rare_helmet_steel_heavy_helm.jpg' },
  { itemName: '精制轻盔', slot: 'HELMET', quality: 'RARE', bundle: 'equipment_tier2', fileName: 'rare_helmet_refined_light_hood.jpg' },
  { itemName: '猎手软靴', slot: 'SHOES', quality: 'RARE', bundle: 'equipment_tier2', fileName: 'rare_shoes_hunter_soft_boots.jpg' },
  { itemName: '精制战靴', slot: 'SHOES', quality: 'RARE', bundle: 'equipment_tier2', fileName: 'rare_shoes_refined_war_boots.jpg' },
  { itemName: '精钢铁靴', slot: 'SHOES', quality: 'RARE', bundle: 'equipment_tier2', fileName: 'rare_shoes_steel_plated_boots.jpg' },
  { itemName: '聚财宝石', slot: 'TRINKET', quality: 'RARE', bundle: 'equipment_tier2', fileName: 'rare_trinket_wealth_gem.jpg' },
  { itemName: '灵魂宝珠', slot: 'TRINKET', quality: 'RARE', bundle: 'equipment_tier2', fileName: 'rare_trinket_soul_orb.jpg' },
  { itemName: '财运宝玉', slot: 'TRINKET', quality: 'RARE', bundle: 'equipment_tier2', fileName: 'rare_trinket_fortune_jade.jpg' },

  { itemName: '英雄之刃', slot: 'WEAPON', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_weapon_hero_blade.jpg' },
  { itemName: '战场阔剑', slot: 'WEAPON', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_weapon_battle_broadsword.jpg' },
  { itemName: '英雄战斧', slot: 'WEAPON', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_weapon_hero_battle_axe.jpg' },
  { itemName: '烈焰巨斧', slot: 'WEAPON', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_weapon_blazing_greataxe.jpg' },
  { itemName: '英雄长枪', slot: 'WEAPON', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_weapon_hero_lance.jpg' },
  { itemName: '英雄铠甲', slot: 'ARMOR', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_armor_hero_armor.jpg' },
  { itemName: '蔑视铠甲', slot: 'ARMOR', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_armor_dread_plate.jpg' },
  { itemName: '英雄板甲', slot: 'ARMOR', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_armor_hero_plate.jpg' },
  { itemName: '不朽铁甲', slot: 'ARMOR', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_armor_immortal_iron_armor.jpg' },
  { itemName: '疾风轻甲', slot: 'ARMOR', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_armor_gale_light_armor.jpg' },
  { itemName: '英雄头冠', slot: 'HELMET', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_helmet_hero_circlet.jpg' },
  { itemName: '勇士战冠', slot: 'HELMET', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_helmet_warrior_warcrown.jpg' },
  { itemName: '英雄重盔', slot: 'HELMET', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_helmet_hero_heavy_helm.jpg' },
  { itemName: '不朽铁盔', slot: 'HELMET', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_helmet_immortal_iron_helm.jpg' },
  { itemName: '疾风面甲', slot: 'HELMET', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_helmet_gale_visage.jpg' },
  { itemName: '英雄战靴', slot: 'SHOES', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_shoes_hero_war_boots.jpg' },
  { itemName: '游侠软靴', slot: 'SHOES', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_shoes_ranger_soft_boots.jpg' },
  { itemName: '隐足战靴', slot: 'SHOES', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_shoes_shadowstride_boots.jpg' },
  { itemName: '猎风铁靴', slot: 'SHOES', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_shoes_windhunter_iron_boots.jpg' },
  { itemName: '疾行套靴', slot: 'SHOES', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_shoes_swiftrun_boots.jpg' },
  { itemName: '英雄徽章', slot: 'TRINKET', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_trinket_hero_medallion.jpg' },
  { itemName: '幸运宝典', slot: 'TRINKET', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_trinket_lucky_tome.jpg' },
  { itemName: '财神徽章', slot: 'TRINKET', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_trinket_fortune_emblem.jpg' },
  { itemName: '幸运圆盘', slot: 'TRINKET', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_trinket_lucky_disc.jpg' },
  { itemName: '命运碎晶', slot: 'TRINKET', quality: 'EPIC', bundle: 'equipment_tier3', fileName: 'epic_trinket_fate_shard.jpg' },

  { itemName: '命运之刃', slot: 'WEAPON', quality: 'LEGENDARY', bundle: 'equipment_tier3', fileName: 'legendary_weapon_fate_blade.jpg' },
  { itemName: '噬魂战斧', slot: 'WEAPON', quality: 'LEGENDARY', bundle: 'equipment_tier3', fileName: 'legendary_weapon_soul_axe.jpg' },
  { itemName: '贯日长弓', slot: 'WEAPON', quality: 'LEGENDARY', bundle: 'equipment_tier3', fileName: 'legendary_weapon_sun_bow.jpg' },
  { itemName: '命运铠甲', slot: 'ARMOR', quality: 'LEGENDARY', bundle: 'equipment_tier3', fileName: 'legendary_armor_fate_armor.jpg' },
  { itemName: '永恒板甲', slot: 'ARMOR', quality: 'LEGENDARY', bundle: 'equipment_tier3', fileName: 'legendary_armor_eternal_plate.jpg' },
  { itemName: '疾风幻影甲', slot: 'ARMOR', quality: 'LEGENDARY', bundle: 'equipment_tier3', fileName: 'legendary_armor_phantom_armor.jpg' },
  { itemName: '命运王冠', slot: 'HELMET', quality: 'LEGENDARY', bundle: 'equipment_tier3', fileName: 'legendary_helmet_fate_crown.jpg' },
  { itemName: '盖世铁冠', slot: 'HELMET', quality: 'LEGENDARY', bundle: 'equipment_tier3', fileName: 'legendary_helmet_iron_crown.jpg' },
  { itemName: '智慧轻冠', slot: 'HELMET', quality: 'LEGENDARY', bundle: 'equipment_tier3', fileName: 'legendary_helmet_sage_crown.jpg' },
  { itemName: '疾风之靴', slot: 'SHOES', quality: 'LEGENDARY', bundle: 'equipment_tier3', fileName: 'legendary_shoes_gale_boots.jpg' },
  { itemName: '飞燕步履', slot: 'SHOES', quality: 'LEGENDARY', bundle: 'equipment_tier3', fileName: 'legendary_shoes_swallow_steps.jpg' },
  { itemName: '影踪战靴', slot: 'SHOES', quality: 'LEGENDARY', bundle: 'equipment_tier3', fileName: 'legendary_shoes_shadow_boots.jpg' },
  { itemName: '命运护符', slot: 'TRINKET', quality: 'LEGENDARY', bundle: 'equipment_tier3', fileName: 'legendary_trinket_fate_amulet.jpg' },
  { itemName: '财神赐福', slot: 'TRINKET', quality: 'LEGENDARY', bundle: 'equipment_tier3', fileName: 'legendary_trinket_fortune_blessing.jpg' },
  { itemName: '幸运女神眼', slot: 'TRINKET', quality: 'LEGENDARY', bundle: 'equipment_tier3', fileName: 'legendary_trinket_lucky_eye.jpg' },
];

const ICON_BY_NAME = new Map<string, EquipmentIconEntry>(ENTRIES.map((entry) => [entry.itemName, entry]));
const FALLBACK_BY_SLOT_QUALITY = new Map<string, EquipmentIconEntry>();

for (const entry of ENTRIES) {
  const key = `${entry.slot}:${entry.quality}`;
  if (!FALLBACK_BY_SLOT_QUALITY.has(key)) {
    FALLBACK_BY_SLOT_QUALITY.set(key, entry);
  }
}

export const EQUIPMENT_ICON_ENTRIES = ENTRIES;

export function getEquipmentIconEntryByName(name: string | null | undefined): EquipmentIconEntry | null {
  if (!name) return null;
  return ICON_BY_NAME.get(name) ?? null;
}

export function getEquipmentFallbackEntry(
  slot: EquipSlot | null | undefined,
  quality: EquipQuality | null | undefined,
): EquipmentIconEntry | null {
  if (!slot || !quality) return null;
  return FALLBACK_BY_SLOT_QUALITY.get(`${slot}:${quality}`) ?? null;
}

export function resolveEquipmentIconEntry(item: EquipItem | null | undefined): EquipmentIconEntry | null {
  if (!item) return null;
  return getEquipmentIconEntryByName(item.name) ?? getEquipmentFallbackEntry(item.slot, item.quality);
}

export function getEquipmentBundlesForChapter(chapter: number): EquipmentTierBundle[] {
  if (chapter <= 1) return ['equipment_tier1'];
  if (chapter === 2) return ['equipment_tier1', 'equipment_tier2'];
  return ['equipment_tier1', 'equipment_tier2', 'equipment_tier3'];
}

/** 按最高解锁楼层预载图标分包（13+ 含 tier3 传说/史诗 Boss 装）。 */
export function getEquipmentBundlesForFloor(floor: number): EquipmentTierBundle[] {
  if (floor <= 7) return ['equipment_tier1'];
  if (floor <= 12) return ['equipment_tier1', 'equipment_tier2'];
  return ['equipment_tier1', 'equipment_tier2', 'equipment_tier3'];
}
