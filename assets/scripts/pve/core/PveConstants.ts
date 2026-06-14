// PVE「命运远征」数值常量（客户端权威单一来源）。
// 修改本文件的玩法数值时必须同步 specs/260608-pve-destiny-expedition/design.md（见 .cursor/rules/pve-module.mdc）。
// 不用 enum：统一 as const + 字面量联合类型。

// ── AP 行动点（design §4） ─────────────────────────────
export const AP_BASE = 8;
export const DICE_MIN = 1;
export const DICE_MAX = 6;

export const AP_COST = {
  MOVE: 2, // 移动 1 格
  ATTACK: 3, // 普通攻击（再调高为 3 进一步限制每回合攻击次数，强化资源决策）
  OPEN_CHEST: 1, // 开启宝箱
  OPEN_EXIT: 1, // 开启出口门
  USE_IDOL: 1, // 使用神像
  USE_HOT_SPRING: 1, // 使用温泉
  USE_ALTAR: 1, // 使用祭坛（铁匠不在此表：铁匠只收金币，不消耗 AP）
} as const;

// ── 中立交互实体效果（M1 占位数值，待与设计师对齐回写 design.md） ──
export const IDOL_MAX_HP_BONUS = 10; // 神像祝福：永久 +10 maxHp（数值×10基准下 = 原 +1）
export const HOT_SPRING_HEAL_RATIO = 1.0; // 温泉：当次将 HP 回满（1.0=full heal）

// ── 地图尺寸（design §3 / §5） ─────────────────────────
export const MAP_SIZE = {
  NORMAL: 8, // 8×8 普通层
  HIGH: 9, // 9×9 高层
  BOSS: 10, // 10×10 Boss 层
} as const;

// ── 章节结构（design §3） ──────────────────────────────
export const FLOORS_PER_CHAPTER = 5;
export const TOTAL_CHAPTERS = 5;
export const TOTAL_FLOORS = FLOORS_PER_CHAPTER * TOTAL_CHAPTERS; // 25

export const CHAPTER_BOSS = {
  1: 'GOBLIN_CHIEF',
  2: 'SANDWORM_QUEEN',
  3: 'FROST_GIANT',
  4: 'LAVA_LORD',
  5: 'FATE_GUARDIAN',
} as const;

// ── 玩家初始状态 ───────────────────────────────────────
export const INITIAL_HP = 200; // ×10 基准（原 20）
export const INITIAL_GOLD = 0;
export const INITIAL_ANIMA = 0;
export const INITIAL_CLASS = 'ADVENTURER';

// ── 迷雾揭示半径（曼哈顿距离，design §5） ───────────────
export const FOG_REVEAL_RADIUS = 1;

// ── 职业（design §8） ──────────────────────────────────
// attackBonus / attackRangeBonus / moveBonus / 进阶即时代价
export const CLASS_STATS = {
  ADVENTURER: { attackBonus: 0, attackRangeBonus: 0, moveBonus: 0, hpCost: 0 },
  BERSERKER: { attackBonus: 15, attackRangeBonus: 0, moveBonus: 0, hpCost: 0 }, // hpCost=0：进阶代价改为动态扣当前 HP 一半（ClassSystem 计算）
  ARCHER: { attackBonus: 5, attackRangeBonus: 2, moveBonus: 0, hpCost: 0 },
  ROGUE: { attackBonus: 10, attackRangeBonus: 0, moveBonus: 1, hpCost: 0 },
} as const;

export const CLASS_FRAGMENTS_TO_ADVANCE = 5; // 集齐 5 个同职业碎片可进阶（V2 节奏调整：第一章 Boss 前裸随机上限为 3，需命运树 B3 / 精英碎片对掉落补足）

// ── 灵气（design §9） ──────────────────────────────────
export const ANIMA_PER_STRENGTHEN = 100; // 初始强化阈值
export const ANIMA_THRESHOLD_MULTIPLIER = 1.5; // 每次触发后阈值 × 此系数（100→150→225→337...）
export const STRENGTHEN_CHOICES = 3; // 3 选 1

// ── 战斗基础值（M1：冒险者无武器基础攻击；装备后叠加） ──
export const BASE_ATTACK = 10; // M1 冒险者基础普攻（×10 基准，原 1；后续由装备/职业调整）
export const BASE_ATTACK_RANGE = 1; // 曼哈顿距离 1（相邻）

