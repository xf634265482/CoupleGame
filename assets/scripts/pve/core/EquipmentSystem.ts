// 装备系统（design §11 / AC-EQ-1/2/3）：5 类槽位 × 5 品质阶，基础装备池每槽 17 件（白3/绿3/蓝3/紫5/橙3）。
// rollEquipment 供 LootSystem 调用；baseStat 区间内随机（AC-13 确定性）；
// 优缺点 implicit 由 CombatSystem / MovementSystem / MonsterAI 内联判断生效。
// 纯函数，零框架依赖，所有随机走传入的 Rng。

import type { EquipItem, EquipQuality, EquipSlot, PveBalanceSnapshot, RunPlayer } from './PveTypes';
import type { Rng } from './rng';
import { getBalancedEquipmentBaseStat } from './PveBalance';
import { rollAffixes } from './AffixSystem';
import { LEGENDARY_BY_SLOT, getLegendaryIdsByClass } from './LegendarySystem';

// ── 优缺点 implicit 效果 id（AC-EQ-3，CombatSystem/MovementSystem/MonsterAI 识别）──
/** 斧类武器：攻击消耗额外 AP +1（高伤 / 高代价）。 */
export const IMPLICIT_WEAPON_AXE = 'weapon_axe';
/** 矛/弓类武器：攻击范围 +1（远程 / 略低伤）。 */
export const IMPLICIT_WEAPON_SPEAR = 'weapon_spear';
/** 板甲：移动消耗额外 AP +1（高防 / 机动差）。 */
export const IMPLICIT_ARMOR_PLATE = 'armor_plate';
/** 重盔：怪物警戒范围 +1（高 HP / 更易被发现）。 */
export const IMPLICIT_HELMET_HEAVY = 'helmet_heavy';
/** 财运饰品：金币获取量加成（Phase 4 实现具体效果）。 */
export const IMPLICIT_TRINKET_GOLD = 'trinket_gold';

interface EquipTemplate {
  name: string;
  baseStatMin: number;
  baseStatMax: number;
  implicit?: string;
  /** LEGENDARY 独特效果 id（与 LEGENDARY_BY_SLOT 顺序对应，由 LegendarySystem 定义）。 */
  legendaryId?: string;
}

