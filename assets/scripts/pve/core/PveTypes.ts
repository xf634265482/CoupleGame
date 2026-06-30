// PVE「命运远征」核心数据模型与事件类型。
// 纯类型/数据，零框架依赖。不用 enum，统一字面量联合类型。

import type { AdvancableClass, AwakenForm, ClassId } from './PveConstants';

// ── 几何 ───────────────────────────────────────────────
export interface Coord {
  x: number;
  y: number;
}

// ── 实体 ───────────────────────────────────────────────
export type MonsterType = 'NORMAL' | 'ANIMA' | 'ELITE' | 'BOSS';

export type FixedEntityType =
  | 'CHEST' // 宝箱
  | 'BLACKSMITH' // 铁匠
  | 'IDOL' // 神像
  | 'HOT_SPRING' // 温泉
  | 'ALTAR' // 祭坛
  | 'KEY' // 钥匙
  | 'EXIT' // 出口门
  | 'PORTAL' // 传送门（Boss 击败后生成）
  | 'FRAGMENT' // 职业碎片（AC-15 M2）
  | 'ROCK' // 石块地形（Boss 房障碍，可挡一次 AOE 后消失）
  | 'SAND_PIT' // 沙坑地形（第2章 Boss 房：移动 AP+2，Boss 钻出优先沙坑；潜地时动态扩张，带 remaining 的为动态坑）
  | 'ICE_WALL' // 冰墙地形（第3章 Boss 房：阻挡移动，HP=10 可被攻击破坏）
  | 'ICE_TILE' // 冰面地块（第3章 FrostGiant 冰冻回合铺出，玩家踩上滑行，remaining 倒计时融化）
  | 'FREEZE_WALL' // 冰冻状态墙（第3章 FrostGiant：玩家被冻结时在周围生成，按攻击次数而非HP移除）
  | 'SHATTERED_ICE' // 碎冰地块（第3章 FrostGiant：冰墙/冻结墙被击碎后生成，remaining 倒计时；玩家踩入扣固定伤害并立即消耗，不阻挡移动）
  | 'LAVA_TILE'; // 熔岩地块（第4章 LavaLord phase2 周期性刷出，玩家踩入扣 HP）

export type MonsterAiState = 'IDLE' | 'PATROL' | 'CHASE' | 'FLEE' | 'DEAD';

export interface Monster {
  id: string;
  type: MonsterType;
  pos: Coord;
  hp: number;
  maxHp: number;
  attack: number;
  range: number;
  aggroRadius: number;
  aiState: MonsterAiState;
  /** Boss 专属机制 id（type==='BOSS' 时有效）。 */
  bossId?: string;
  /** 流沙巨蝎潜地状态：true 时免疫玩家攻击，下一回合冒出并双倍伤害（bossId=QUICKSAND_SCORPION）。 */
  isBurrowed?: boolean;
  /** 怪物变体 id（NORMAL/ANIMA/ELITE 专属行为差异，如 'GOBLIN_ARCHER'/'FROST_GOBLIN'/'SPIRIT_RAT'）。 */
  variantId?: string;
  /** Boss 增援技能召唤出的怪物：击杀时不产生任何掉落（金币/灵气/装备），避免刷增援白嫖收益。 */
  summoned?: boolean;
  /** 冰冻剩余回合数（PERMAFROST_CORE 遗物 / boss_slow_on_hit / boss_stun_on_hurt 触发）：>0 时 stepOneMonsterCore 跳过本怪物回合并 -1。 */
  frozenRounds?: number;
  /** 流血剩余回合数（boss_bleed_on_hit 装备 trait 触发）：每怪物回合开始扣 BLEED_DAMAGE HP，递减至 0。 */
  bleedRounds?: number;
  /** 灼烧剩余 tick 数（boss_burn_on_hit 装备 trait 触发）：每怪物回合开始扣 BURN_TICK_DAMAGE HP，递减至 0。 */
  burnRounds?: number;
  /** Rogue poison: damage is stored with the application for deterministic ticks. */
  poisonRounds?: number;
  poisonDamage?: number;
  /** 冰霜巨人狂暴冲锋预警方向（bossId=FROST_GIANT）：上一回合预警时记录，本回合沿此方向执行冲锋后清除。 */
  frostChargeDir?: Coord;
  /** 命运守卫行为镜像（bossId=FATE_MIRROR）专属：玩家上一回合行为，下个怪物回合执行后清空。 */
  pendingBehavior?: { action: 'ATTACK' | 'MOVE' | 'IDLE'; distance: number };
  /** 命运守卫行为镜像专属：护盾层数（0/1，不叠加；吸收一次伤害后归零）。 */
  shieldStacks?: 0 | 1;
  /** 命运守卫本体（bossId=FATE_GUARDIAN）专属：改写命运 E2 加伤百分比，普攻 / 镜像攻击 / 5×5 都吃。 */
  attackBuffPct?: number;
  /** 命运守卫本体专属：attackBuffPct 失效的怪物回合（floor.turn >= 此值时清零）。 */
  attackBuffExpiresAtTurn?: number;
  /** 命运守卫本体专属：HP 是否已跨过 50% 阈值生成过行为镜像（true 后不再生成，即使镜像死亡）。 */
  mirrorSpawned?: boolean;
  /** 命运守卫本体专属：是否已进入狂暴态（HP 跨 30% 后 true，不可逆）。 */
  enraged?: boolean;
  /** 命运守卫本体专属：狂暴起始 floor.turn（计算改写命运周期用）。 */
  enrageTurn?: number;
  /** VOID_WORM 双生复活：首次被击杀时以 50% maxHp 原地复活；true 后不再触发。 */
  revivedOnce?: boolean;
  /** 护甲值（Chapter 2+ 怪物/Boss 专有）：玩家普攻前先扣减此值，最低造成 1 伤害。 */
  armor?: number;
  tutorialDrop?: { gold?: number; anima?: number; equip?: EquipItem };
}

export interface FixedEntity {
  id: string;
  type: FixedEntityType;
  pos: Coord;
  /** 是否已被消耗（宝箱已开 / 钥匙已拾 / 出口已开）。 */
  consumed: boolean;
  /** 职业碎片专属：碎片所属职业（type==='FRAGMENT' 时有值）。 */
  fragmentClass?: ClassId;
  /** 冰墙剩余 HP（type==='ICE_WALL' 时有值），0 时 consumed=true。 */
  hp?: number;
  /** 熔岩地块剩余存在回合数（type==='LAVA_TILE' 时有值），0 时移除。 */
  remaining?: number;
}