// ── 怪物（design §6） ──────────────────────────────────
export const MONSTER_BASE = {
  NORMAL: { hp: 40, attack: 10, range: 1, aggroRadius: 3 },
  ANIMA: { hp: 30, attack: 0, range: 0, aggroRadius: 6 }, // 6 格感知：比普通怪更早察觉玩家并开始逃跑
  ELITE: { hp: 80, attack: 20, range: 1, aggroRadius: 4 },
  BOSS: { hp: 300, attack: 30, range: 1, aggroRadius: 99 },
} as const;

// 普通怪掉落（design §6）：概率与发放量
export const NORMAL_MONSTER_DROP = {
  GOLD_ONLY: 0.5,
  ANIMA_ONLY: 0.25,
  GOLD_AND_ANIMA: 0.25,
  /** 额外独立判定：极低概率掉落 COMMON 装备（design §11.3）。 */
  EQUIP_CHANCE: 0.03,
  goldSmall: [5, 12] as const,
  animaSmall: [10, 25] as const,
} as const;

// ── 死亡结算保留/清空（design §2.1） ───────────────────
export const DEATH_KEEP = ['achievements', 'codex', 'diamond', 'destinyShards'] as const;
export const DEATH_CLEAR = ['equipment', 'classId', 'classTraits', 'gold', 'anima'] as const;

// ── 类型 ───────────────────────────────────────────────
export type ClassId = keyof typeof CLASS_STATS;
export type BossId = (typeof CHAPTER_BOSS)[keyof typeof CHAPTER_BOSS];

// ── M2 怪物数量（每普通层，design §6 AC-18）──────────────
export const ANIMA_MONSTER_COUNT = 1; // 灵气怪：逃跑，100% 大量灵气
export const ELITE_MONSTER_COUNT = 1; // 精英怪：巡逻→追击，掉落更好

// ── M2 职业碎片（每普通层，design §8 AC-15）──────────────
export const FRAGMENT_COUNT = 2; // 每普通层生成 2 个职业碎片

/** 可进阶的职业列表（ADVENTURER 是初始职业，不作为进阶目标）。 */
export const ADVANCABLE_CLASSES = ['BERSERKER', 'ARCHER', 'ROGUE'] as const;
export type AdvancableClass = (typeof ADVANCABLE_CLASSES)[number];

// ── 二阶进阶/觉醒（V2 §七）──────────────────────────────
/** 觉醒所需本职业碎片数（远高于一阶进阶阈值，对应"差一点"后的长线追逐）。 */
export const CLASS_FRAGMENTS_TO_AWAKEN = 10;
/** 觉醒所需"另外两个职业碎片合计"数（取奇数，保证两者必有高低，决定觉醒形态）。 */
export const AWAKEN_SECONDARY_TOTAL = 7;
/** 觉醒额外门槛：需击败第三章 Boss（FROST_GIANT）。 */
export const AWAKEN_REQUIRED_CHAPTER = 3;

/** 觉醒形态 id：职业 + 形态序号（1/2，由副职业碎片对比决定）。 */
export type AwakenForm = 'BERSERKER_1' | 'BERSERKER_2' | 'ARCHER_1' | 'ARCHER_2' | 'ROGUE_1' | 'ROGUE_2';

/** 觉醒形态定义：statTrait 为轻量属性加成（复用现有通用词条 A），traitId/traitName/traitDesc 为专属觉醒词条（B）。 */
export interface AwakenFormDef {
  id: AwakenForm;
  classId: AdvancableClass;
  /** 中文形态名（界面展示，不含英文）。 */
  name: string;
  /** 轻量属性加成：复用现有通用词条 id。 */
  statTrait: string;
  /** 专属觉醒词条 id（CombatSystem 内联判断）。 */
  traitId: string;
  /** 专属觉醒词条中文名。 */
  traitName: string;
  /** 专属觉醒词条中文描述。 */
  traitDesc: string;
}

