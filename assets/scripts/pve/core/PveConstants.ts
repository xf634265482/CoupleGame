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

// AP 结转：回合结束时未用完的 AP，按 min(剩余, AP_CARRY_CAP) 结转到下一回合上限。
// 上限取 3（恰好够凑一次 ATTACK 的"零头"），避免无限攒 AP 打破"每回合行动次数受限"的资源设计。
export const AP_CARRY_CAP = 3;

// ── 中立交互实体效果（M1 占位数值，待与设计师对齐回写 design.md） ──
export const IDOL_MAX_HP_BONUS = 10;    // 神像祝福：永久 +10 maxHp
export const IDOL_ATTACK_BONUS = 2;     // 神像祝福：永久 +2 攻击
export const IDOL_ARMOR_BONUS = 3;      // 神像祝福：永久 +3 护甲（减少怪物对玩家的伤害）
export const HOT_SPRING_HEAL_RATIO = 0.5; // 温泉：恢复 maxHp 的 50%

// ── 地图尺寸（design §3 / §5） ─────────────────────────
export const MAP_SIZE = {
  NORMAL: 8, // 8×8 普通层
  HIGH: 9, // 9×9 高层
  BOSS: 10, // 10×10 Boss 层
} as const;

// ── 章节结构（design §3） ──────────────────────────────
export const FLOORS_PER_CHAPTER = 7;
export const TOTAL_CHAPTERS = 5;
export const TOTAL_FLOORS = FLOORS_PER_CHAPTER * TOTAL_CHAPTERS; // 35

export const CHAPTER_BOSS = {
  1: 'GOBLIN_CHIEF',
  2: 'QUICKSAND_SCORPION',
  3: 'FROST_GIANT',
  4: 'LAVA_LORD',
  5: 'FATE_GUARDIAN',
} as const;

// ── 玩家初始状态 ───────────────────────────────────────
export const INITIAL_HP = 280; // V3 §4b.2：上调基础 HP（原 230），新手缓冲
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

export const CLASS_FRAGMENTS_TO_ADVANCE = 7; // 集齐 7 个同职业碎片可进阶（V3：目标进阶落点第 8-10 层）

// ── 灵气（design §9） ──────────────────────────────────
export const ANIMA_PER_STRENGTHEN = 100; // 初始强化阈值
export const ANIMA_THRESHOLD_MULTIPLIER = 1.35; // 每次触发后阈值 × 此系数（V3 §4b.1：1.5→1.35，延缓后期断供）
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
  goldSmall: [5, 12] as const,
  animaSmall: [10, 25] as const,
} as const;

// ── 装备掉落表（Phase 4，单次掷骰 + 章节封顶，design §5）──────────
// 每项为 [ch1, ch2, ch3, ch4, ch5] 概率；判定顺序 LEGENDARY→EPIC→RARE→FINE→COMMON；其余=不掉装备。
// 橙（传奇）从第 3 章起（ch3 开始非零）。

export const NORMAL_MONSTER_EQUIP_DROP_TABLE = {
  LEGENDARY: [0,     0,     0.002, 0.004, 0.006] as const,
  EPIC:      [0,     0,     0.01,  0.015, 0.02 ] as const,
  RARE:      [0,     0.02,  0.03,  0.03,  0.03 ] as const,
  FINE:      [0.03,  0.04,  0.04,  0.04,  0.04 ] as const,
  COMMON:    [0.06,  0.06,  0.05,  0.04,  0.03 ] as const,
} as const;

export const ELITE_MONSTER_EQUIP_DROP_TABLE = {
  LEGENDARY: [0,     0,     0.005, 0.01,  0.015] as const,
  EPIC:      [0,     0,     0.03,  0.04,  0.04 ] as const,
  RARE:      [0,     0.05,  0.05,  0.05,  0.05 ] as const,
  FINE:      [0.11,  0.08,  0.06,  0.06,  0.06 ] as const,
  COMMON:    [0,     0,     0,     0,     0    ] as const,
} as const;

export const CHEST_EQUIP_DROP_TABLE = {
  LEGENDARY: [0,     0,     0.003, 0.006, 0.006] as const,
  EPIC:      [0,     0,     0.02,  0.03,  0.03 ] as const,
  RARE:      [0,     0.03,  0.04,  0.04,  0.04 ] as const,
  FINE:      [0.04,  0.05,  0.05,  0.05,  0.05 ] as const,
  COMMON:    [0.08,  0.06,  0.05,  0.04,  0.04 ] as const,
} as const;

// ── 死亡结算保留/清空（design §2.1） ───────────────────
export const DEATH_KEEP = ['achievements', 'codex', 'diamond', 'destinyShards'] as const;
export const DEATH_CLEAR = ['equipment', 'classId', 'classTraits', 'gold', 'anima'] as const;

/** 同时最多激活的遗物槽数（Phase 5，AC-EQ-8）。 */
export const RELIC_ACTIVE_SLOTS = 3;

// ── 类型 ───────────────────────────────────────────────
export type ClassId = keyof typeof CLASS_STATS;
export type BossId = (typeof CHAPTER_BOSS)[keyof typeof CHAPTER_BOSS];

// ── M2 怪物数量（每普通层，design §6 AC-18）──────────────
export const ANIMA_MONSTER_COUNT = 1; // 灵气怪：逃跑，100% 大量灵气
export const ELITE_MONSTER_COUNT = 1; // 精英怪：巡逻→追击，掉落更好

