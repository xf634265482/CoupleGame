// 传奇装备独特效果系统（Phase 3 AC-EQ-6）
// 15 件传奇，每槽 3 件，分别偏向狂战/射手/隐匿三职业流派。
// 效果判定纯函数，零框架依赖，所有随机走传入 Rng（AC-13 确定性）。

import type { Equipment, EquipSlot, RunPlayer } from './PveTypes';

export interface LegendaryDef {
  id: string;
  name: string;
  description: string;
  classAffinity: 'BERSERKER' | 'ARCHER' | 'ROGUE' | 'ANY';
}

/** 15 件传奇定义（id → 说明），供 UI 展示与掉落偏向使用。 */
export const LEGENDARY_DEFS: Record<string, LegendaryDef> = {
  // ── 武器（3件）──
  leg_fate_blade: {
    id: 'leg_fate_blade',
    name: '命运之刃',
    description: '每击杀一个怪物本层攻击+3（最多5层/+15）',
    classAffinity: 'ANY',
  },
  leg_soul_axe: {
    id: 'leg_soul_axe',
    name: '噬魂战斧',
    description: '击杀后下次攻击必定暴击×2，并回复5HP',
    classAffinity: 'BERSERKER',
  },
  leg_sun_bow: {
    id: 'leg_sun_bow',
    name: '贯日长弓',
    description: '攻击射程+2，攻击无视目标护甲',
    classAffinity: 'ARCHER',
  },
  // ── 护甲（3件）──
  leg_fate_armor: {
    id: 'leg_fate_armor',
    name: '命运铠甲',
    description: '每层开始时回复10%最大HP',
    classAffinity: 'ANY',
  },
  leg_eternal_plate: {
    id: 'leg_eternal_plate',
    name: '永恒板甲',
    description: '本层首次将死时免疫死亡（回到1HP），每层仅1次',
    classAffinity: 'BERSERKER',
  },
  leg_phantom_armor: {
    id: 'leg_phantom_armor',
    name: '疾风幻影甲',
    description: '受到攻击后30%概率，下次受到的怪物伤害减半',
    classAffinity: 'ROGUE',
  },
  // ── 头盔（3件）──
  leg_fate_crown: {
    id: 'leg_fate_crown',
    name: '命运王冠',
    description: '每击杀章节Boss，本远征攻击力永久+10（最多3层）',
    classAffinity: 'ANY',
  },
  leg_iron_crown: {
    id: 'leg_iron_crown',
    name: '盖世铁冠',
    description: '攻击伤害+20%（附加于重盔固有警戒+1效果之上）',
    classAffinity: 'BERSERKER',
  },
  leg_sage_crown: {
    id: 'leg_sage_crown',
    name: '智慧轻冠',
    description: '每次灵气强化触发时回复30HP',
    classAffinity: 'ANY',
  },
  // ── 靴子（3件）──
  leg_gale_boots: {
    id: 'leg_gale_boots',
    name: '疾风之靴',
    description: '每回合首步永久免费；首步后首次攻击伤害+25%',
    classAffinity: 'ANY',
  },
  leg_swallow_steps: {
    id: 'leg_swallow_steps',
    name: '飞燕步履',
    description: '怪物对你的警戒感知额外缩小3格（极致隐匿）',
    classAffinity: 'ROGUE',
  },
  leg_shadow_boots: {
    id: 'leg_shadow_boots',
    name: '影踪战靴',
    description: '每步移动额外消耗AP-1（最低0，可与其他减耗叠加）',
    classAffinity: 'ROGUE',
  },
  // ── 饰品（3件）──
  leg_fate_amulet: {
    id: 'leg_fate_amulet',
    name: '命运护符',
    description: '每次灵气强化触发时攻击力永久+5（最多5层/+25）',
    classAffinity: 'ANY',
  },
  leg_fortune_blessing: {
    id: 'leg_fortune_blessing',
    name: '财神赐福',
    description: '星尘获取+80%；每层入场时按持有星尘回HP（每20星尘=1HP，最多15HP）',
    classAffinity: 'ANY',
  },
  leg_lucky_eye: {
    id: 'leg_lucky_eye',
    name: '幸运女神眼',
    description: '每次攻击有20%概率触发连击（追加50%伤害）',
    classAffinity: 'ANY',
  },
};

/** 指定槽位的传奇 ID 列表（3/槽，与 EQUIPMENT_POOL 中 LEGENDARY 顺序一一对应）。 */
export const LEGENDARY_BY_SLOT: Record<EquipSlot, readonly string[]> = {
  WEAPON:  ['leg_fate_blade', 'leg_soul_axe',       'leg_sun_bow'],
  ARMOR:   ['leg_fate_armor', 'leg_eternal_plate',   'leg_phantom_armor'],
  HELMET:  ['leg_fate_crown', 'leg_iron_crown',      'leg_sage_crown'],
  SHOES:   ['leg_gale_boots', 'leg_swallow_steps',   'leg_shadow_boots'],
  TRINKET: ['leg_fate_amulet','leg_fortune_blessing', 'leg_lucky_eye'],
};