export const AWAKEN_FORMS: Record<AwakenForm, AwakenFormDef> = {
  BERSERKER_1: {
    id: 'BERSERKER_1',
    classId: 'BERSERKER',
    name: '狂战士·破阵型',
    statTrait: 'eagle_eye', // 轻量A：攻击范围 +1
    traitId: 'awakened_cleave',
    traitName: '横扫',
    traitDesc: '攻击命中后，对目标周围的相邻怪物造成50%溅射伤害',
  },
  BERSERKER_2: {
    id: 'BERSERKER_2',
    classId: 'BERSERKER',
    name: '狂战士·嗜杀型',
    statTrait: 'swift', // 轻量A：移动消耗 -1 AP
    traitId: 'awakened_frenzy',
    traitName: '狂热',
    traitDesc: '击杀目标后，下一次攻击必定暴击并额外回复20点HP',
  },
  ARCHER_1: {
    id: 'ARCHER_1',
    classId: 'ARCHER',
    name: '射手·强击型',
    statTrait: 'strengthen_attack_up', // 轻量A：攻击 +5
    traitId: 'awakened_power_shot',
    traitName: '强弓',
    traitDesc: '基础伤害额外提升15点',
  },
  ARCHER_2: {
    id: 'ARCHER_2',
    classId: 'ARCHER',
    name: '射手·游击型',
    statTrait: 'swift', // 轻量A：移动消耗 -1 AP
    traitId: 'awakened_volley',
    traitName: '连珠',
    traitDesc: '连射概率提升至60%，且连射命中后有30%概率触发连锁射击',
  },
  ROGUE_1: {
    id: 'ROGUE_1',
    classId: 'ROGUE',
    name: '隐匿者·屠戮型',
    statTrait: 'strengthen_attack_up', // 轻量A：攻击 +5
    traitId: 'awakened_execute',
    traitName: '处决',
    traitDesc: '目标HP低于30%时直接处决，背刺伤害提升至3倍',
  },
  ROGUE_2: {
    id: 'ROGUE_2',
    classId: 'ROGUE',
    name: '隐匿者·影袭型',
    statTrait: 'eagle_eye', // 轻量A：攻击范围 +1
    traitId: 'awakened_shadow_strike',
    traitName: '影袭',
    traitDesc: '每回合可触发2次背刺伤害',
  },
};

/**
 * 觉醒形态判定：副职业（另外两个职业）碎片数较多者决定形态。
 * 数组 [classA, classB]：classA 碎片数 > classB → 形态一；否则（含相等，理论上因 AWAKEN_SECONDARY_TOTAL 为奇数不会发生）→ 形态二。
 * 形态主题对应：BERSERKER ←→ ARCHER（远程/范围）/ ROGUE（机动）；ARCHER ←→ BERSERKER（输出）/ ROGUE（机动）；ROGUE ←→ BERSERKER（输出）/ ARCHER（范围）。
 */
export const AWAKEN_SECONDARY_ORDER: Record<AdvancableClass, [AdvancableClass, AdvancableClass]> = {
  BERSERKER: ['ARCHER', 'ROGUE'],
  ARCHER: ['BERSERKER', 'ROGUE'],
  ROGUE: ['BERSERKER', 'ARCHER'],
};

// ── M2 灵气怪掉落 ─────────────────────────────────────────
export const ANIMA_MONSTER_DROP = {
  animaLarge: [40, 60] as const, // 100% 大量灵气
} as const;

// ── M2 精英怪掉落（design §6：40/30/15/10/5%）──────────────
export const ELITE_MONSTER_DROP = {
  GOLD_ONLY: 0.40,
  GOLD_AND_ANIMA: 0.30,
  GOLD_HIGH: 0.15,     // 大量金币（40+30+15=85%）
  EQUIP: 0.10,         // 装备（40+30+15+10=95%）
  FRAGMENT_PAIR: 0.05, // 职业碎片对（V2）：随机 2 个不同职业各 +1 碎片（40+30+15+10+5=100%）
  goldMid: [15, 30] as const,
  goldHigh: [35, 60] as const,
  animaMid: [20, 40] as const,
} as const;