// ── 装备（M1 仅占位，M2 展开 design §11） ──────────────
export type EquipSlot = 'WEAPON' | 'HELMET' | 'ARMOR' | 'SHOES' | 'TRINKET';
export type EquipQuality = 'COMMON' | 'FINE' | 'RARE' | 'EPIC' | 'LEGENDARY';

/** 词条强度档（design §3）：minor=副词缀 / major=主词缀，掉落时随机。 */
export type AffixTier = 'minor' | 'major';

/** 装备词条实例（Phase 2 AC-EQ-4/5）：id 对应词条池条目，tier 为强度档，value 为该档数值。 */
export interface EquipAffix {
  id: string;
  tier: AffixTier;
  value: number;
}

export interface EquipItem {
  id: string;
  slot: EquipSlot;
  quality: EquipQuality;
  name: string;
  baseStat: number;
  /** 该件装备的 baseStat 区间上限（掉落时 roll，UI 展示「当前值/上限」，AC-EQ-2）。 */
  baseStatMax?: number;
  /** 基础款优缺点效果 id（'weapon_axe'/'weapon_spear'/'armor_plate'/'helmet_heavy' 等，AC-EQ-3）。 */
  implicit?: string;
  trait?: string; // 铁匠洗炼词条 id（旧系统，EPIC+ 洗炼用）
  /** 条件触发词条列表（Phase 2 AC-EQ-4/5：蓝1/紫2/橙2）。 */
  affixes?: EquipAffix[];
  /** 传奇独特效果 id（Phase 3 传奇系统占位）。 */
  legendaryId?: string;
  /** 已强化次数（0 = 未强化，显示为 +N 后缀）。 */
  enhanceLevel?: number;
}

export type Equipment = Partial<Record<EquipSlot, EquipItem>>;

// ── 遗物（Boss 遗物 / 局内被动 buff，死亡时清空） ────────
/** Boss 遗物 id（每章 1 件，掉落规则见 BOSS_DROP_TABLE）。 */
export type RelicId =
  | 'CHIEF_ROAR' // 第1章 酋长怒吼
  | 'QUICKSAND_HEART' // 第2章 流沙之心
  | 'PERMAFROST_CORE' // 第3章 永冻之核
  | 'MAGMA_HEART' // 第4章 熔火之心
  | 'FATE_ECHO'; // 第5章 命运回响

// ── 远征玩家（跨层持久态） ─────────────────────────────
export interface RunPlayer {
  hp: number;
  maxHp: number;
  gold: number;
  anima: number;
  /** 灵气强化进度（累计到 animaThreshold 触发一次强化后归零）。 */
  animaProgress: number;
  /** 灵气强化触发阈值（初始 100，每次强化后 × 1.5 递增，存档字段）。 */
  animaThreshold?: number;
  classId: ClassId;
  /** 已选职业词条 id 列表。 */
  classTraits: string[];
  equipment: Equipment;
  /** 各职业已收集碎片数。 */
  classFragments: Partial<Record<ClassId, number>>;
  /** 二阶觉醒形态（已觉醒时有值，一局内最多觉醒一次）。 */
  awakenForm?: AwakenForm;
  /** 觉醒数据版本；2 表示已迁移到主动分流与专属词条规则。 */
  awakenVersion?: 2;
  /** 觉醒后的下一次强化至少出现一条当前形态专属词条。 */
  awakenFirstOfferPending?: boolean;
  /** 已通关的最大章节号（每章 Boss 击败后更新，用于觉醒条件判定）。 */
  maxChapterCleared?: number;
  /** 命运碎片成长树效果快照（由 startExpedition 时根据 PveMeta.unlockedTreeNodes 计算并固化，
   *  随存档持久化，保证云端复算时无需重新读取 PveMeta，AC-13）。 */
  treeBonuses?: DestinyTreeBonuses;
  /** 最近一次强化候选，用于 V2 候选防重复；随存档持久化。 */
  recentStrengthenOffers?: string[];
  /** Chapter number in which Berserker's Undying has already triggered. */
  undyingUsedChapter?: number;
  /** 本场远征拾取的 Boss 遗物列表（死亡清空，不跨远征保留；图鉴解锁记录见 PveMeta.codex.relics）。 */
  relics?: RelicId[];
  /** 遗物图鉴快照（开局时从 PveMeta.codex.relics 复制 + 本场远征首次拾取时同步追加）。
   *  用于 Boss 掉落「图鉴已解锁 +10%」判定。运行结束后由 Controller 同步回云端 codex.relics。 */
  codexRelics?: RelicId[];
  /** 本场远征持有的命运词条卷轴数量（拾取后可使用，使用时三选一附加 strengthen_* 词条到 classTraits）。 */
  scrolls?: number;
  /** 背包（槽位已占时装备入包，可手动装备 / 置换）。 */
  bag?: EquipItem[];
  /** 神像祝福累计攻击加成（永久，跨层保留）。 */
  idolAttackBonus?: number;
  /** 神像祝福累计护甲加成（永久，减少怪物伤害，跨层保留）。 */
  idolArmorBonus?: number;
  /** 遗物运行态：CHIEF_ROAR/PERMAFROST_CORE 累计与待触发标记；FATE_ECHO 一次性消耗标记。 */
  relicState?: {
    /** CHIEF_ROAR：上次击杀后下一次普攻 +50%，触发后置 false。 */
    chiefRoarPending?: boolean;
    /** PERMAFROST_CORE：累计移动步数（每 3 步触发一次冰冻并归零）。 */
    permafrostSteps?: number;
    /** PERMAFROST_CORE：步数达 3 后置 true，下次命中怪物时消费并冰冻目标。 */
    permafrostPending?: boolean;
    /** FATE_ECHO：本场远征已触发过致死兜底则为 true（每场远征仅一次）。 */
    fateEchoUsed?: boolean;
    /** boss_revive_50（守卫圣盾）：本场远征已触发过装备级致死兜底则为 true（每场远征仅一次）。 */
    shieldUsed?: boolean;
  };
}

/** 命运碎片成长树效果快照（DestinyTreeSystem.getTreeBonuses 的返回类型）。 */
export interface DestinyTreeBonuses {
  // Phase 1（已接入游戏逻辑）
  maxHpBonus: number;
  deathGoldRetentionPct: number;
  attackBonus: number;
  apDiceBonus: number;
  apCarryCapBonus: number;
  fragmentBonus: number;
  startGoldBonus: number;
  chestGoldBonusPct: number;
  blacksmithDiscount: number;
  campShopDiscountPct: number;
  startAnimaBonus: number;
  strengthenThresholdMult: number;
  animaGainBonusPct: number;
  hasEquipChoice: boolean;
  hasTraitChoice: boolean;