// ── 职业碎片产出（V3 §3.1）────────────────────────────────
/** 每普通层保底 1 个碎片（V3：废除固定 2 个，改保底+概率）。 */
export const FRAGMENT_COUNT = 1; // 保底数量（legacy，V3 已切换到概率模型）
/** 第 2 个碎片的追加概率（V3 §3.1 首发值）。 */
export const FRAGMENT_SECOND_CHANCE = 0.70;
/** 第 3 个碎片的追加概率（V3 §3.1 首发值，独立于第 2 个）。 */
export const FRAGMENT_THIRD_CHANCE = 0.25;
/** 进阶后偏向主职业的概率（70%；其余 30% 均分另外两职业，各 15%）。 */
export const FRAGMENT_ADVANCED_BIAS = 0.70;

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

/** 觉醒形态定义：核心天赋、玩法标签与现有美术资源的统一数据源。 */
export interface AwakenFormDef {
  id: AwakenForm;
  classId: AdvancableClass;
  /** 中文形态名（界面展示，不含英文）。 */
  name: string;
  /** 形态玩法标签。 */
  routeTag: string;
  /** 觉醒美术资源 key。 */
  iconKey: string;
  /** 旧版自动附赠词条，仅用于活动存档迁移。 */
  legacyStatTrait: string;
  /** 专属觉醒词条 id（CombatSystem 内联判断）。 */
  traitId: string;
  /** 核心天赋中文名。 */
  coreName: string;
  /** 核心天赋中文描述。 */
  coreDesc: string;
}

export const AWAKEN_FORMS: Record<AwakenForm, AwakenFormDef> = {
  BERSERKER_1: {
    id: 'BERSERKER_1',
    classId: 'BERSERKER',
    name: '狂战士·破阵型',
    routeTag: '范围破阵',
    iconKey: 'pve/class/icon_awaken_berserker_a',
    legacyStatTrait: 'eagle_eye',
    traitId: 'awakened_cleave',
    coreName: '裂阵横扫',
    coreDesc: '主动攻击对相邻敌人造成50%次生伤害；无相邻敌人时主目标伤害+15%',
  },
  BERSERKER_2: {
    id: 'BERSERKER_2',
    classId: 'BERSERKER',
    name: '狂战士·嗜杀型',
    routeTag: '击杀连锁',
    iconKey: 'pve/class/icon_awaken_berserker_b',
    legacyStatTrait: 'swift',
    traitId: 'awakened_frenzy',
    coreName: '杀意沸腾',
    coreDesc: '主动攻击击杀后回复10生命，下一次主动攻击伤害+40%；再次击杀可刷新',
  },
  ARCHER_1: {
    id: 'ARCHER_1',
    classId: 'ARCHER',
    name: '射手·强击型',
    routeTag: '定点狙击',
    iconKey: 'pve/class/icon_awaken_archer_a',
    legacyStatTrait: 'strengthen_attack_up',
    traitId: 'awakened_power_shot',
    coreName: '蓄势强弓',
    coreDesc: '本回合未移动且目标距离至少3格时，首次主动攻击伤害+50%并无视护甲',
  },
  ARCHER_2: {
    id: 'ARCHER_2',
    classId: 'ARCHER',
    name: '射手·游击型',
    routeTag: '移动连射',
    iconKey: 'pve/class/icon_awaken_archer_b',
    legacyStatTrait: 'swift',
    traitId: 'awakened_volley',
    coreName: '疾行连珠',
    coreDesc: '本回合移动后，首次主动攻击必定追加一箭，造成主攻击50%次生伤害',
  },
  ROGUE_1: {
    id: 'ROGUE_1',
    classId: 'ROGUE',
    name: '隐匿者·屠戮型',
    routeTag: '单体斩杀',
    iconKey: 'pve/class/icon_awaken_rogue_a',
    legacyStatTrait: 'strengthen_attack_up',
    traitId: 'awakened_execute',
    coreName: '致命处决',
    coreDesc: '背刺加成提升至+100%；普通/精英低于20%生命时处决，Boss改为伤害+30%',
  },
  ROGUE_2: {
    id: 'ROGUE_2',
    classId: 'ROGUE',
    name: '隐匿者·影袭型',
    routeTag: '连续背刺',
    iconKey: 'pve/class/icon_awaken_rogue_b',
    legacyStatTrait: 'eagle_eye',
    traitId: 'awakened_shadow_strike',
    coreName: '双重影袭',
    coreDesc: '每回合第一次主动移动后获得2层影袭，接下来两次主动攻击获得背刺加成',
  },
};

export function awakenFormsForClass(classId: ClassId): AwakenFormDef[] {
  return Object.values(AWAKEN_FORMS).filter((form) => form.classId === classId);
}

// ── M2 灵气怪掉落 ─────────────────────────────────────────
export const ANIMA_MONSTER_DROP = {
  animaLarge: [40, 60] as const, // 100% 大量灵气
} as const;

// ── M2 精英怪掉落（design §6：40/30/15/10/5%）──────────────
export const ELITE_MONSTER_DROP = {
  GOLD_ONLY: 0.40,
  GOLD_AND_ANIMA: 0.30,
  GOLD_HIGH: 0.25,     // 大量金币（40+30+25=95%）
  FRAGMENT_PAIR: 0.05, // 职业碎片对（40+30+25+5=100%）
  goldMid: [15, 30] as const,
  goldHigh: [35, 60] as const,
  animaMid: [20, 40] as const,
} as const;

// ── Boss 掉落表（design §6 / Boss设计V1）────────────────────
// 三层结构：通用必掉（金币/灵气）+ 专属随机 1 件 + 稀有独立判定（命运碎片/卷轴/遗物）。
// 数值按章节缩放：第 1~5 章倍率 = [1, 1.2, 1.5, 1.8, 2.2]（与 bossChapterScaling 不同，掉落更线性以避免高章节资源过度通胀）。