// ── Boss 专属机制常量（design §11b）─────────────────────────
/** 沙虫女王：每隔多少回合潜地一次。 */
export const SANDWORM_BURROW_INTERVAL = 4;
/** 沙虫女王：每次潜地在周边动态生成的沙坑数（流沙扩张，反风筝）。 */
export const SANDWORM_DYNAMIC_PIT_PER_BURROW = 2;
/** 沙虫女王：动态沙坑存续回合数（remaining，到 0 自动移除；静态沙坑无此值，永久）。 */
export const SANDWORM_DYNAMIC_PIT_DURATION = 5;
/** 冰霜巨人：每隔多少回合铺一次冰面（复用原冰冻间隔）。 */
export const FROST_GIANT_FREEZE_INTERVAL = 4;
/** 冰霜巨人：冰面以玩家为中心铺开的曼哈顿半径（1 → 「+」字 5 格）。 */
export const FROST_GIANT_ICE_RADIUS = 1;
/** 冰霜巨人：冰面存续回合数（remaining 倒计时融化）。 */
export const FROST_GIANT_ICE_DURATION = 2;
/** 熔岩领主：每次攻击附加灼烧 tick 数（每 tick = 10 HP，每回合消耗 1 tick）。 */
export const LAVA_LORD_BURN_TICKS = 3;
/** 命运守卫：玩家 HP 占 maxHp 比例大于此值时守卫伤害 × 2。 */
export const FATE_GUARDIAN_HP_THRESHOLD = 0.5;
/** 命运守卫：每隔多少回合标记一次命运预言（下个 Boss 回合该区域爆炸）。 */
export const FATE_PROPHECY_INTERVAL = 3;
/** 命运守卫：预言爆炸范围（Chebyshev 半径，1 → 3×3）。 */
export const FATE_PROPHECY_RADIUS = 1;
/** 命运守卫：预言爆炸伤害 = boss.attack × 该系数（取整）。 */
export const FATE_PROPHECY_DAMAGE_MULT = 1.0;

// ── 祭坛灵气奖励范围（design §3 中性区域）────────────────────
/** 祭坛：每次使用随机获得灵气的最小值。 */
export const ALTAR_ANIMA_MIN = 20;
/** 祭坛：每次使用随机获得灵气的最大值。 */
export const ALTAR_ANIMA_MAX = 35;

// ── 铁匠服务费用（design §3 中性区域）────────────────────────
/** 铁匠强化：+1 基础属性所需金币（WEAPON/ARMOR/HELMET 实际强化量为 +10，SHOES/TRINKET 为 +1，详见 NeutralEntities.upgradeEquip）。 */
export const BLACKSMITH_UPGRADE_COST = 20;
/** 铁匠洗炼：重新随机词条所需金币。 */
export const BLACKSMITH_REROLL_COST = 30;

// ── 第 2-5 章 Boss 专属机制常量（260613 内容深化）──────────
/** 第2章 SandwormQueen Boss 房静态沙坑数量（开房时刷，永久；钻地优先出沙坑位）。 */
export const CHAPTER2_SAND_PIT_COUNT = 5;
/** 沙坑移动 AP 额外消耗（叠加在基础 MOVE 上；静态/动态沙坑共用）。 */
export const CHAPTER2_SAND_PIT_MOVE_PENALTY = 2;
/** 第3章 FrostGiant Boss 房冰墙数量。 */
export const CHAPTER3_ICE_WALL_COUNT = 3;
/** 冰墙 HP（玩家可攻击破坏，HP=0 时消失并掉灵气）。 */
export const CHAPTER3_ICE_WALL_HP = 10;
/** 冰墙破坏时掉落灵气。 */
export const CHAPTER3_ICE_WALL_DROP_ANIMA = 1;
/** 第4章 LavaLord 熔岩潮汐周期（Boss 回合数）。 */
export const CHAPTER4_LAVA_TIDE_INTERVAL = 3;
/** 每次潮汐刷出的熔岩地块数（2026-06-14 由 3 → 6，加大安全区压缩）。 */
export const CHAPTER4_LAVA_TIDE_TILE_COUNT = 6;
/** 熔岩地块持续回合数。 */
export const CHAPTER4_LAVA_TIDE_DURATION = 2;
/** 玩家踩入熔岩地块的伤害（每回合开始结算）。 */
export const CHAPTER4_LAVA_TILE_DAMAGE = 5;
/** LavaLord phase2 触发的 HP 比例阈值。 */
export const CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO = 0.5;
/** 第5章 FateGuardian 镜像分身触发 HP 比例阈值。 */
export const CHAPTER5_MIRROR_SPAWN_HP_RATIO = 0.33;
/** 命运镜像 HP。 */
export const CHAPTER5_MIRROR_HP = 20;
/** 命运镜像攻击力 = Boss 攻击 × 该系数。 */
export const CHAPTER5_MIRROR_ATTACK_MULT = 0.5;
/** 命运镜像 bossId（用于 stepBoss 区分镜像与本体）。 */
export const FATE_MIRROR_BOSS_ID = 'FATE_MIRROR';