  // Phase 2+: 守护线（A4-A9，hooks 待接入）
  hasLowHpHeal: boolean;            // A4: 止血意志 - 首次低血回复 10% 最大生命
  bigDamageMitPct: number;          // A5: 险境韧性 - 单次超 25% 最大生命伤害减免比例
  bossFloorHealPct: number;         // A6: 守护回响 - 每章首次进入 Boss 层回复比例
  hasPostEliteHitMit: boolean;      // A7: 稳固阵脚 - 被精英/Boss 命中后下次受伤减免
  hasChapterLowHpHeal: boolean;     // A8: 余生火种 - 每章首次通关时低血额外回复
  hasDeathShield: boolean;          // A9: 不灭誓约 - 首次致死保留 1HP 并回复 15%

  // Phase 2+: 征伐线（B5-B9，hooks 待接入）
  firstHitEliteBonusPct: number;   // B5: 破甲手感 - 首击精英/Boss 伤害加成
  killEliteAttackBonus: number;    // B6: 猎首本能 - 击杀精英后本层攻击力加成
  normalMonsterDamageBonusPct: number; // B7: 战斗熟稔 - 对普通怪伤害加成
  executeThresholdBonusPct: number;    // B8: 临门一击 - 攻击低血怪伤害加成
  killChainBonusPct: number;           // B9: 破阵时刻 - 击杀精英/Boss 后下一击加成

  // Phase 2+: 富集线（C5-C9，hooks 待接入）
  eliteEquipRateBonusPct: number;       // C5: 装备鉴赏 - 精英装备掉落率加成
  hasChapterFirstSmithRefund: boolean;  // C6: 锻造余温 - 每章首次强化失败返还 50% 金币
  normalMonsterGoldBonusPct: number;    // C7: 淘金路线 - 普通怪金币加成
  hasChapterFirstSmithBonus: boolean;   // C8: 精炼手艺 - 每章首次强化成功额外 +1
  hasBossEconomyChoice: boolean;        // C9: 命运宝库 - Boss 后三选一经济奖励

  // Phase 2+: 灵脉线（D4-D9，hooks 待接入）
  hasFirstStrengthenReroll: boolean;          // D4: 专注冥想 - 首次强化可免费重抽
  hasReduceFullStackTraits: boolean;          // D5: 灵性筛选 - 满层词条在候选中降权
  strengthenAnimaRefundPct: number;           // D6: 共振余波 - 强化后返还阈值比例灵气
  animaMonsterAnimaBonusPct: number;          // D7: 灵气牵引 - 灵气怪灵气掉落加成
  hasChapterFirstStrengthenAnimaBonus: boolean; // D8: 深层悟道 - 每章首次强化后赠灵气
  hasFirstStrengthen4Choice: boolean;         // D9: 灵脉贯通 - 首次强化改为 4 选 1

  // Phase 3+: 天命线（E4-E9，选择队列扩展待接入）
  hasEquipChoiceUpgrade: boolean;   // E4: 星盘校准 - 馈赠装备升品为精良
  hasChoiceReroll: boolean;         // E5: 命运偏转 - 首次命运树三选一可整组重抽
  hasBossChoiceReward: boolean;     // E6: 星辉馈赠 - 每章 Boss 后构筑三选一
  hasBossPreview: boolean;          // E7: 预兆感知 - 章节开始时显示 Boss 提示
  scrollChoiceBonus: number;        // E8: 命轮余辉 - 首次卷轴候选数量加成
  hasAdvancedChoiceReroll: boolean; // E9: 改命之刻 - 高阶重抽（重抽后品质提升）
}

/** 命运树「三选一」待选项（E2 装备 / E3 强化词条），由 startExpedition 生成，
 *  待玩家通过 resolveTreeChoice 选定后从队列中移除。 */
export interface PendingTreeChoice {
  source: 'E2' | 'E3';
  kind: 'EQUIP' | 'TRAIT';
  equipOptions?: EquipItem[];
  traitOptions?: string[];
}

export interface PveBalancePlayerConfig {
  initialHp?: number;
  initialGold?: number;
  initialAnima?: number;
  baseAttack?: number;
  baseAttackRange?: number;
  apBase?: number;
  moveCost?: number;
  attackCost?: number;
  openChestCost?: number;
  openExitCost?: number;
  useIdolCost?: number;
  useHotSpringCost?: number;
  useAltarCost?: number;
}

export interface PveBalanceUnitConfig {
  hpMultiplier?: number;
  attackMultiplier?: number;
  rangeDelta?: number;
  aggroRadiusDelta?: number;
  armorDelta?: number;
}

export interface PveBalanceEquipmentConfig {
  weaponBaseMultiplier?: number;
  armorBaseMultiplier?: number;
  helmetBaseMultiplier?: number;
  shoesBaseMultiplier?: number;
  trinketBaseMultiplier?: number;
}

export interface PveBalanceRelicConfig {
  chiefRoarDamageMultiplier?: number;
  quicksandPitCount?: number;
  quicksandPitDuration?: number;
  quicksandAttackBonus?: number;
  permafrostChargeSteps?: number;
  permafrostFreezeRounds?: number;
  magmaReflectPercent?: number;
  fateEchoRevivePercent?: number;
}

export interface PveBalanceConfig {
  player?: PveBalancePlayerConfig;
  monster?: PveBalanceUnitConfig;
  boss?: PveBalanceUnitConfig;
  equipment?: PveBalanceEquipmentConfig;
  relic?: PveBalanceRelicConfig;
}

export interface PveBalanceSnapshot {
  globalConfig: PveBalanceConfig;
  chapterConfigs: Record<string, PveBalanceConfig>;
  unitConfigs: Record<string, PveBalanceConfig>;
}

// ── 楼层运行态（每层一份，可序列化存档） ───────────────
export type FloorStatus = 'EXPLORING' | 'CLEARED' | 'DEAD';

