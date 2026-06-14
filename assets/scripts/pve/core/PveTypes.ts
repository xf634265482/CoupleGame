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
  /** 沙虫女王潜地状态：true 时免疫玩家攻击，下一回合冒出并双倍伤害（bossId=SANDWORM_QUEEN）。 */
  isBurrowed?: boolean;
  /** 怪物变体 id（NORMAL/ANIMA/ELITE 专属行为差异，如 'GOBLIN_ARCHER'/'FROST_GOBLIN'/'SPIRIT_RAT'）。 */
  variantId?: string;
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

export interface EquipItem {
  id: string;
  slot: EquipSlot;
  quality: EquipQuality;
  name: string;
  baseStat: number;
  trait?: string; // 随机词条 id
}

export type Equipment = Partial<Record<EquipSlot, EquipItem>>;

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
  /** 已通关的最大章节号（每章 Boss 击败后更新，用于觉醒条件判定）。 */
  maxChapterCleared?: number;
  /** 命运碎片成长树效果快照（由 startExpedition 时根据 PveMeta.unlockedTreeNodes 计算并固化，
   *  随存档持久化，保证云端复算时无需重新读取 PveMeta，AC-13）。 */
  treeBonuses?: DestinyTreeBonuses;
}

/** 命运碎片成长树效果快照（DestinyTreeSystem.getTreeBonuses 的返回类型）。 */
export interface DestinyTreeBonuses {
  maxHpBonus: number;
  deathGoldRetentionPct: number;
  attackBonus: number;
  apDiceBonus: number;
  fragmentBonus: number;
  startGoldBonus: number;
  chestGoldBonusPct: number;
  blacksmithDiscount: number;
  startAnimaBonus: number;
  strengthenThresholdMult: number;
  animaGainBonusPct: number;
  hasEquipChoice: boolean;
  hasTraitChoice: boolean;
}

/** 命运树「三选一」待选项（E2 装备 / E3 强化词条），由 startExpedition 生成，
 *  待玩家通过 resolveTreeChoice 选定后从队列中移除。 */
export interface PendingTreeChoice {
  source: 'E2' | 'E3';
  kind: 'EQUIP' | 'TRAIT';
  equipOptions?: EquipItem[];
  traitOptions?: string[];
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
  /** 觉醒·狂热(awakened_frenzy)：击杀后下一次攻击必定暴击+回血，触发后置 false。 */
  frenzyPending?: boolean;
  /** 觉醒·影袭(awakened_shadow_strike)：本回合已触发的背刺次数（上限2），回合结束时重置为0。 */
  shadowStrikeCount?: number;
  /** 熔岩领主第二阶段标记（Boss HP/maxHp ≤ CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO 后置 true，不可逆）。 */
  lavaLordPhase2?: boolean;
  /** 熔岩潮汐回合计数器：phase2 期间每回合 +1，达到 CHAPTER4_LAVA_TIDE_INTERVAL 时刷新潮汐并归零。 */
  lavaTideCounter?: number;
  /** 复仇类词条（vengeance/retreat_shot/retribution）：受到怪物攻击后置 true，下次主动攻击消耗并 +5 伤害。 */
  vengeanceReady?: boolean;
  /** 进阶 oneShot（final_charge/last_arrow/desperate_gambit）：本层首次 HP≤30% 时触发 AP+3，触发后置 false（默认 true）。 */
  finalChargeAvailable?: boolean;
  /** 命运守卫待结算预言：标记回合记录中心格，下个 Boss 回合该 3×3 区域爆炸后清空。 */
  fateProphecy?: { center: Coord };
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
  /** 命运树「三选一」待选队列（E2/E3 解锁后产生，先进先出，UI 弹窗逐个处理）。 */
  pendingTreeChoices?: PendingTreeChoice[];
}