// ── 第一章专属机制常量 ─────────────────────────────────────
/** 第一章 Boss 房随机石块数量。 */
export const CHAPTER1_BOSS_ROCK_COUNT = 2;
/** 增援号角每次召唤哥布林战士数（非狂暴）。 */
export const HORN_WARRIOR_COUNT = 1;
/** 增援号角每次召唤哥布林战士数（狂暴后）。 */
export const HORN_WARRIOR_ENRAGE_COUNT = 2;
/** 冰霜哥布林冰霜：移动AP+1的持续回合数（可叠加）。 */
export const FROST_MOVE_PENALTY_ROUNDS = 2;
/** 赤炎哥布林灼烧：5HP/回合的持续回合数（可叠加）。 */
export const FIRE_BURN_ROUNDS = 2;
/** 哥布林酋长AOE余波：被击中后移动AP+1的持续回合数。 */
export const HEAVY_AOE_SLOW_ROUNDS = 2;

// ── 命运碎片成长树（destiny tree，design「命运树 V1 数值调整建议」）──
/** A1 坚韧之躯Ⅰ：maxHp/hp +20（×10 基准，原 +2）。 */
export const TREE_A1_HP_BONUS = 20;
/** A2 坚韧之躯Ⅱ：再 +20（与 A1 累计 +40，×10 基准，原 +2）。 */
export const TREE_A2_HP_BONUS = 20;
/** A3 遗产意志：死亡结算保留的金币比例。 */
export const TREE_A3_DEATH_GOLD_RETENTION = 0.2;
/** B1 武者直觉：攻击力加成 +5（×10 基准，原 +0.5）。 */
export const TREE_B1_ATTACK_BONUS = 5;
/** B2 急行军：AP 骰子上限 +1（dice 范围 [1,6]→[1,7]）。 */
export const TREE_B2_AP_DICE_BONUS = 1;
/** B3 职业先驱：远征开始时随机一个可进阶职业的碎片 +1。 */
export const TREE_B3_FRAGMENT_BONUS = 1;
/** C1 财富眼光：开局金币加成（原 +8 感知过弱，调整为 +12）。 */
export const TREE_C1_GOLD_BONUS = 12;
/** C2 宝箱老手：开宝箱额外获得的金币比例（原"金币下限+1"调整为"额外+20%金币"）。 */
export const TREE_C2_CHEST_GOLD_BONUS_PCT = 0.2;
/** C3 铁匠熟客：铁匠强化费用减免（20→15）。 */
export const TREE_C3_BLACKSMITH_DISCOUNT = 5;
/** D1 灵感涌现：开局灵气 +25。 */
export const TREE_D1_ANIMA_BONUS = 25;
/** D2 悟道加速：强化阈值整体 ×0.9（100→90，150→135...）。 */
export const TREE_D2_THRESHOLD_MULT = 0.9;
/** D3 灵脉共鸣：灵气获取额外 +10%。 */
export const TREE_D3_ANIMA_GAIN_PCT = 0.1;
/** E1 誓石意志：maxHp/hp +40（×10 基准，原 +4）。 */
export const TREE_E1_HP_BONUS = 40;

/** 命运树节点定义：column 内按 order 顺序解锁（需先解锁 order-1 的节点）。 */
export interface DestinyTreeNodeDef {
  id: string;
  column: 'A' | 'B' | 'C' | 'D' | 'E';
  order: 1 | 2 | 3;
  name: string;
  cost: number;
  /** 节点效果简述，常驻显示在命运树面板节点格内（specs/game-design/命运树设计V1.md §三）。 */
  desc: string;
}