/** Boss 掉落基础数值（第 1 章基准，按 BOSS_DROP_CHAPTER_MULT 缩放）。 */
export const BOSS_DROP_BASE = {
  /** 通用必掉：金币基础值。 */
  goldBase: 100,
  /** 通用必掉：灵气基础值。 */
  animaBase: 30,
  /** 稀有独立判定：命运碎片基础值（命中 SHARDS_CHANCE 时给）。 */
  shardsBase: 3,
} as const;

/** Boss 掉落数值的章节缩放倍率（1~5 章）。 */
export const BOSS_DROP_CHAPTER_MULT = [1.0, 1.2, 1.5, 1.8, 2.2] as const;

/** Boss 稀有掉落概率（三个独立判定，互不影响）。 */
export const BOSS_RARE_DROP = {
  /** 命运碎片掉落概率。 */
  SHARDS_CHANCE: 0.10,
  /** 命运词条卷轴掉落概率。 */
  SCROLL_CHANCE: 0.20,
  /** Boss 遗物基础掉落概率（图鉴已解锁该遗物时 +RELIC_CODEX_BONUS）。 */
  RELIC_BASE_CHANCE: 0.10,
  /** 图鉴已解锁该遗物时的额外掉落概率加成。 */
  RELIC_CODEX_BONUS: 0.10,
} as const;

/** 营地遗物宝箱（每个营地楼层绑定上一个 Boss 层的章节，只能开出该章节遗物）。 */
export const RELIC_CHEST = {
  /** 单次开箱花费金币（0 = 仅消耗钻石）。 */
  COST_GOLD: 0,
  /** 单次开箱花费钻石。 */
  COST_DIAMOND: 50,
  /** 开箱开出本章遗物的概率（剩余 90% 为「未中」）。 */
  SUCCESS_CHANCE: 0.10,
  /** 开出已持有的遗物时返还资源的比例（避免重复无意义）。 */
  REFUND_PCT: 0.30,
} as const;

/** 每个章节 Boss 对应的遗物 id（营地宝箱按楼层所属章节定位本章遗物）。 */
export const CHAPTER_BOSS_RELIC: Record<number, string> = {
  1: 'CHIEF_ROAR',
  2: 'QUICKSAND_HEART',
  3: 'PERMAFROST_CORE',
  4: 'MAGMA_HEART',
  5: 'FATE_ECHO',
} as const;

/** 按章节返回 Boss 通用掉落数值（金币/灵气/命运碎片）。chapter 1-5，越界夹紧。 */
export function bossDropScaled(chapter: number): { gold: number; anima: number; shards: number } {
  const idx = Math.max(0, Math.min(chapter - 1, BOSS_DROP_CHAPTER_MULT.length - 1));
  const mult = BOSS_DROP_CHAPTER_MULT[idx];
  return {
    gold: Math.round(BOSS_DROP_BASE.goldBase * mult),
    anima: Math.round(BOSS_DROP_BASE.animaBase * mult),
    shards: Math.round(BOSS_DROP_BASE.shardsBase * mult),
  };
}