export interface FloorState {
  floor: number; // 1-based
  size: number; // 边长（8/9/10）
  seed: number; // 本层地图生成种子
  rngState: number; // 当前 RNG 内部状态（续算用）
  player: Coord; // 玩家在网格中的位置
  ap: number; // 当前行动点
  maxAp: number; // 本回合上限（8 + 骰子）
  dice: number; // 本回合骰子点数
  turn: number; // 回合数（1-based）
  hasKey: boolean; // 是否已拾取钥匙
  /** 已揭示格子：revealed[y][x]。 */
  revealed: boolean[][];
  monsters: Monster[];
  entities: FixedEntity[];
  status: FloorStatus;
  /** ROGUE 背刺：本回合移动后下次攻击双倍（移动时置 true，首次命中后置 false，默认 false）。 */
  backstabAvailable?: boolean;
  /** BERSERKER 不屈：本层首次将死时保留 1 HP（触发后置 false，默认 true）。 */
  undyingAvailable?: boolean;
  /** ROGUE 残影：本层首次被攻击时闪避（触发后置 false，默认 true）。 */
  hasAfterimage?: boolean;
  /** 熔岩领主灼烧剩余伤害（每回合开始 -10 HP，直至归零）。 */
  playerBurnRemaining?: number;
  /** 靴子首步免费标记：RARE+ 靴子每回合首次移动免费；本回合已用过则为 true，回合结束时重置。 */
  shoesFirstMoveDone?: boolean;
  /** 移动AP惩罚剩余回合数（冰霜哥布林/重击余波：>0 时每次移动额外消耗 1AP）。 */
  playerMoveApPenaltyRounds?: number;
  /** 赤炎哥布林灼烧剩余回合数（每回合累计 5HP 伤害）。 */
  playerFireBurnRounds?: number;
  /** 赤炎哥布林灼烧伤害累计（每回合 +5，≥10 时扣 10HP 并 -10）。 */
  playerFireBurnAccum?: number;
  /** 毒蝎中毒剩余回合数（每回合 8HP，不叠加，刷新计时）。 */
  playerPoisonRounds?: number;
  /** 杀意沸腾：击杀后下一次主动攻击增伤，触发后消费。 */
  frenzyPending?: boolean;
  /** 无尽杀意层数（最多3层，强化攻击未击杀时清空）。 */
  awakenSlayerIntentStacks?: number;
  /** 双重影袭可消费层数（最多2层，新回合清空）。 */
  awakenShadowCharges?: number;
  /** 双重影袭本回合是否已经由主动移动授予过层数。 */
  awakenShadowGrantedThisTurn?: boolean;
  /** 破绽锁定目标。 */
  awakenSniperExposedTargetId?: string;
  /** 精确校准：下一次蓄势强弓必定暴击。 */
  awakenSniperGuaranteedCrit?: boolean;
  /** 震慑余波：怪物下一次行动伤害降低。 */
  awakenWeakenedMonsterIds?: string[];
  /** 死亡宣告标记目标。 */
  awakenExecutionMarkId?: string;
  /** 各觉醒专属词条每回合一次的触发标记。 */
  awakenBreakerShieldUsed?: boolean;
  awakenSniperDecisiveUsed?: boolean;
  awakenExecutionStealthUsed?: boolean;
  awakenShadowTradeUsed?: boolean;
  /** 熔岩领主第二阶段标记（Boss HP/maxHp ≤ CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO 后置 true，不可逆）。 */
  lavaLordPhase2?: boolean;
  /** 熔岩潮汐回合计数器：phase2 期间每回合 +1，达到 CHAPTER4_LAVA_TIDE_INTERVAL 时推进下一排并归零。 */
  lavaTideCounter?: number;
  /** 熔岩领主阶段一「喷发预警」待结算标记：下个 Boss 回合在 cells 上生成临时 LAVA_TILE。 */
  lavaEruptionMark?: { cells: Coord[] };
  /** 熔岩领主「熔岩锁链」远离计数器：每 Boss 回合曼哈顿距离 >1 时 +1，<=1 时归零。 */
  lavaLordChainCounter?: number;
  /** 熔岩领主阶段二定向熔岩潮汐推进方向（进入阶段二时由 Boss 所在边确定，不可变）。 */
  lavaTideDirection?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  /** 熔岩领主阶段二定向熔岩潮汐已推进的排数（上限 CHAPTER4_LAVA_TIDE_ROW_MAX）。 */
  lavaTideRowsAdvanced?: number;
  /** 复仇类词条（vengeance/retreat_shot/retribution）：受到怪物攻击后置 true，下次主动攻击消耗并 +5 伤害。 */
  vengeanceReady?: boolean;
  /** 进阶 oneShot（final_charge/last_arrow/desperate_gambit）：本层首次 HP≤30% 时触发 AP+3，触发后置 false（默认 true）。 */
  finalChargeAvailable?: boolean;
  /** 命运守卫待结算预言：标记回合记录中心格，下个 Boss 回合该 3×3 区域爆炸后清空。 */
  fateProphecy?: { center: Coord };
  /** 冰霜巨人寒气层数：普通攻击命中玩家时 +1，达到 FROST_GIANT_CHILL_STACKS_TO_FREEZE 时触发冻结并归零。 */
  playerChillStacks?: number;
  /** 玩家是否处于冰霜巨人冻结状态：MOVE 行为被完全阻断（no-op），ATTACK 等其余行动正常。 */
  playerFrozen?: boolean;
  /** 冻结状态下玩家还需主动攻击（playerAttack/attackIceWall）多少次才能解除：归零时解除冻结并移除 FREEZE_WALL。 */
  playerFreezeAttacksRemaining?: number;
  /** 命运守卫狂暴态「改写命运」待结算：5 抽 3 + 玩家弃 1 的中间状态。 */
  pendingDestinyRewrite?: {
    /** 抽到的 3 个事件编号（1-5，不重复，按抽取顺序）。 */
    drawn: [number, number, number];
    /** 玩家弃掉的索引（0/1/2），null 表示尚未选择。 */
    removed: 0 | 1 | 2 | null;
    /** 预告所在的怪物回合（用于周期判定）。 */
    offeredAtTurn: number;
  };
  /** 命运守卫 E5 命运封锁：下个玩家回合 AP 减半（floor(ap/2)，最少 1）。AP 系统结算后清空。 */
  destinyLockNextTurn?: boolean;
  /** 命运守卫行为镜像：玩家本回合是否至少一次命中（CombatSystem.playerAttack 设置，endTurn 重置）。 */
  playerAttackedThisTurn?: boolean;
  /** 命运守卫行为镜像：玩家本回合的累计移动格数（MovementSystem.applyMove 自增，endTurn 重置）。 */
  playerStepsThisTurn?: number;
  /** V2 general traits: floor/turn-scoped combat state. */
  generalFirstAttackUsed?: boolean;
  generalSetbackReady?: boolean;
  generalTerrainPowerReady?: boolean;
  generalStoredEdgeReady?: boolean;
  generalOverhealAnimaThisFloor?: number;
  generalReserveApReady?: boolean;
  /** V2 class traits: shared deterministic runtime state. */
  berserkerShield?: number;
  berserkerBloodyChainReady?: boolean;
  berserkerRageStacks?: number;
  berserkerFinalChargeReady?: boolean;
  berserkerRetaliationTargetId?: string;
  archerMarkedMonsterId?: string;
  archerAttackCount?: number;
  archerNoMultiShotCount?: number;
  archerCriticalReloadReady?: boolean;
  archerHunterRhythmReady?: boolean;
  rogueAttackCountThisTurn?: number;
  rogueKillCountThisFloor?: number;
  rogueEscapeMoveReady?: boolean;
  rogueHidden?: boolean;
  rogueChainBackstabReady?: boolean;
  rogueVanishStrikeReady?: boolean;
  rogueSmokeUsed?: boolean;
  /** 词条：连杀本层击杀计数（aff_kill_chain 攻击加成；新层自动归零）。 */
  affixKillChainStacks?: number;
  /** 词条：先发制人本层首攻已触发（aff_preemptive；新层自动归零）。 */
  affixPreemptiveUsed?: boolean;
  /** 词条：疾袭本回合移动后待触发（aff_swift_strike；endTurn 重置）。 */
  affixSwiftStrikeReady?: boolean;
  tutorialScenarioId?: string;
  tutorialGuide?: {
    currentStepId: string;
    completedStepIds: string[];
    dismissedStepIds?: string[];
  };
}