// ── 事件（core 纯函数返回，供 Controller 回放动画） ────
export type PveEvent =
  | { type: 'MOVE'; entityId: 'PLAYER' | string; from: Coord; to: Coord; apLeft: number }
  | { type: 'REVEAL'; cells: Coord[] }
  | { type: 'ATTACK'; attackerId: string; targetId: string; damage: number; targetHp: number }
  | { type: 'KILL'; monsterId: string; monsterType: MonsterType }
  | { type: 'LOOT'; gold?: number; anima?: number; equip?: EquipItem; fragmentPair?: AdvancableClass[]; source: string }
  /** 营地变卖装备（AC-19 装备整理）。 */
  | { type: 'SELL_EQUIP'; slot: EquipSlot; itemName: string; gold: number }
  | { type: 'PICK_KEY'; entityId: string }
  | { type: 'OPEN_CHEST'; entityId: string }
  | { type: 'ANIMA_STRENGTHEN'; choices: string[] } // 触发 3 选 1（待玩家选择）
  | { type: 'PLAYER_DAMAGED'; damage: number; hp: number; sourceId: string }
  | { type: 'TURN_END'; turn: number }
  /** 新回合开始掷骰 → AP（AC-2）：dice ∈ [1,6]，ap = 8 + dice ∈ [9,14]。 */
  | { type: 'AP_ROLLED'; turn: number; dice: number; ap: number }
  /** Boss 阵亡 + 持有钥匙时在 Boss 位置浮现传送门（玩家需踏入并交互才通关，design AC-9）。 */
  | { type: 'PORTAL_SPAWNED'; entityId: string; pos: Coord }
  /** 神像祝福：永久 +1 maxHp（M1 占位数值，待设计师定稿）。 */
  | { type: 'IDOL_BLESSING'; entityId: string; maxHpBonus: number }
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
  | { type: 'SHOP_BUY'; itemId: string; cost: number; effect: string }
  /** 成就解锁（Controller 合成，不由 core 纯函数产生；供 _playEvents 展示 toast）。 */
  | { type: 'ACHIEVEMENT_UNLOCKED'; achievementId: string; name: string }
  | { type: 'FLOOR_CLEARED'; floor: number }
  | { type: 'PLAYER_DEAD' }
  /** 沙虫女王潜入地下（免疫攻击，下回合冒出）。 */
  | { type: 'BOSS_BURROWED'; bossId: string }
  /** 沙虫女王从地下冒出（pos 为落点）。 */
  | { type: 'BOSS_EMERGED'; bossId: string; pos: Coord }
  /** 熔岩领主施加灼烧：totalRemaining 为剩余总灼烧伤害点数。 */
  | { type: 'BURN_APPLIED'; bossId: string; totalRemaining: number }
  /** 移动AP惩罚施加（冰霜哥布林命中 / 哥布林酋长重击AOE）：rounds 为本次叠加的持续回合数。 */
  | { type: 'MOVE_PENALTY_APPLIED'; rounds: number }
  /** 灼烧状态施加（赤炎哥布林命中）：rounds 为本次叠加的持续回合数。 */
  | { type: 'FIRE_BURN_APPLIED'; rounds: number }
  /** 灼烧 tick：每回合开始时 -1 HP。 */
  | { type: 'BURN_TICK'; damage: number; hp: number }
  /** 祭坛使用：消耗后随机获得灵气。 */
  | { type: 'ALTAR_USED'; entityId: string; anima: number }
  /** 铁匠强化：+1 基础属性（消耗金币，不消耗实体）。 */
  | { type: 'BLACKSMITH_UPGRADE'; entityId: string; slot: EquipSlot; newStat: number }
  /** 铁匠洗炼：随机替换装备词条（消耗金币，不消耗实体）。 */
  | { type: 'BLACKSMITH_REROLL'; entityId: string; slot: EquipSlot; newTrait: string }
  /** 哥布林酋长蓄力重击实际结算：center 为本次重击结算时 boss 所在格（用于 UI 标识实际命中区域）。 */
  | { type: 'HEAVY_STRIKE_RESOLVED'; bossId: string; center: Coord }
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
  /** 冰墙被玩家攻击破坏（第3章 Boss 房）：emit 后玩家 +anima。 */
  | { type: 'ICE_WALL_BROKEN'; entityId: string; anima: number }
  /** 熔岩潮汐生成（第4章 LavaLord phase2）：本次刷出的格子列表 + 存在回合数。 */
  | { type: 'LAVA_TIDE_SPAWNED'; tiles: Coord[]; duration: number }
  /** 玩家踩入熔岩地块受伤（每回合开始结算）。 */
  | { type: 'LAVA_TILE_DAMAGED'; entityId: string; damage: number }
  /** 命运守望者镜像生成（第5章 FateGuardian HP≤33%）。 */
  | { type: 'MIRROR_SPAWNED'; mirrorId: string; pos: Coord }
  /** 命运镜像被击杀（不掉落，不影响传送门生成判定）。 */
  | { type: 'MIRROR_KILLED'; mirrorId: string }
  /** 命运守卫预言标记（第5章）：center 为标记的玩家当前格，下个 Boss 回合该 3×3 爆炸。 */
  | { type: 'PROPHECY_MARKED'; center: Coord }
  /** 命运守卫预言结算（第5章）：center 为爆炸中心（3×3），无论是否命中均 emit 供渲染。 */
  | { type: 'PROPHECY_RESOLVED'; center: Coord }
  /** 冰霜巨人冰面生成（第3章）：本次铺出的冰面格子 + 存在回合数。 */
  | { type: 'ICE_TIDE_SPAWNED'; tiles: Coord[]; duration: number }
  /** 沙虫女王流沙扩张（第2章）：本次刷出的动态沙坑格子 + 存在回合数。 */
  | { type: 'SAND_TIDE_SPAWNED'; tiles: Coord[]; duration: number };

/** core 纯函数统一返回：变更后的状态 + 本次产生的事件序列。 */
export interface ApplyResult {
  state: ExpeditionState;
  events: PveEvent[];
}

// ── 局外元进度（AC-20，远征间持久化） ────────────────────

/** 图鉴：已见过的怪物类型 / 已获得的装备槽位。 */
export interface PveCodex {
  /** MonsterType 字符串集合（'NORMAL'/'ANIMA'/'ELITE'/'BOSS'）。 */
  monsters: string[];
  /** EquipSlot 字符串集合（'WEAPON'/'ARMOR' 等）。 */
  equipment: string[];
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
  /** 已解锁的成就 id 列表（AchievementId[]）。 */
  achievements: string[];
  /** 图鉴：已见过的怪物/装备类型。 */
  codex: PveCodex;
  /** 已解锁的命运树节点 id 列表（如 'A1'/'B2'/'E3'，见 PveConstants.DESTINY_TREE_NODES）。 */
  unlockedTreeNodes: string[];
}