// ── Boss 专属机制常量（design §11b）─────────────────────────
/** 流沙巨蝎：每隔多少回合潜地一次。 */
export const QUICKSAND_SCORPION_BURROW_INTERVAL = 4;
/** 流沙巨蝎：每次潜地在周边动态生成的沙坑数（流沙扩张，反风筝）。 */
export const QUICKSAND_SCORPION_DYNAMIC_PIT_PER_BURROW = 2;
/** 流沙巨蝎：动态沙坑存续回合数（remaining，到 0 自动移除；静态沙坑无此值，永久）。2026-06-15 由 5→8，潜地间隔(4/3)内多波叠加，营造越打越走不了的压迫感。 */
export const QUICKSAND_SCORPION_DYNAMIC_PIT_DURATION = 8;
/** 流沙巨蝎：HP 占比 ≤ 此值时进入狂暴（潜地间隔缩短、沙暴范围扩大）。 */
export const QUICKSAND_SCORPION_ENRAGE_HP_RATIO = 0.3;
/** 流沙巨蝎：狂暴后潜地间隔（非狂暴见 QUICKSAND_SCORPION_BURROW_INTERVAL=4）。 */
export const QUICKSAND_SCORPION_BURROW_INTERVAL_ENRAGED = 3;
/** 流沙巨蝎：潜地时沙暴随机覆盖格数（非狂暴）。 */
export const QUICKSAND_SCORPION_SANDSTORM_CELLS = 2;
/** 流沙巨蝎：狂暴后沙暴随机覆盖格数。 */
export const QUICKSAND_SCORPION_SANDSTORM_CELLS_ENRAGED = 4;
/** 流沙巨蝎：沙暴命中玩家所在格造成的真实伤害（无视护甲，不受常规攻击 10 点下限限制）。 */
export const QUICKSAND_SCORPION_SANDSTORM_DAMAGE = 1;
/** 冰霜巨人：每隔多少回合铺一次冰面（复用原冰冻间隔）。 */
export const FROST_GIANT_FREEZE_INTERVAL = 4;
/** 冰霜巨人：冰面以玩家为中心铺开的曼哈顿半径（1 → 「+」字 5 格）。 */
export const FROST_GIANT_ICE_RADIUS = 1;
/** 冰霜巨人：冰面存续回合数（remaining 倒计时融化）。 */
export const FROST_GIANT_ICE_DURATION = 2;
/** 冰霜巨人：普通攻击命中玩家叠加 1 层寒气，达到此层数触发冻结并归零。 */
export const FROST_GIANT_CHILL_STACKS_TO_FREEZE = 3;
/** 冰霜巨人：冻结状态下玩家需主动攻击（playerAttack/attackIceWall）多少次才能解除冻结。 */
export const FROST_GIANT_FREEZE_ATTACKS_TO_BREAK = 3;
/** 冰霜巨人：冻结时在玩家周围生成的 FREEZE_WALL 数量（解除时一并移除）。 */
export const FROST_GIANT_FREEZE_WALL_COUNT = 2;
/** 冰霜巨人：每隔多少个怪物回合触发一次冰霜重击（AOE，以 boss 自身为中心）。 */
export const FROST_GIANT_HEAVY_STRIKE_INTERVAL = 3;
/** 冰霜巨人：冰霜重击 AOE 曼哈顿半径（以 boss 自身为中心）。 */
export const FROST_GIANT_HEAVY_STRIKE_RADIUS = 2;
/** 冰霜巨人：冰霜重击命中玩家后沿 boss→玩家方向击退的距离（格）。 */
export const FROST_GIANT_KNOCKBACK_DISTANCE = 1;
/** 冰霜巨人：击退落点为冰面时，滑行结束后额外造成的固定伤害。 */
export const FROST_GIANT_ICE_SLIDE_DAMAGE = 30;
/** 冰霜巨人：ICE_WALL/FREEZE_WALL 被击碎后，四周生成的 SHATTERED_ICE 存续回合数。 */
export const FROST_GIANT_SHATTERED_ICE_DURATION = 5;
/** 冰霜巨人：玩家踩入 SHATTERED_ICE 造成的固定伤害（命中后该格立即消耗）。 */
export const FROST_GIANT_SHATTERED_ICE_DAMAGE = 30;
/** 冰霜巨人：HP 占比 ≤ 此值时进入狂暴，开启「预警→冲锋」循环（替代冰霜重击）。 */
export const FROST_GIANT_ENRAGE_HP_RATIO = 0.4;
/** 冰霜巨人：狂暴冲锋命中玩家时的伤害倍率。 */
export const FROST_GIANT_CHARGE_DAMAGE_MULT = 2;
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
/** 铁匠强化基础费用（每次实际费用 = BASE × upgradeStep × (enhanceLevel + 1)，按品质分级递增）。 */
export const BLACKSMITH_UPGRADE_COST = 20;
/** 强化从第几级起开始有失败概率（+5 = 10%，+6 = 15%，每级 +5%，上限 80%）。 */
export const BLACKSMITH_FAIL_THRESHOLD = 5;
export const BLACKSMITH_FAIL_BASE = 0.10;
export const BLACKSMITH_FAIL_STEP = 0.05;
export const BLACKSMITH_FAIL_CAP = 0.80;
/**
 * 铁匠强化每次提升 baseStat 的增量，按装备品质分级（×10 基准）。
 * WEAPON / ARMOR / HELMET 使用此表；SHOES / TRINKET 固定 +1。
 * 示例：COMMON 武器（基础10）每次+1；FINE（基础20）每次+2；LEGENDARY（基础80）每次+8。
 */
export const BLACKSMITH_ENHANCE_STEP: Record<string, number> = {
  COMMON:    1,
  FINE:      2,
  RARE:      3,
  EPIC:      5,
  LEGENDARY: 8,
};
/** 铁匠洗炼：重新随机词条所需金币。 */
export const BLACKSMITH_REROLL_COST = 30;