// ── 远征总状态（存档根对象） ───────────────────────────
export type ExpeditionStatus = 'ACTIVE' | 'DEAD' | 'COMPLETED';

export interface ExpeditionState {
  runSeed: number; // 整次远征种子（派生每层种子）
  chapter: number; // 1-based
  floor: number; // 1-based 当前层
  status: ExpeditionStatus;
  player: RunPlayer;
  floorState: FloorState;
  balanceSnapshot?: PveBalanceSnapshot | null;
  /** 难度快照（开局冻结，续档不变，→ AC-P3-9）。缺省视为 NORMAL。 */
  difficultySnapshot?: import('./PveConstants').DifficultySnapshot | null;
  isTutorialRun?: boolean;
  /** 命运树「三选一」待选队列（E2/E3 解锁后产生，先进先出，UI 弹窗逐个处理）。 */
  pendingTreeChoices?: PendingTreeChoice[];
}

// ── 事件（core 纯函数返回，供 Controller 回放动画） ────
export type PveEvent =
  | { type: 'MOVE'; entityId: 'PLAYER' | string; from: Coord; to: Coord; apLeft: number }
  | { type: 'REVEAL'; cells: Coord[] }
  | { type: 'ATTACK'; attackerId: string; targetId: string; damage: number; targetHp: number }
  | { type: 'KILL'; monsterId: string; monsterType: MonsterType }
  | { type: 'LOOT'; gold?: number; anima?: number; equip?: EquipItem; fragmentPair?: AdvancableClass[]; source: string; bagged?: boolean }
  /** 营地变卖装备（AC-19 装备整理）。 */
  | { type: 'SELL_EQUIP'; slot: EquipSlot; itemName: string; gold: number }
  | { type: 'PICK_KEY'; entityId: string }
  | { type: 'OPEN_CHEST'; entityId: string }
  | { type: 'ANIMA_STRENGTHEN'; choices: string[] } // 触发 3 选 1（待玩家选择）
  | { type: 'PLAYER_DAMAGED'; damage: number; hp: number; sourceId: string; rawDamage?: number }
  | { type: 'TURN_END'; turn: number }
  /** 新回合开始掷骰 → AP（AC-2）：dice ∈ [1,6]，ap = 8 + dice ∈ [9,14]（已包含结转，见 AP_CARRIED）。 */
  | { type: 'AP_ROLLED'; turn: number; dice: number; ap: number }
  /** 上回合剩余 AP 按 AP_CARRY_CAP 结转到本回合：amount 为本次结转值（已计入 AP_ROLLED.ap）。 */
  | { type: 'AP_CARRIED'; amount: number }
  /** Boss 阵亡 + 持有钥匙时在 Boss 位置浮现传送门（玩家需踏入并交互才通关，design AC-9）。 */
  | { type: 'PORTAL_SPAWNED'; entityId: string; pos: Coord }
  /** 神像祝福：三选一随机，仅携带本次命中的那项加成。 */
  | { type: 'IDOL_BLESSING'; entityId: string; effect: 'MAX_HP'; maxHpBonus: number }
  | { type: 'IDOL_BLESSING'; entityId: string; effect: 'ATTACK'; attackBonus: number }
  | { type: 'IDOL_BLESSING'; entityId: string; effect: 'ARMOR'; armorBonus: number }
  /** 温泉治疗：当次回满 HP（M1 占位规则，design.md 未详述）。 */
  | { type: 'HOT_SPRING_HEAL'; entityId: string; healed: number }
  /** 拾取职业碎片（AC-15 M2）：totalFragments 为该职业当前累计数。 */
  | { type: 'FRAGMENT_PICKED'; entityId: string; classId: ClassId; totalFragments: number }
  /** 满足进阶条件：available 为可选进阶职业列表，触发 Controller 弹出选择 UI（阻塞式）。 */
  | { type: 'CLASS_CAN_ADVANCE'; available: ClassId[] }
  /** 职业进阶完成：hpCost 为本次扣除的 HP（仅 BERSERKER 有值）。 */
  | { type: 'CLASS_ADVANCED'; classId: ClassId; hpCost: number }
  /** 满足二阶觉醒条件，触发 Controller 弹出确认 UI（阻塞式）。 */
  | { type: 'CLASS_CAN_AWAKEN'; classId: ClassId }
  /** 二阶觉醒完成：form 为最终判定的觉醒形态。 */
  | { type: 'CLASS_AWAKENED'; classId: ClassId; form: AwakenForm }
  /** 觉醒核心或专属机制触发，供 Controller 组合程序动画与战报。 */
  | { type: 'AWAKEN_EFFECT_TRIGGERED'; effectId: string; sourceId?: string; targetIds?: string[]; amount?: number }
  | { type: 'SHOP_BUY'; itemId: string; cost: number; effect: string }
  /** 成就解锁（Controller 合成，不由 core 纯函数产生；供 _playEvents 展示 toast）。 */
  | { type: 'ACHIEVEMENT_UNLOCKED'; achievementId: string; name: string }
  | { type: 'FLOOR_CLEARED'; floor: number }
  | { type: 'PLAYER_DEAD' }
  /** 流沙巨蝎潜入地下（免疫攻击，下回合冒出）。 */
  | { type: 'BOSS_BURROWED'; bossId: string }
  /** 流沙巨蝎从地下冒出（pos 为落点，落点处会留下一个永久沙坑）。 */
  | { type: 'BOSS_EMERGED'; bossId: string; pos: Coord }
  /** 熔岩领主施加灼烧：totalRemaining 为剩余总灼烧伤害点数。 */
  | { type: 'BURN_APPLIED'; bossId: string; totalRemaining: number }
  /** 移动AP惩罚施加（冰霜哥布林命中 / 哥布林酋长重击AOE）：rounds 为本次叠加的持续回合数。 */
  | { type: 'MOVE_PENALTY_APPLIED'; rounds: number }
  /** 灼烧状态施加（赤炎哥布林命中）：rounds 为本次叠加的持续回合数。 */
  | { type: 'FIRE_BURN_APPLIED'; rounds: number }
  /** 中毒状态施加（毒蝎命中）：rounds 为持续回合数（不叠加，刷新计时）。 */
  | { type: 'POISON_APPLIED'; rounds: number }
  /** 中毒 tick：每回合开始时 -8 HP。 */
  | { type: 'POISON_TICK'; damage: number; hp: number }
  /** 灼烧 tick：每回合开始时 -1 HP。 */
  | { type: 'BURN_TICK'; damage: number; hp: number }
  /** 祭坛使用：消耗后随机获得灵气。 */
  | { type: 'ALTAR_USED'; entityId: string; anima: number }
  /** 铁匠强化成功：baseStat 提升，enhanceLevel +1，显示新的强化等级与属性值。 */
  | { type: 'BLACKSMITH_UPGRADE'; entityId: string; slot: EquipSlot; newStat: number; newEnhanceLevel: number }
  /** 铁匠强化失败：扣费但属性不变（概率失败）。 */
  | { type: 'BLACKSMITH_UPGRADE_FAIL'; entityId: string; slot: EquipSlot; failChance: number }
  /** 铁匠洗炼：随机替换装备词条（消耗金币，不消耗实体）。 */
  | { type: 'BLACKSMITH_REROLL'; entityId: string; slot: EquipSlot; newTrait: string }
  /** 哥布林酋长蓄力重击实际结算：center 为本次重击结算时 boss 所在格（用于 UI 标识实际命中区域）。 */
  | { type: 'HEAVY_STRIKE_RESOLVED'; bossId: string; center: Coord }
  /** 哥布林酋长蓄力重击预警（2026-06-15 恢复 → 最终「先释放后追击」方案）：本回合非重击回合，
   *  但下个怪物回合将触发重击；center 为 boss **当前实际位置**，radius = HEAVY_STRIKE_RANGE。
   *  重击回合 boss 先在原地释放（中心 = center）、再追击移动，故红圈（以 center 为心半径 radius）
   *  与下回合实际命中橙圈完全重合，玩家跑出红圈即绝对安全、不会多走位浪费 AP。 */
  | { type: 'HEAVY_STRIKE_WARNING'; bossId: string; center: Coord; radius: number }
  /** Boss 首次进入狂暴状态（HP 跨过狂暴阈值，当前仅哥布林酋长）：用于战报提示玩家 Boss 强化。 */
  | { type: 'BOSS_ENRAGED'; bossId: string }
  /** 石块被 Boss AOE 摧毁。 */
  | { type: 'ROCK_DESTROYED'; entityId: string }
  /** 怪物被 Boss 增援号角召唤。 */
  | { type: 'MONSTER_SPAWNED'; monsterId: string; pos: Coord }
  /** 命运树节点效果生效汇总（远征开局时产生，供 UI 提示展示）。 */
  | { type: 'TREE_BONUSES_APPLIED'; bonuses: DestinyTreeBonuses }
  /** 命运树「三选一」弹窗触发（E2 装备 / E3 强化词条）。 */
  | { type: 'TREE_CHOICE_OFFERED'; source: 'E2' | 'E3'; kind: 'EQUIP' | 'TRAIT' }
  /** 命运树「三选一」已选定。 */
  | { type: 'TREE_CHOICE_RESOLVED'; source: 'E2' | 'E3'; kind: 'EQUIP' | 'TRAIT'; selected: string }
  /** 装备变化：装备/替换/强化时统一触发，供 HUD 刷新装备面板。 */
  | { type: 'EQUIP_CHANGED'; slot: EquipSlot; item: EquipItem; prevBaseStat?: number }
  /** 玩家踩入沙坑（第2章 Boss 房）：当前格 entityId，移动 AP 已加 1。 */
  | { type: 'SAND_PIT_STEPPED'; entityId: string }
  /** 灵气怪逃跑后在离开的原格留下陷阱（CH2 沙坑 / CH3 冰面）：variantId 用于战报展示。 */
  | { type: 'ANIMA_TRAP_SPAWNED'; entityId: string; entityType: 'SAND_PIT' | 'ICE_TILE'; pos: Coord; variantId: string; duration: number }
  /** 灵气炎魂（CH4）被击杀时在十字 4 格生成熔岩（跳过被占格）。 */
  | { type: 'ANIMA_DEATH_LAVA'; tiles: Coord[]; duration: number }
  /** 灵气幻象（CH5）被击杀时给玩家随机 Buff。 */
  | { type: 'ANIMA_BUFF_GRANTED'; buffId: string }
  /** 灵气幻象（CH5）被击杀时给玩家随机 Debuff。 */
  | { type: 'ANIMA_DEBUFF_APPLIED'; debuffId: string }
  /** 冰墙被玩家攻击破坏（第3章 Boss 房）：emit 后玩家 +anima。 */
  | { type: 'ICE_WALL_BROKEN'; entityId: string; anima: number }
  /** 玩家踩入熔岩地块受伤（每回合开始结算）。 */
  | { type: 'LAVA_TILE_DAMAGED'; entityId: string; damage: number }
  /** 熔岩领主阶段一喷发预警：以玩家当前格为中心的 4×4 区域，下个 Boss 回合将生成熔岩。 */
  | { type: 'ERUPTION_TELEGRAPHED'; cells: Coord[] }
  /** 熔岩领主阶段一喷发结算：在上回合标记的 cells 上生成 LAVA_TILE（存续 duration 回合）。 */
  | { type: 'ERUPTION_RESOLVED'; tiles: Coord[]; duration: number }
  /** 熔岩领主熔核爆裂：灼烧层数达阈值时清空灼烧并造成真实伤害，周围生成 LAVA_TILE。 */
  | { type: 'BURN_BURST'; damage: number; hp: number; tiles: Coord[] }
  /** 熔岩领主阶段二定向熔岩潮汐：沿 direction 推进第 rowIndex 排永久 LAVA_TILE。 */
  | { type: 'LAVA_TIDE_ROW_SPAWNED'; tiles: Coord[]; direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'; rowIndex: number }
  /** 熔岩领主熔岩锁链：玩家被拉近一格并附加灼烧（burnTotal 为叠加后的总灼烧层数）。 */
  | { type: 'LAVA_CHAIN_PULL'; from: Coord; to: Coord; burnTotal: number }
  /** 命运守卫行为镜像生成（第5章 FateGuardian HP≤50%，hp=玩家HP×0.5、attack=玩家attack×0.5）。 */
  | { type: 'MIRROR_SPAWNED'; mirrorId: string; pos: Coord }
  /** 命运镜像被击杀（不掉落，不影响传送门生成判定）。 */
  | { type: 'MIRROR_KILLED'; mirrorId: string }
  /** 行为镜像：记录玩家本回合行为，下个怪物回合执行。 */
  | { type: 'MIRROR_BEHAVIOR_QUEUED'; mirrorId: string; action: 'ATTACK' | 'MOVE' | 'IDLE'; distance: number }
  /** 行为镜像：复制玩家移动（朝玩家方向最短路径推进 distance 格）。 */
  | { type: 'MIRROR_MOVED'; mirrorId: string; from: Coord; to: Coord }
  /** 行为镜像：复制玩家攻击（hit=false 时为曼哈顿 > 2 的空挥）。 */
  | { type: 'MIRROR_ATTACKED'; mirrorId: string; hit: boolean; damage: number; hp: number }
  /** 行为镜像：玩家上回合待机 → 镜像本回合获得 1 层护盾。 */
  | { type: 'MIRROR_SHIELDED'; mirrorId: string }
  /** 行为镜像：护盾吸收一次伤害（damage=0 不扣 HP）。 */
  | { type: 'MIRROR_SHIELD_ABSORBED'; mirrorId: string }
  /** 命运守卫狂暴态「改写命运」预告：从 5 池抽 3 个事件供玩家弃 1。 */
  | { type: 'DESTINY_REWRITE_OFFERED'; drawn: [number, number, number] }
  /** 改写命运：玩家选定弃掉的索引（0/1/2）。 */
  | { type: 'DESTINY_REWRITE_CHOSEN'; removedIndex: 0 | 1 | 2 }
  /** 改写命运结算汇总：本次实际执行的事件编号（按 E5→E4→E3→E1→E2 顺序）。 */
  | { type: 'DESTINY_REWRITE_RESOLVED'; executed: number[] }
  /** 改写命运 E1：Boss 回血 amount，结算后 boss.hp。 */
  | { type: 'DESTINY_HEAL'; amount: number; bossHp: number }
  /** 改写命运 E2：Boss 加伤害 pct%，buff 失效的怪物回合。 */
  | { type: 'DESTINY_ATK_BUFF'; pct: number; expiresAtTurn: number }
  /** 改写命运 E3：直接对玩家造成 damage 真实伤害，hp 为结算后玩家 HP。 */
  | { type: 'DESTINY_DIRECT_DAMAGE'; damage: number; hp: number }
  /** 改写命运 E4：以 Boss 当前格为中心 5×5 爆炸；damage>0 时命中玩家、=0 时玩家在范围外（仅供渲染）。 */
  | { type: 'DESTINY_5X5_EXPLODED'; center: Coord; damage: number; hp: number }
  /** 改写命运 E5：下个玩家回合 AP 减半，nextTurnAp 为实际生效后的 AP。 */
  | { type: 'DESTINY_AP_LOCKED'; nextTurnAp: number }
  /** 命运守卫预言标记（第5章）：center 为标记的玩家当前格，下个 Boss 回合该 3×3 爆炸。 */
  | { type: 'PROPHECY_MARKED'; center: Coord }
  /** 命运守卫预言结算（第5章）：center 为爆炸中心（3×3），无论是否命中均 emit 供渲染。 */
  | { type: 'PROPHECY_RESOLVED'; center: Coord }
  /** 冰霜巨人冰面生成（第3章）：本次铺出的冰面格子 + 存在回合数。 */
  | { type: 'ICE_TIDE_SPAWNED'; tiles: Coord[]; duration: number }
  /** 冰霜巨人寒气层数变化（第3章）：普通攻击命中玩家后 emit；stacks 为本次叠加后的层数（触发冻结时归零为 0）。 */
  | { type: 'CHILL_STACK_APPLIED'; stacks: number }
  /** 冰霜巨人冻结玩家（第3章，寒气叠满）：wallEntityIds 为同时生成的 FREEZE_WALL 实体 id。MOVE 被阻断直至解除。 */
  | { type: 'PLAYER_FROZEN'; wallEntityIds: string[] }
  /** 冰霜巨人解除冻结（第3章，玩家主动攻击 FROST_GIANT_FREEZE_ATTACKS_TO_BREAK 次后）：FREEZE_WALL 同步移除。 */
  | { type: 'PLAYER_UNFROZEN' }
  /** 冰霜巨人「冰霜重击」结算（第3章，每 FROST_GIANT_HEAVY_STRIKE_INTERVAL 回合）：以 boss 自身为中心的 AOE，半径 radius。 */
  | { type: 'FROST_HEAVY_STRIKE_RESOLVED'; bossId: string; center: Coord; radius: number }
  /** 玩家被击退（冰霜重击命中后）：to 为最终落点（若落在冰面上则已结算滑行），slid 标记是否发生了滑行。 */
  | { type: 'KNOCKBACK'; entityId: 'PLAYER'; from: Coord; to: Coord; slid: boolean }
  /** ICE_WALL/FREEZE_WALL 被击碎（冰霜重击或狂暴冲锋命中）：shatteredCells 为新生成的 SHATTERED_ICE 格子列表。 */
  | { type: 'ICE_WALL_SHATTERED'; entityId: string; shatteredCells: Coord[] }
  /** 冰霜巨人狂暴冲锋预警（第3章，狂暴后每 FROST_GIANT_HEAVY_STRIKE_INTERVAL 回合）：本回合不攻击不移动，
   *  dir 为冲锋方向，path 为中心线路径（下回合沿此执行，三格宽车道 = path 格 ± 垂直方向 1 格）。 */
  | { type: 'CHARGE_TELEGRAPHED'; bossId: string; dir: Coord; path: Coord[] }
  /** 冰霜巨人狂暴冲锋执行结算（第3章）：result 标记本次冲锋的结果类型。 */
  | { type: 'CHARGE_EXECUTED'; bossId: string; from: Coord; to: Coord; result: 'WALL_SHATTERED' | 'PLAYER_HIT' | 'ICE_WALL_SPAWNED' | 'NONE' }
  /** 冰霜巨人狂暴冲锋未命中时，在随机空格新生成一个 ICE_WALL（第3章）。 */
  | { type: 'ICE_WALL_SPAWNED'; entityId: string; pos: Coord }
  /** 流沙巨蝎流沙扩张（第2章）：本次刷出的动态沙坑格子 + 存在回合数。 */
  | { type: 'SAND_TIDE_SPAWNED'; tiles: Coord[]; duration: number }
  /** 流沙巨蝎沙暴（第2章，潜地时触发）：本次随机覆盖的格子；命中玩家所在格时额外 emit SANDSTORM_HIT。 */
  | { type: 'SANDSTORM_SPAWNED'; tiles: Coord[] }
  /** 流沙巨蝎沙暴命中玩家：真实伤害（无视护甲）。 */
  | { type: 'SANDSTORM_HIT'; damage: number; hp: number }
  /** Boss 击杀掉落：拾取一件 Boss 遗物（局内生效，死亡清空）。 */
  | { type: 'RELIC_PICKUP'; relicId: RelicId; source: string }
  /** Boss 击杀掉落：拾取一张命运词条卷轴（玩家可在 HUD 主动使用）。 */
  | { type: 'SCROLL_PICKUP'; source: string }
  /** Boss 击杀掉落：拾取若干命运碎片（独立 10% 判定，按章节缩放）。 */
  | { type: 'SHARDS_PICKUP'; amount: number; source: string }
  /** 首次解锁 Boss 遗物图鉴（写入 PveMeta.codex.relics，影响后续掉落概率）。 */
  | { type: 'CODEX_RELIC_UNLOCKED'; relicId: RelicId }
  /** 玩家使用命运词条卷轴：三选一弹窗触发，options 为待选 strengthen_* 词条 id。 */
  | { type: 'SCROLL_OFFER'; options: string[] }
  /** 玩家选定卷轴词条：已 append 到 classTraits。 */
  | { type: 'SCROLL_RESOLVED'; selected: string }
  /** 营地遗物宝箱开启结果：success=true 表示获得遗物；false 表示未中（已扣资源）；refunded=true 表示遗物已持有自动转补偿。 */
  | { type: 'RELIC_CHEST_OPENED'; success: boolean; relicId?: RelicId; refunded?: boolean; refundGold?: number; refundDiamond?: number }
  /** 遗物 hook 触发提示（例：永冻之核冰冻、熔火之心反弹），供战报展示。 */
  | { type: 'RELIC_TRIGGERED'; relicId: RelicId; detail?: string }
  /** C4 VOID_WORM 双生复活：首次被击杀时原地复活到 50% HP，emit 供战报/UI 展示。 */
  | { type: 'ELITE_REVIVE'; monsterId: string; hp: number }
  /** C3 FIRE_ELEMENTAL 爆裂自爆：死亡时对 2 格内玩家造成等攻击力真实伤害（无视护甲）。 */
  | { type: 'ELITE_EXPLODE'; monsterId: string; pos: Coord; damage: number; hp: number }
  /** C2 FROST_SPRITE 寒冰光环：存活且在玩家 3 格内时每回合开始 AP -1。 */
  | { type: 'FROST_AURA_DRAINED'; ap: number }
  /** 远程攻击（range≥2）被掩体地形遮挡、打不出（Phase 2 LOS，AC-MT-4）。 */
  | { type: 'ATTACK_BLOCKED_BY_COVER'; attackerId: string; targetId: string; blockerPos: Coord };

/** core 纯函数统一返回：变更后的状态 + 本次产生的事件序列。 */
export interface ApplyResult {
  state: ExpeditionState;
  events: PveEvent[];
}

// ── 局外元进度（AC-20，远征间持久化） ────────────────────

/** 图鉴：已见过的怪物类型 / 已获得的装备槽位 / 已解锁的 Boss 遗物。 */
export interface PveCodex {
  /** MonsterType 字符串集合（'NORMAL'/'ANIMA'/'ELITE'/'BOSS'）。 */
  monsters: string[];
  /** EquipSlot 字符串集合（'WEAPON'/'ARMOR' 等）。 */
  equipment: string[];
  /** 已解锁过的 Boss 遗物 id 列表（首次拾取后写入，影响后续掉落概率 +RELIC_CODEX_BONUS）。 */
  relics?: RelicId[];
}

/**
 * PVE 局外元进度（design §2.1：死亡后保留的局外资产）。
 * 存储于 `users` 云文档，不属于 `ExpeditionState`。
 */
export interface PveMeta {
  /** 当前命运碎片余额（由结算云函数累加，此处为只读快照）。 */
  destinyShards: number;
  /** 当前钻石余额（用户级累计货币，由结算云函数累加，此处为只读快照）。 */
  diamond: number;
  /** 当前远征体力；新远征消耗 20，继续存档不消耗。 */
  stamina?: number;
  /** 体力上限，当前固定为 60。 */
  staminaMax?: number;
  /** 未满体力时下一点恢复的服务端时间戳；满体力时为 null。 */
  staminaNextRecoveryAt?: number | null;
  /** 下次新远征实际消耗；首次为 0，之后为 20。 */
  nextRunCost?: number;
  /** 已扣费并预留种子、但尚未写入首层存档的远征。 */
  hasPendingRun?: boolean;
  /** 历史到达的最高楼层，用于大厅身份卡与排行榜。 */
  highestFloor?: number;
  /** 已解锁的成就 id 列表（AchievementId[]）。 */
  achievements: string[];
  /** 图鉴：已见过的怪物/装备类型。 */
  codex: PveCodex;
  /** 已解锁的命运树节点 id 列表（如 'A1'/'B2'/'E3'，见 PveConstants.DESTINY_TREE_NODES）。 */
  unlockedTreeNodes: string[];
  tutorialCompleted?: boolean;
}