export const DESTINY_TREE_NODES: readonly DestinyTreeNodeDef[] = [
  { id: 'A1', column: 'A', order: 1, name: '坚韧之躯Ⅰ', cost: 15, desc: '生命上限+20' },
  { id: 'A2', column: 'A', order: 2, name: '坚韧之躯Ⅱ', cost: 25, desc: '生命上限再+20' },
  { id: 'A3', column: 'A', order: 3, name: '遗产意志', cost: 30, desc: '死亡保留20%金币' },
  { id: 'B1', column: 'B', order: 1, name: '武者直觉', cost: 20, desc: '攻击力+5' },
  { id: 'B2', column: 'B', order: 2, name: '急行军', cost: 25, desc: 'AP骰子上限+1' },
  { id: 'B3', column: 'B', order: 3, name: '职业先驱', cost: 30, desc: '开局职业碎片+1' },
  { id: 'C1', column: 'C', order: 1, name: '财富眼光', cost: 15, desc: '开局金币+12' },
  { id: 'C2', column: 'C', order: 2, name: '宝箱老手', cost: 20, desc: '宝箱金币+20%' },
  { id: 'C3', column: 'C', order: 3, name: '铁匠熟客', cost: 25, desc: '强化费用-5' },
  { id: 'D1', column: 'D', order: 1, name: '灵感涌现', cost: 15, desc: '开局灵气+25' },
  { id: 'D2', column: 'D', order: 2, name: '悟道加速', cost: 25, desc: '强化阈值×0.9' },
  { id: 'D3', column: 'D', order: 3, name: '灵脉共鸣', cost: 30, desc: '灵气获取+10%' },
  { id: 'E1', column: 'E', order: 1, name: '誓石意志', cost: 20, desc: '生命上限+40' },
  { id: 'E2', column: 'E', order: 2, name: '命运馈赠', cost: 30, desc: '开局三选一装备' },
  { id: 'E3', column: 'E', order: 3, name: '命运护佑', cost: 40, desc: '开局三选一词条' },
] as const;

// ── 仅开发调试（正式构建前必须置 0）────────────────────────
/**
 * 自动跳至目标层（0 = 关闭）。
 * 将此值改为非零整数（例如 5）后重新构建，开局将直接跳到该层。
 * ⚠️ 正式构建 / 提测前必须改回 0！
 */
export const DEV_SKIP_TO_FLOOR = 0;

/** 第 floor 层（1-based）所属章节（1-based）。 */
export function chapterOfFloor(floor: number): number {
  return Math.floor((floor - 1) / FLOORS_PER_CHAPTER) + 1;
}

/** 第 floor 层是否为章节 Boss 层（每章第 5 层）。 */
export function isBossFloor(floor: number): boolean {
  return floor % FLOORS_PER_CHAPTER === 0;
}

/** 第 floor 层地图边长。 */
export function mapSizeOfFloor(floor: number): number {
  if (isBossFloor(floor)) return MAP_SIZE.BOSS;
  return chapterOfFloor(floor) >= 3 ? MAP_SIZE.HIGH : MAP_SIZE.NORMAL;
}

/** 按章节返回普通/精英/灵气怪属性倍率（HP / 攻击），chapter 1-5，章节外夹紧到边界。 */
export function chapterScaling(chapter: number): { hpMult: number; attackMult: number } {
  const SCALING = [
    { hpMult: 1.0, attackMult: 1.0 },
    { hpMult: 1.4, attackMult: 1.4 },
    { hpMult: 2.0, attackMult: 2.0 },
    { hpMult: 2.8, attackMult: 2.8 },
    { hpMult: 3.8, attackMult: 3.8 },
  ] as const;
  const idx = Math.max(0, Math.min(chapter - 1, SCALING.length - 1));
  return SCALING[idx];
}

/** 按章节返回 Boss 专属属性倍率（HP / 攻击），chapter 1-5，章节外夹紧到边界。 */
export function bossChapterScaling(chapter: number): { hpMult: number; attackMult: number } {
  const SCALING = [
    { hpMult: 1.5, attackMult: 1.5 },
    { hpMult: 2.2, attackMult: 2.2 },
    { hpMult: 3.0, attackMult: 3.0 },
    { hpMult: 3.8, attackMult: 3.8 },
    { hpMult: 4.5, attackMult: 4.5 },
  ] as const;
  const idx = Math.max(0, Math.min(chapter - 1, SCALING.length - 1));
  return SCALING[idx];
}