// ── 第 2-5 章 Boss 专属机制常量（260613 内容深化）──────────
/** 第2章 QuicksandScorpion Boss 房静态沙坑数量（开房时刷，永久；钻地优先出沙坑位）。 */
export const CHAPTER2_SAND_PIT_COUNT = 5;
/** 沙坑移动 AP 额外消耗（叠加在基础 MOVE 上；静态/动态沙坑共用）。 */
export const CHAPTER2_SAND_PIT_MOVE_PENALTY = 2;
/** 第3章 FrostGiant Boss 房冰墙数量。 */
export const CHAPTER3_ICE_WALL_COUNT = 3;
/** 冰墙 HP（玩家可攻击破坏，HP=0 时消失并掉灵气）。 */
export const CHAPTER3_ICE_WALL_HP = 10;
/** 冰墙破坏时掉落灵气。 */
export const CHAPTER3_ICE_WALL_DROP_ANIMA = 1;
/** 第4章 LavaLord 阶段二：定向熔岩潮汐每隔多少 Boss 回合推进一排（2026-06-15 由"随机撒点"重做为"定向整排"）。 */
export const CHAPTER4_LAVA_TIDE_INTERVAL = 3;
/** 定向熔岩潮汐最多推进的排数（达到后停止推进，已生成格子永久保留）。 */
export const CHAPTER4_LAVA_TIDE_ROW_MAX = 3;
/** 玩家踩入熔岩地块的伤害（每回合开始结算，含永久熔岩格）。 */
export const CHAPTER4_LAVA_TILE_DAMAGE = 5;
/** LavaLord phase2 触发的 HP 比例阈值。 */
export const CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO = 0.5;
/** 阶段一「喷发预警」：每隔多少回合标记一次喷发区域。 */
export const LAVA_LORD_ERUPTION_INTERVAL = 3;
/** 喷发结算生成的熔岩地块存续回合数。 */
export const LAVA_LORD_ERUPTION_DURATION = 3;
/** 熔核爆裂：玩家灼烧层数达到该阈值时强制触发。 */
export const LAVA_LORD_BURN_BURST_THRESHOLD = 6;
/** 熔核爆裂：每层灼烧造成的真实伤害。 */
export const LAVA_LORD_BURN_BURST_DAMAGE_PER_STACK = 5;
/** 熔核爆裂：玩家周围生成的熔岩地块存续回合数。 */
export const LAVA_LORD_BURN_BURST_TILE_DURATION = 3;
/** 熔岩锁链：玩家与 Boss 距离达到该值时直接触发（无需累计回合）。 */
export const LAVA_LORD_CHAIN_DISTANCE_THRESHOLD = 4;
/** 熔岩锁链：玩家连续多少回合未与 Boss 相邻时触发。 */
export const LAVA_LORD_CHAIN_TURN_THRESHOLD = 3;
/** 熔岩锁链命中时附加的灼烧层数。 */
export const LAVA_LORD_CHAIN_BURN_TICKS = 2;
/** Boss 站在熔岩地块上时，普通攻击力加成。 */
export const LAVA_LORD_LAVA_STAND_ATTACK_BONUS = 1;
/** Boss 站在熔岩地块上时，受到玩家伤害的减免比例。 */
export const LAVA_LORD_LAVA_STAND_DAMAGE_REDUCTION = 0.2;
/** 命运守卫：行为镜像生成 HP 比例阈值（Boss HP 跨过 50% 时生成 1 次）。 */
export const FATE_MIRROR_SPAWN_HP_RATIO = 0.5;
/** 命运守卫：镜像 HP = 玩家当前 HP × 该系数（诞生瞬间快照）。 */
export const FATE_MIRROR_HP_FROM_PLAYER = 0.5;
/** 命运守卫：镜像攻击 = 玩家当前 attack × 该系数（诞生瞬间快照）。 */
export const FATE_MIRROR_ATK_FROM_PLAYER = 0.5;
/** 命运守卫：镜像反打攻击曼哈顿距离上限（> 此值空挥）。 */
export const FATE_MIRROR_ATTACK_RANGE = 2;
/** 命运镜像 bossId（用于 stepBoss / mirrorBehaviorStep 区分镜像与本体）。 */
export const FATE_MIRROR_BOSS_ID = 'FATE_MIRROR';
/** 命运守卫：HP 跨过此比例 → 进入狂暴态（清空预言、开启改写命运周期）。 */
export const FATE_ENRAGE_HP_RATIO = 0.3;
/** 命运守卫：狂暴态每多少个怪物回合触发一次「改写命运」预告。 */
export const DESTINY_REWRITE_INTERVAL = 4;
/** 命运守卫：改写命运事件池大小（E1-E5）。 */
export const DESTINY_REWRITE_POOL_SIZE = 5;
/** 命运守卫：改写命运每次抽取的事件数（玩家会从中弃 1，剩余 2 生效）。 */
export const DESTINY_REWRITE_DRAW_SIZE = 3;
/** 命运守卫：E1 Boss 回血量 = maxHp × 该系数。 */
export const DESTINY_HEAL_RATIO = 0.05;
/** 命运守卫：E2 Boss 加伤害百分比（普攻 / 镜像攻击 / 5×5 都吃）。 */
export const DESTINY_ATK_BUFF_PCT = 30;
/** 命运守卫：E2 Boss 加伤害持续怪物回合数。 */
export const DESTINY_ATK_BUFF_DURATION_TURNS = 3;
/** 命运守卫：E3 玩家扣血伤害 = boss.attack × 该系数（无视防御）。 */
export const DESTINY_DIRECT_DMG_MULT = 1.0;
/** 命运守卫：E4 5×5 爆炸切比雪夫半径（2 → 5×5）。 */
export const DESTINY_5X5_RADIUS = 2;
/** 命运守卫：E4 5×5 爆炸伤害 = boss.attack × 该系数（中心 = Boss 当前格）。 */
export const DESTINY_5X5_DMG_MULT = 1.2;

// ── 第一章专属机制常量 ─────────────────────────────────────
/** 第一章 Boss 房随机石块数量。 */
export const CHAPTER1_BOSS_ROCK_COUNT = 5;
/** 石块 HP（可破坏，玩家普攻可击碎）。 */
export const ROCK_HP = 350;
/** 增援号角每次召唤哥布林战士数（非狂暴）。 */
export const HORN_WARRIOR_COUNT = 1;
/** 增援号角每次召唤哥布林战士数（狂暴后）。 */
export const HORN_WARRIOR_ENRAGE_COUNT = 2;
/** 哥布林酋长场上同时允许存在的号角召唤兵上限，用于防止久战时怪物数量失控。 */
export const GOBLIN_CHIEF_SUMMON_CAP = 8;
/** 冰霜哥布林冰霜：移动AP+1的持续回合数（可叠加）。 */
export const FROST_MOVE_PENALTY_ROUNDS = 2;
/** 赤炎哥布林灼烧：5HP/回合的持续回合数（可叠加）。 */
export const FIRE_BURN_ROUNDS = 2;

// ── 第 2-5 章普通/精英怪新行为常量（P1）────────────────────────
/** 毒蝎中毒：每回合伤害值。 */
export const POISON_DAMAGE_PER_ROUND = 8;
/** 毒蝎中毒：命中玩家后的持续回合数（不叠加，刷新计时）。 */
export const POISON_ROUNDS = 3;