/** 获取与指定职业有亲和力（或 ANY）的传奇 ID 列表，供偏向掉落使用。 */
export function getLegendaryIdsByClass(slot: EquipSlot, classId: string): readonly string[] {
  const ids = LEGENDARY_BY_SLOT[slot];
  const biased = ids.filter((id) => {
    const def = LEGENDARY_DEFS[id];
    return def?.classAffinity === classId || def?.classAffinity === 'ANY';
  });
  return biased.length > 0 ? biased : ids;
}

/** 玩家装备中是否持有指定传奇 ID 的装备。 */
export function playerHasLegendary(equipment: Equipment, legendaryId: string): boolean {
  return Object.values(equipment).some((item) => item?.legendaryId === legendaryId);
}

/** 玩家装备中所有激活的传奇 ID 列表。 */
export function collectLegendaryIds(equipment: Equipment): string[] {
  return Object.values(equipment)
    .filter((item): item is NonNullable<typeof item> => !!item?.legendaryId)
    .map((item) => item.legendaryId as string);
}

// ── 效果辅助函数（供各系统模块调用）────────────────────────────

/** 命运之刃：本层击杀叠层攻击加成（每层击杀 +3，最多 5 叠 = +15）。 */
export function legFateBladeBonus(equipment: Equipment, stacks: number): number {
  if (!playerHasLegendary(equipment, 'leg_fate_blade')) return 0;
  return Math.min(5, stacks) * 3;
}

/** 命运王冠：远征内 Boss 击杀叠层攻击加成（每 Boss +10，最多 3 叠 = +30）。 */
export function legFateCrownBonus(equipment: Equipment, stacks: number): number {
  if (!playerHasLegendary(equipment, 'leg_fate_crown')) return 0;
  return Math.min(3, stacks) * 10;
}

/** 命运护符：灵气强化叠层攻击加成（每次强化 +5，最多 5 叠 = +25）。 */
export function legFateAmuletBonus(equipment: Equipment, stacks: number): number {
  if (!playerHasLegendary(equipment, 'leg_fate_amulet')) return 0;
  return Math.min(5, stacks) * 5;
}

/** 盖世铁冠：攻击伤害 +20%（multiplicative）。 */
export function legIronCrownMultiplier(equipment: Equipment): number {
  return playerHasLegendary(equipment, 'leg_iron_crown') ? 1.2 : 1.0;
}

/** 贯日长弓：攻击射程 +2。 */
export function legSunBowRangeBonus(equipment: Equipment): number {
  return playerHasLegendary(equipment, 'leg_sun_bow') ? 2 : 0;
}

/** 贯日长弓：攻击无视护甲。 */
export function legSunBowIgnoresArmor(equipment: Equipment): boolean {
  return playerHasLegendary(equipment, 'leg_sun_bow');
}

/** 影踪战靴：移动AP额外-1（最低 0）。 */
export function legShadowBootsMoveCostReduction(equipment: Equipment): number {
  return playerHasLegendary(equipment, 'leg_shadow_boots') ? 1 : 0;
}

/** 疾风之靴：每回合首步免费（不依赖靴子 baseStat 档位）。 */
export function legGaleBootsFirstMoveFree(equipment: Equipment): boolean {
  return playerHasLegendary(equipment, 'leg_gale_boots');
}

/** 飞燕步履：怪物警戒半径对玩家额外 -3。 */
export function legSwallowStepsStealthBonus(equipment: Equipment): number {
  return playerHasLegendary(equipment, 'leg_swallow_steps') ? 3 : 0;
}

/** 财神赐福：金币获取比例加成（+80%）。 */
export function legFortuneBlessingGoldBonus(equipment: Equipment): number {
  return playerHasLegendary(equipment, 'leg_fortune_blessing') ? 0.8 : 0;
}

/** 财神赐福：每层入场时按金币回血（每 20 金 = 1HP，最多 15HP）。 */
export function legFortuneBlessingFloorHeal(equipment: Equipment, gold: number): number {
  if (!playerHasLegendary(equipment, 'leg_fortune_blessing')) return 0;
  return Math.min(15, Math.floor(gold / 20));
}

/** 命运铠甲：每层开始时回复10%最大HP（向上取整）。 */
export function legFateArmorHeal(equipment: Equipment, maxHp: number): number {
  if (!playerHasLegendary(equipment, 'leg_fate_armor')) return 0;
  return Math.ceil(maxHp * 0.1);
}

/** 传奇装备中文说明（供装备详情 UI 展示）。 */
export function legendaryDescription(legendaryId: string): string {
  const def = LEGENDARY_DEFS[legendaryId];
  if (!def) return legendaryId;
  return `【传奇】${def.description}`;
}