// ── 基础装备池（AC-EQ-1：每槽 白3/绿3/蓝3/紫5/橙3 = 17 件）────────────────────────────
// 「baseStat 区间」：掉落时在 [min, max] 内随机，每件都有「数值优选」乐趣（AC-EQ-2）。
// 优缺点：斧高攻/AP+1、矛远程/伤略低、板甲高防/移AP+1、重盔高HP/警戒+1。
// LEGENDARY（橙）本期占位，Phase 3 再填传奇独特效果（legendaryId）。
const EQUIPMENT_POOL: Readonly<Record<EquipSlot, Readonly<Record<EquipQuality, readonly EquipTemplate[]>>>> = {
  // ─ 武器（WEAPON.baseStat → 攻击加成）─────────────────────────────────────────────────
  WEAPON: {
    COMMON: [
      { name: '生锈短刃',   baseStatMin:  8, baseStatMax: 12 },                          // 剑·均衡
      { name: '钝铁斧',     baseStatMin: 10, baseStatMax: 14, implicit: IMPLICIT_WEAPON_AXE   }, // 斧·攻/AP+1
      { name: '木矛',       baseStatMin:  6, baseStatMax: 10, implicit: IMPLICIT_WEAPON_SPEAR }, // 矛·射程+1
    ],
    FINE: [
      { name: '铁制长剑',   baseStatMin: 17, baseStatMax: 23 },
      { name: '铁战斧',     baseStatMin: 21, baseStatMax: 27, implicit: IMPLICIT_WEAPON_AXE   },
      { name: '铁制长矛',   baseStatMin: 14, baseStatMax: 20, implicit: IMPLICIT_WEAPON_SPEAR },
    ],
    RARE: [
      { name: '精钢剑',     baseStatMin: 26, baseStatMax: 34 },
      { name: '钢铁战斧',   baseStatMin: 32, baseStatMax: 40, implicit: IMPLICIT_WEAPON_AXE   },
      { name: '精钢长枪',   baseStatMin: 22, baseStatMax: 30, implicit: IMPLICIT_WEAPON_SPEAR },
    ],
    EPIC: [
      { name: '英雄之刃',   baseStatMin: 43, baseStatMax: 53 },
      { name: '战场阔剑',   baseStatMin: 44, baseStatMax: 54 },
      { name: '英雄战斧',   baseStatMin: 49, baseStatMax: 59, implicit: IMPLICIT_WEAPON_AXE   },
      { name: '烈焰巨斧',   baseStatMin: 51, baseStatMax: 61, implicit: IMPLICIT_WEAPON_AXE   },
      { name: '英雄长枪',   baseStatMin: 38, baseStatMax: 48, implicit: IMPLICIT_WEAPON_SPEAR },
    ],
    LEGENDARY: [
      { name: '命运之刃',   baseStatMin: 72, baseStatMax: 82, legendaryId: 'leg_fate_blade' },
      { name: '噬魂战斧',   baseStatMin: 80, baseStatMax: 90, implicit: IMPLICIT_WEAPON_AXE,   legendaryId: 'leg_soul_axe'  },
      { name: '贯日长弓',   baseStatMin: 64, baseStatMax: 74, implicit: IMPLICIT_WEAPON_SPEAR, legendaryId: 'leg_sun_bow'   },
    ],
  },

  // ─ 护甲（ARMOR.baseStat → 受伤减伤）─────────────────────────────────────────────────
  ARMOR: {
    COMMON: [
      { name: '皮革轻甲',   baseStatMin:  8, baseStatMax: 12 },                          // 锁甲·均衡
      { name: '铁制板甲',   baseStatMin: 11, baseStatMax: 15, implicit: IMPLICIT_ARMOR_PLATE  }, // 板甲·高防/移AP+1
      { name: '棉布软甲',   baseStatMin:  6, baseStatMax: 10 },                          // 轻甲·低防/无惩罚
    ],
    FINE: [
      { name: '铁制锁甲',   baseStatMin: 17, baseStatMax: 23 },
      { name: '钢制板甲',   baseStatMin: 22, baseStatMax: 28, implicit: IMPLICIT_ARMOR_PLATE  },
      { name: '皮质轻甲',   baseStatMin: 14, baseStatMax: 20 },
    ],
    RARE: [
      { name: '精钢锁甲',   baseStatMin: 26, baseStatMax: 34 },
      { name: '精钢板甲',   baseStatMin: 32, baseStatMax: 40, implicit: IMPLICIT_ARMOR_PLATE  },
      { name: '精制轻甲',   baseStatMin: 22, baseStatMax: 28 },
    ],
    EPIC: [
      { name: '英雄铠甲',   baseStatMin: 36, baseStatMax: 44 },
      { name: '蔑视铠甲',   baseStatMin: 37, baseStatMax: 45 },
      { name: '英雄板甲',   baseStatMin: 42, baseStatMax: 50, implicit: IMPLICIT_ARMOR_PLATE  },
      { name: '不朽铁甲',   baseStatMin: 44, baseStatMax: 52, implicit: IMPLICIT_ARMOR_PLATE  },
      { name: '疾风轻甲',   baseStatMin: 30, baseStatMax: 38 },
    ],
    LEGENDARY: [
      { name: '命运铠甲',   baseStatMin: 58, baseStatMax: 68, legendaryId: 'leg_fate_armor'     },
      { name: '永恒板甲',   baseStatMin: 65, baseStatMax: 75, implicit: IMPLICIT_ARMOR_PLATE,  legendaryId: 'leg_eternal_plate' },
      { name: '疾风幻影甲', baseStatMin: 50, baseStatMax: 60, legendaryId: 'leg_phantom_armor'  },
    ],
  },

  // ─ 头盔（HELMET.baseStat → maxHp 加成）──────────────────────────────────────────────
  HELMET: {
    COMMON: [
      { name: '皮革头盔',   baseStatMin: 17, baseStatMax: 23 },                          // 战盔·均衡
      { name: '铁制重盔',   baseStatMin: 21, baseStatMax: 27, implicit: IMPLICIT_HELMET_HEAVY }, // 重盔·高HP/警戒+1
      { name: '布制轻盔',   baseStatMin: 14, baseStatMax: 20 },                          // 轻盔·低HP/无惩罚
    ],
    FINE: [
      { name: '铁制战盔',   baseStatMin: 35, baseStatMax: 45 },
      { name: '钢制重盔',   baseStatMin: 41, baseStatMax: 51, implicit: IMPLICIT_HELMET_HEAVY },
      { name: '皮制轻盔',   baseStatMin: 29, baseStatMax: 39 },
    ],
    RARE: [
      { name: '精钢战盔',   baseStatMin: 53, baseStatMax: 67 },
      { name: '精钢重盔',   baseStatMin: 62, baseStatMax: 76, implicit: IMPLICIT_HELMET_HEAVY },
      { name: '精制轻盔',   baseStatMin: 44, baseStatMax: 58 },
    ],
    EPIC: [
      { name: '英雄头冠',   baseStatMin:  88, baseStatMax: 108 },
      { name: '勇士战冠',   baseStatMin:  90, baseStatMax: 110 },
      { name: '英雄重盔',   baseStatMin: 100, baseStatMax: 120, implicit: IMPLICIT_HELMET_HEAVY },
      { name: '不朽铁盔',   baseStatMin: 104, baseStatMax: 124, implicit: IMPLICIT_HELMET_HEAVY },
      { name: '疾风面甲',   baseStatMin:  75, baseStatMax:  95 },
    ],
    LEGENDARY: [
      { name: '命运王冠',   baseStatMin: 130, baseStatMax: 150, legendaryId: 'leg_fate_crown' },
      { name: '盖世铁冠',   baseStatMin: 145, baseStatMax: 165, implicit: IMPLICIT_HELMET_HEAVY, legendaryId: 'leg_iron_crown' },
      { name: '智慧轻冠',   baseStatMin: 115, baseStatMax: 135, legendaryId: 'leg_sage_crown'  },
    ],
  },

  // ─ 靴子（baseStat 控制档位阈值：≥2 揭示+1 / ≥3 首步免费 / ≥4 潜行-aggroRadius）────
  SHOES: {
    COMMON: [
      { name: '布靴',       baseStatMin: 1, baseStatMax: 1 },
      { name: '皮靴',       baseStatMin: 1, baseStatMax: 1 },
      { name: '沙地靴',     baseStatMin: 1, baseStatMax: 1 },
    ],
    FINE: [
      { name: '旅行皮靴',   baseStatMin: 1, baseStatMax: 2 }, // 可能达到揭示阈值
      { name: '轻便皮靴',   baseStatMin: 2, baseStatMax: 2 }, // 稳定揭示
      { name: '铁制战靴',   baseStatMin: 2, baseStatMax: 2 },
    ],
    RARE: [
      { name: '猎手软靴',   baseStatMin: 2, baseStatMax: 3 }, // 可能首步免费
      { name: '精制战靴',   baseStatMin: 3, baseStatMax: 3 }, // 稳定首步免费
      { name: '精钢铁靴',   baseStatMin: 2, baseStatMax: 3 },
    ],
    EPIC: [
      { name: '英雄战靴',   baseStatMin: 3, baseStatMax: 4 }, // 可能潜行
      { name: '游侠软靴',   baseStatMin: 3, baseStatMax: 4 },
      { name: '隐足战靴',   baseStatMin: 4, baseStatMax: 4 }, // 稳定潜行
      { name: '猎风铁靴',   baseStatMin: 3, baseStatMax: 4 },
      { name: '疾行套靴',   baseStatMin: 4, baseStatMax: 4 },
    ],
    LEGENDARY: [
      { name: '疾风之靴',   baseStatMin: 4, baseStatMax: 5, legendaryId: 'leg_gale_boots'    },
      { name: '飞燕步履',   baseStatMin: 5, baseStatMax: 5, legendaryId: 'leg_swallow_steps' },
      { name: '影踪战靴',   baseStatMin: 4, baseStatMax: 5, legendaryId: 'leg_shadow_boots'  },
    ],
  },

  // ─ 饰品（TRINKET.baseStat → 灵气获取量 +N%）─────────────────────────────────────────
  TRINKET: {
    COMMON: [
      { name: '幸运铜币',   baseStatMin:  3, baseStatMax:  7 },
      { name: '灵力宝珠',   baseStatMin:  3, baseStatMax:  7 },
      { name: '财运符',     baseStatMin:  3, baseStatMax:  7, implicit: IMPLICIT_TRINKET_GOLD }, // Phase 4 金币加成
    ],
    FINE: [
      { name: '聚灵碧玉',   baseStatMin:  7, baseStatMax: 13 },
      { name: '财运挂件',   baseStatMin:  7, baseStatMax: 13, implicit: IMPLICIT_TRINKET_GOLD },
      { name: '幸运吊坠',   baseStatMin:  7, baseStatMax: 13 },
    ],
    RARE: [
      { name: '聚财宝石',   baseStatMin: 12, baseStatMax: 18 },
      { name: '灵魂宝珠',   baseStatMin: 12, baseStatMax: 18 },
      { name: '财运宝玉',   baseStatMin: 12, baseStatMax: 18, implicit: IMPLICIT_TRINKET_GOLD },
    ],
    EPIC: [
      { name: '英雄徽章',   baseStatMin: 17, baseStatMax: 24 },
      { name: '幸运宝典',   baseStatMin: 17, baseStatMax: 24 },
      { name: '财神徽章',   baseStatMin: 17, baseStatMax: 24, implicit: IMPLICIT_TRINKET_GOLD },
      { name: '幸运圆盘',   baseStatMin: 17, baseStatMax: 24 },
      { name: '命运碎晶',   baseStatMin: 17, baseStatMax: 24 },
    ],
    LEGENDARY: [
      { name: '命运护符',   baseStatMin: 27, baseStatMax: 35, legendaryId: 'leg_fate_amulet'      },
      { name: '财神赐福',   baseStatMin: 27, baseStatMax: 35, implicit: IMPLICIT_TRINKET_GOLD, legendaryId: 'leg_fortune_blessing' },
      { name: '幸运女神眼', baseStatMin: 27, baseStatMax: 35, legendaryId: 'leg_lucky_eye'         },
    ],
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
 * 装备词条池（铁匠洗炼用，design §3 铁匠 / Phase 2 AC-EQ-4/5）。
 * Phase 1 保留 id 占位；Phase 2 再扩展词条池与条件触发效果。
 */
export const EQUIP_TRAIT_POOL: readonly string[] = [
  'equip_atk_up',   // 攻击 +10
  'equip_def_up',   // 防御 +10
  'equip_hp_up',    // 最大 HP +20
  'equip_crit_up',  // 暴击率 +5%（Phase 2 实现）
  'equip_gold_up',  // 拾取金币 +10%（Phase 2 实现）
  'equip_swift',    // 移动消耗 -1 AP（Phase 2 实现）
];

/**
 * 生成指定槽位与品质的装备实例（AC-EQ-1/2/3）：
 *   1. 从基础装备池随机选款（等概率）
 *   2. 在该款 [min, max] 区间内随机 roll baseStat
 *   3. 应用章节数值缩放（getBalancedEquipmentBaseStat）
 *   4. 携带 baseStatMax（原始区间上限，UI 展示「当前/上限」）与 implicit
 */
export function rollEquipment(
  rng: Rng,
  slot: EquipSlot,
  quality: EquipQuality,
  chapter = 1,
  balanceSnapshot?: PveBalanceSnapshot | null,
  /** 可选职业 id：LEGENDARY 品质时偏向该职业的传奇装备（Phase 4 偏向掉落）。 */
  classId?: string,
): EquipItem {
  const templates = EQUIPMENT_POOL[slot][quality];

  // LEGENDARY 品质：按职业偏向筛选候选模板，其余品质等概率选取
  let tpl: EquipTemplate;
  if (quality === 'LEGENDARY' && classId) {
    const biasedIds = getLegendaryIdsByClass(slot, classId);
    const biased = templates.filter((t) => t.legendaryId && biasedIds.includes(t.legendaryId));
    tpl = rng.pick(biased.length > 0 ? biased : templates);
  } else {
    tpl = rng.pick(templates);
  }

  const rolledStat = rng.int(tpl.baseStatMin, tpl.baseStatMax);
  const uid = rng.int(10000, 99999);

  const scaledStat = getBalancedEquipmentBaseStat(balanceSnapshot, chapter, slot, rolledStat);
  const scaledMax  = getBalancedEquipmentBaseStat(balanceSnapshot, chapter, slot, tpl.baseStatMax);

  // 蓝1/紫2/橙2 条件触发词条（AC-EQ-4/5）；白绿 rollAffixes 返回 []
  const affixes = rollAffixes(rng, quality);

  return {
    id: `equip_${slot.toLowerCase()}_${quality.toLowerCase()}_${uid}`,
    slot,
    quality,
    name: tpl.name,
    baseStat: scaledStat,
    baseStatMax: scaledMax,
    ...(tpl.implicit ? { implicit: tpl.implicit } : {}),
    ...(affixes.length > 0 ? { affixes } : {}),
    ...(tpl.legendaryId ? { legendaryId: tpl.legendaryId } : {}),
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

export { EQUIPMENT_POOL, EQUIP_SLOTS };