// ── 第 2-5 章灵气怪专属机制常量（260616 灵气怪差异化升级）─────
/** 灵气甲虫（CH2）：逃跑离开格留下沙坑，存续回合数。 */
export const ANIMA_BEETLE_TRAP_DURATION = 8;
/** 灵气精灵（CH3）：逃跑离开格留下冰面，存续回合数。 */
export const ANIMA_ELF_TRAP_DURATION = 6;
/** 灵气炎魂（CH4）：玩家击杀时在十字 4 格生成的熔岩存续回合数。 */
export const ANIMA_EMBER_LAVA_DURATION = 3;
/** 灵气幻象（CH5）Buff/Debuff 池 id：随机一项立即生效。 */
export const ANIMA_MIRAGE_BUFF_IDS = ['HEAL_30', 'AP_PLUS_3', 'ANIMA_PLUS_60', 'GOLD_PLUS_60', 'ATTACK_UP'] as const;
export const ANIMA_MIRAGE_DEBUFF_IDS = ['HURT_20', 'FIRE_BURN_2', 'SLOW_2', 'AP_MINUS_3', 'ANIMA_PROGRESS_MINUS_30'] as const;
export type AnimaMirageBuffId = (typeof ANIMA_MIRAGE_BUFF_IDS)[number];
export type AnimaMirageDebuffId = (typeof ANIMA_MIRAGE_DEBUFF_IDS)[number];

// ── 命运碎片成长树（destiny tree，V2：5 分支 x 9 节点）──
/** 守护1 坚韧之躯：maxHp/hp +15。 */
export const TREE_A1_HP_BONUS = 15;
/** 守护2 厚甲本能：maxHp/hp +10。 */
export const TREE_A2_HP_BONUS = 10;
/** 守护3 坚韧之躯 II：再 +20。 */
export const TREE_A3_HP_BONUS = 20;
/** 征伐1 武者直觉：攻击力加成 +3。 */
export const TREE_B1_ATTACK_BONUS = 3;
/** 征伐3 急行军：AP 骰子上限 +1（dice 范围 [1,6]→[1,7]）。 */
export const TREE_B2_AP_DICE_BONUS = 1;
/** 征伐2 余势不散：AP 结转上限 +1（AP_CARRY_CAP 3→4）。 */
export const TREE_B2_AP_CARRY_BONUS = 1;
/** 征伐4 职业先驱：远征开始时随机一个可进阶职业的碎片 +1。 */
export const TREE_B3_FRAGMENT_BONUS = 1;
/** 富集1 财富眼光：开局金币加成。 */
export const TREE_C1_GOLD_BONUS = 12;
/** 富集2 宝箱老手：开宝箱额外获得的金币比例。 */
export const TREE_C2_CHEST_GOLD_BONUS_PCT = 0.2;
/** 富集3 铁匠熟客：铁匠强化费用减免（20→15）。 */
export const TREE_C3_BLACKSMITH_DISCOUNT = 5;
/** 富集4 商路嗅觉：营地商店价格降低 10%。 */
export const TREE_C4_CAMP_SHOP_DISCOUNT_PCT = 0.1;
/** 灵脉1 灵感涌现：开局灵气 +25。 */
export const TREE_D1_ANIMA_BONUS = 25;
/** 灵脉2 悟道加速：强化阈值整体 ×0.92。 */
export const TREE_D2_THRESHOLD_MULT = 0.92;
/** 灵脉3 灵脉共鸣：灵气获取额外 +10%。 */
export const TREE_D3_ANIMA_GAIN_PCT = 0.1;
/** 天命1 星盘初启：开局金币 +8，作为天命分支的轻量前置补给。 */
export const TREE_E1_GOLD_BONUS = 8;
/** 命运树重置：消耗钻石数（退还全部已解锁节点的命运碎片，清空 unlockedTreeNodes）。 */
export const TREE_RESET_DIAMOND_COST = 20;

/** 命运树节点定义：column 内按 order 顺序解锁（需先解锁 order-1 的节点）。 */
export interface DestinyTreeNodeDef {
  id: string;
  column: 'A' | 'B' | 'C' | 'D' | 'E';
  order: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  name: string;
  cost: number;
  /** 节点效果简述，常驻显示在命运树面板节点格内（specs/game-design/命运树设计V1.md §三）。 */
  desc: string;
}

export const DESTINY_TREE_LIVE_MAX_ORDER_BY_COLUMN: Record<DestinyTreeNodeDef['column'], number> = {
  A: 9,
  B: 9,
  C: 9,
  D: 9,
  E: 9,
};

export function isDestinyTreeNodeLive(def: DestinyTreeNodeDef): boolean {
  return def.order <= DESTINY_TREE_LIVE_MAX_ORDER_BY_COLUMN[def.column];
}

export const DESTINY_TREE_NODES: readonly DestinyTreeNodeDef[] = [
  { id: 'A1', column: 'A', order: 1, name: '坚韧之躯', cost: 15, desc: '生命上限+15' },
  { id: 'A2', column: 'A', order: 2, name: '厚甲本能', cost: 25, desc: '生命上限+10' },
  { id: 'A3', column: 'A', order: 3, name: '坚韧之躯 II', cost: 40, desc: '生命上限再+20' },
  { id: 'A4', column: 'A', order: 4, name: '止血意志', cost: 60, desc: '低血首次回复' },
  { id: 'A5', column: 'A', order: 5, name: '险境韧性', cost: 85, desc: '大伤害减免' },
  { id: 'A6', column: 'A', order: 6, name: '守护回响', cost: 115, desc: 'Boss层回复' },
  { id: 'A7', column: 'A', order: 7, name: '稳固阵脚', cost: 150, desc: '受击后减伤' },
  { id: 'A8', column: 'A', order: 8, name: '余生火种', cost: 190, desc: '章节低血补给' },
  { id: 'A9', column: 'A', order: 9, name: '不灭誓约', cost: 240, desc: '首次致死保命' },

  { id: 'B1', column: 'B', order: 1, name: '武者直觉', cost: 15, desc: '攻击力+3' },
  { id: 'B2', column: 'B', order: 2, name: '余势不散', cost: 25, desc: 'AP结转上限+1' },
  { id: 'B3', column: 'B', order: 3, name: '急行军', cost: 40, desc: 'AP骰子上限+1' },
  { id: 'B4', column: 'B', order: 4, name: '职业先驱', cost: 60, desc: '开局职业碎片+1' },
  { id: 'B5', column: 'B', order: 5, name: '破甲手感', cost: 85, desc: '首击精英/Boss+20%' },
  { id: 'B6', column: 'B', order: 6, name: '猎首本能', cost: 115, desc: '击杀精英本层+攻' },
  { id: 'B7', column: 'B', order: 7, name: '战斗熟稔', cost: 150, desc: '普通怪伤害+10%' },
  { id: 'B8', column: 'B', order: 8, name: '临门一击', cost: 190, desc: '斩杀线伤害+15%' },
  { id: 'B9', column: 'B', order: 9, name: '破阵时刻', cost: 240, desc: '击杀后下击+50%' },

  { id: 'C1', column: 'C', order: 1, name: '财富眼光', cost: 15, desc: '开局金币+12' },
  { id: 'C2', column: 'C', order: 2, name: '宝箱老手', cost: 25, desc: '宝箱金币+20%' },
  { id: 'C3', column: 'C', order: 3, name: '铁匠熟客', cost: 40, desc: '强化费用-5' },
  { id: 'C4', column: 'C', order: 4, name: '商路嗅觉', cost: 60, desc: '营地商店-10%' },
  { id: 'C5', column: 'C', order: 5, name: '装备鉴赏', cost: 85, desc: '精英装备率+5%' },
  { id: 'C6', column: 'C', order: 6, name: '锻造余温', cost: 115, desc: '强化失败返金' },
  { id: 'C7', column: 'C', order: 7, name: '淘金路线', cost: 150, desc: '普通怪金币+10%' },
  { id: 'C8', column: 'C', order: 8, name: '精炼手艺', cost: 190, desc: '章节首强额外+1' },
  { id: 'C9', column: 'C', order: 9, name: '命运宝库', cost: 240, desc: 'Boss后经济奖励' },

  { id: 'D1', column: 'D', order: 1, name: '灵感涌现', cost: 15, desc: '开局灵气+25' },
  { id: 'D2', column: 'D', order: 2, name: '悟道加速', cost: 25, desc: '强化阈值×0.92' },
  { id: 'D3', column: 'D', order: 3, name: '灵脉共鸣', cost: 40, desc: '灵气获取+10%' },
  { id: 'D4', column: 'D', order: 4, name: '专注冥想', cost: 60, desc: '首次强化可重抽' },
  { id: 'D5', column: 'D', order: 5, name: '灵性筛选', cost: 85, desc: '降低满层词条' },
  { id: 'D6', column: 'D', order: 6, name: '共振余波', cost: 115, desc: '强化返还灵气' },
  { id: 'D7', column: 'D', order: 7, name: '灵气牵引', cost: 150, desc: '灵气怪灵气+15%' },
  { id: 'D8', column: 'D', order: 8, name: '深层悟道', cost: 190, desc: '章节首强赠灵气' },
  { id: 'D9', column: 'D', order: 9, name: '灵脉贯通', cost: 240, desc: '首次强化4选1' },

  { id: 'E1', column: 'E', order: 1, name: '星盘初启', cost: 15, desc: '开局金币+8' },
  { id: 'E2', column: 'E', order: 2, name: '命运馈赠', cost: 25, desc: '开局三选一装备' },
  { id: 'E3', column: 'E', order: 3, name: '命运护佑', cost: 40, desc: '开局三选一词条' },
  { id: 'E4', column: 'E', order: 4, name: '星盘校准', cost: 60, desc: '馈赠装备升品' },
  { id: 'E5', column: 'E', order: 5, name: '命运偏转', cost: 85, desc: '首次三选一重抽' },
  { id: 'E6', column: 'E', order: 6, name: '星辉馈赠', cost: 115, desc: 'Boss后构筑奖励' },
  { id: 'E7', column: 'E', order: 7, name: '预兆感知', cost: 150, desc: '章节Boss提示' },
  { id: 'E8', column: 'E', order: 8, name: '命轮余辉', cost: 190, desc: '首次卷轴候选+1' },
  { id: 'E9', column: 'E', order: 9, name: '改命之刻', cost: 240, desc: '三选一高阶重抽' },
] as const;

// ── 掩体视线（LOS，specs/260629-map-terrain Phase 2）─────────────
/** 挡视线的地形类型（墙体型；地面型 SAND_PIT / ICE_TILE / LAVA_TILE 不挡，AC-MT-5）。 */
export const BLOCKS_LOS_TYPES = new Set(['ROCK', 'ICE_WALL', 'FREEZE_WALL']);

// ── 普通层地形生成（specs/260629-map-terrain Phase 1）─────────────
/** 每章普通层主地形类型（第5章沿用石块作走位障碍）。 */
export const NORMAL_FLOOR_TERRAIN_TYPE = {
  1: 'ROCK',
  2: 'SAND_PIT',
  3: 'ICE_WALL',
  4: 'LAVA_TILE',
  5: 'ROCK',
} as const;

/** 第3章普通层额外铺设冰面数量（ICE_TILE，非阻挡，引发滑行走位）。 */
export const CHAPTER3_NORMAL_ICE_TILE_COUNT = 2;

/**
 * 普通层地形数量区间 [min, max]，按章内层号（1-6；第7层是 Boss，不走此表）。
 * 节拍：1-2 探索铺垫（稀疏）→ 3 精英关（中等）→ 4-6 机关主场（密集）。
 */
export const NORMAL_FLOOR_TERRAIN_COUNT: Readonly<Record<number, readonly [number, number]>> = {
  1: [3, 5],
  2: [3, 5],
  3: [5, 7],
  4: [8, 12],
  5: [8, 12],
  6: [8, 12],
};

// ── 仅开发调试（正式构建前必须置 0）────────────────────────
/**
 * 自动跳至目标层（0 = 关闭）。
 * 将此值改为非零整数（例如 5）后重新构建，开局将直接跳到该层。
 * ⚠️ 正式构建 / 提测前必须改回 0！同时确认上面的 INITIAL_HP 为正式目标值。
 */
export const DEV_SKIP_TO_FLOOR = 0;

/** 第 floor 层（1-based）所属章节（1-based）。 */
export function chapterOfFloor(floor: number): number {
  return Math.floor((floor - 1) / FLOORS_PER_CHAPTER) + 1;
}

/** 第 floor 层是否为章节 Boss 层（每章第 FLOORS_PER_CHAPTER 层，当前=7）。 */
export function isBossFloor(floor: number): boolean {
  return floor % FLOORS_PER_CHAPTER === 0;
}

/** 第 floor 层地图边长。 */
export function mapSizeOfFloor(floor: number): number {
  if (isBossFloor(floor)) return MAP_SIZE.BOSS;
  return chapterOfFloor(floor) >= 3 ? MAP_SIZE.HIGH : MAP_SIZE.NORMAL;
}

/** 按章节返回普通/精英/灵气怪属性倍率（HP / 攻击），chapter 1-5，章节外夹紧到边界。
 *  旧值：1.0→1.4→2.0→2.8→3.8；新值大幅拉陡使后期怪物真正构成威胁。
 */
export function chapterScaling(chapter: number): { hpMult: number; attackMult: number } {
  const SCALING = [
    { hpMult: 1.0, attackMult: 1.0 },
    { hpMult: 1.8, attackMult: 1.8 },
    { hpMult: 3.0, attackMult: 3.0 },
    { hpMult: 5.0, attackMult: 5.0 },
    { hpMult: 8.0, attackMult: 8.0 },
  ] as const;
  const idx = Math.max(0, Math.min(chapter - 1, SCALING.length - 1));
  return SCALING[idx];
}

/** 按章节返回 Boss 专属属性倍率（HP / 攻击），chapter 1-5，章节外夹紧到边界。
 *  HP 大幅上调保证 Boss 战有足够回合数；攻击上调幅度较缓，保留可玩余地。
 */
export function bossChapterScaling(chapter: number): { hpMult: number; attackMult: number } {
  const SCALING = [
    { hpMult: 2.0,  attackMult: 1.5 },
    { hpMult: 3.5,  attackMult: 2.5 },
    { hpMult: 6.0,  attackMult: 3.5 },
    { hpMult: 10.0, attackMult: 5.0 },
    { hpMult: 16.0, attackMult: 7.0 },
  ] as const;
  const idx = Math.max(0, Math.min(chapter - 1, SCALING.length - 1));
  return SCALING[idx];
}
export const PVE_STAMINA_MAX = 60;
export const PVE_STAMINA_RUN_COST = 20;
export const PVE_STAMINA_RECOVERY_MS = 5 * 60 * 1000;

// ── 难度档（design 260628-progression-pacing-v3 §5，→ AC-P3-6/7/9） ────────
/** 难度档枚举（与云端 PVE_DIFFICULTY 镜像一致）。 */
export const DIFFICULTY_TIER = {
  NORMAL:    'NORMAL',
  HARD:      'HARD',
  NIGHTMARE: 'NIGHTMARE',
  ABYSS:     'ABYSS',
  INFERNO:   'INFERNO',
} as const;
export type DifficultyTier = typeof DIFFICULTY_TIER[keyof typeof DIFFICULTY_TIER];

/** 难度档解锁顺序（索引 = 数值级别，与云端 PVE_DIFFICULTY_ORDER 保持一致）。 */
export const DIFFICULTY_ORDER: readonly DifficultyTier[] = [
  'NORMAL', 'HARD', 'NIGHTMARE', 'ABYSS', 'INFERNO',
];

/**
 * 各难度档怪物 HP/攻击倍率与命运碎片结算倍率（与云端 PVE_DIFFICULTY_MULTIPLIERS 镜像一致）。
 * - hpMult / atkMult：作用于生成怪物的章节缩放结果（冻结进存档，→ AC-P3-9）
 * - shardMult：作用于结算产出命运碎片（云端权威计算，→ AC-P3-9）
 */
export const DIFFICULTY_MULTIPLIERS: Record<DifficultyTier, { hpMult: number; atkMult: number; shardMult: number }> = {
  NORMAL:    { hpMult: 1.00, atkMult: 1.00, shardMult: 1.00 },
  HARD:      { hpMult: 1.10, atkMult: 1.05, shardMult: 1.15 },
  NIGHTMARE: { hpMult: 1.20, atkMult: 1.10, shardMult: 1.30 },
  ABYSS:     { hpMult: 1.35, atkMult: 1.18, shardMult: 1.50 },
  INFERNO:   { hpMult: 1.50, atkMult: 1.25, shardMult: 1.75 },
};

/** 难度快照（冻结进存档；续档时从存档读取，不可被后续配置变化影响，→ AC-P3-9）。 */
export interface DifficultySnapshot {
  tier: DifficultyTier;
  hpMult: number;
  atkMult: number;
  shardMult: number;
}

/** 从难度档枚举创建快照对象（startExpedition 时调用并写入 ExpeditionState）。 */
export function makeDifficultySnapshot(tier: DifficultyTier = 'NORMAL'): DifficultySnapshot {
  const m = DIFFICULTY_MULTIPLIERS[tier] ?? DIFFICULTY_MULTIPLIERS.NORMAL;
  return { tier, ...m };
}
