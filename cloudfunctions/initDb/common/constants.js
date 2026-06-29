/**
 * 与 shared/protocol.ts 对齐的游戏常量
 * 血量淘汰玩法改版：specs/260529-combat-board-game-rework/
 */
module.exports = {
  BOARD_SIZE: 75,
  DICE_MAX: 9,
  /** 每个玩家回合超时（毫秒）→ 35 秒 */
  TURN_TIMEOUT_MS: 35 * 1000,
  /** @deprecated 血量淘汰版不以圈数决胜 */
  TARGET_LAPS: 2,
  /** 生存棋盘以最后存活者获胜；行动回合上限仅保留为极端兜底 */
  TARGET_ACTION_ROUNDS: 999,
  DEVELOPMENT_END_ROUND: 10,
  CONTEST_END_ROUND: 18,
  FINAL_SHOP_COUNT: 3,
  FINAL_WEAPON_UPGRADE_GOLD: 2000,
  FINAL_DIVINE_STRIKE_DIAMOND: 5,
  FINAL_DIVINE_STRIKE_DAMAGE: 2,
  SUPPLY_CELL_COUNT: 3,
  GOLD_CELL_STOCK: 400,
  DIAMOND_CELL_STOCK: 6,
  NORMAL_SUPPLY_CRATE: {
    gold: 400,
    diamond: 1,
    medkit: 1,
    doubleDice: 1,
  },
  LARGE_SUPPLY_CRATE: {
    gold: 1200,
    diamond: 4,
    weapon: 'GUN',
  },
  KILL_REWARD_GOLD_FLAT: 500,
  KILL_REWARD_DIAMOND_FLAT: 2,
  BOT_FILL_FIRST_DELAY_MS: 12 * 1000,
  BOT_FILL_INTERVAL_MS: 7 * 1000,
  /** 单个 AI 行动回合最短展示时长（毫秒） */
  BOT_TURN_MIN_MS: 8 * 1000,
  /** AI 两次操作之间的间隔（毫秒） */
  BOT_STEP_GAP_MS: 2 * 1000,
  BOT_TURN_MAX_STEPS: 8,
  INITIAL_HP: 10,
  MIN_ATTACK_DAMAGE: 0.5,
  RESOURCE_VALUE_DIAMOND_MULTIPLIER: 300,
  LUCKY_DUPLICATE_EQUIP_GOLD: 600,
  /** 幸运格 FAST：每格间隔 ms */
  LUCKY_FAST_INTERVAL_MS: 200,
  /** 幸运格 SLOW：总减速时长 ms（缩短，避免“停止”手感过慢） */
  LUCKY_SLOW_DURATION_MS: 900,
  /** 幸运格 SLOW：首格间隔 ms，之后每格 +100ms */
  LUCKY_SLOW_INTERVAL_START_MS: 200,
  LUCKY_SLOW_INTERVAL_STEP_MS: 100,
  WEAPON_STATS: {
    SWORD: { range: 2, damage: 1 },
    GUN: { range: 4, damage: 1.5 },
    ROCKET: { range: 7, damage: 2 },
  },
  ARMOR_REDUCTION: {
    HELMET: 0.5,
    ARMOR: 1,
  },
  GOLD_SHOP_PRICES: {
    SWORD: 1200,
    MARCHING_SHOES: 900,
    DOUBLE_DICE: 700,
    TRAP: 500,
    IMMUNITY_POTION: 400,
  },
  RAPID_SHOES_MERGE_COUNT: 3,
  LEGENDARY_SHOP_PRICES: {
    GUN: 8,
    MEDKIT: 4,
  },
  NEUTRAL_CREATURE_HP: 6,
  NEUTRAL_KILL_GOLD: 2000,
  NEUTRAL_VAMPIRE_STONE_CHANCE: 0.15,
  ROCKET_DROP_CHANCE: 0.1,
  ROOM_EXPIRE_MS: 5 * 60 * 1000,
  MATCH_WAIT_MS: 30 * 1000,
  DIAMOND_CELL_REWARD: 5,
  COLLECTIONS: {
    USERS: 'users',
    ROOMS: 'rooms',
    GAMES: 'games',
    MATCH_QUEUE: 'match_queue',
    PVE_SAVES: 'pve_saves',
    PVE_BALANCE_CONFIGS: 'pve_balance_configs',
    ADMIN_ACCOUNTS: 'admin_accounts',
    ADMIN_SESSIONS: 'admin_sessions',
    ADMIN_LOGS: 'admin_logs',
  },

  // ── PVE「命运远征」（specs/260608-pve-destiny-expedition/） ──────
  // 章节结构需与 assets/scripts/pve/core/PveConstants.ts 保持一致（→ AC-13）
  PVE_FLOORS_PER_CHAPTER: 7,
  PVE_TOTAL_FLOORS: 35,
  /**
   * 结算奖励（钻石/命运碎片）由云端按"已通关层数 + 已击杀 Boss 数"纯服务端计算，
   * 不信任客户端上报数值（→ AC-14, design ddl-sql.md §3）。
   */
  PVE_SETTLE_REWARD: {
    DIAMOND_PER_FLOOR: 1,
    DIAMOND_PER_BOSS_FLOOR: 3,
    SHARD_PER_FLOOR: 1,
    SHARD_PER_BOSS_FLOOR: 2,
  },

  // ── PVE 难度档（design 260628-progression-pacing-v3 §5，→ AC-P3-6/7/9） ────
  /** 难度档枚举值（开发者可见，与客户端 DIFFICULTY_TIER 一一对应）。 */
  PVE_DIFFICULTY: {
    NORMAL:    'NORMAL',
    HARD:      'HARD',
    NIGHTMARE: 'NIGHTMARE',
    ABYSS:     'ABYSS',
    INFERNO:   'INFERNO',
  },
  /**
   * 难度档解锁顺序（索引即数值级别，用于排行榜 pveHighestTierLevel 字段排序）。
   * 解锁条件：已通关前一档第 35 层；NORMAL 默认开放。
   */
  PVE_DIFFICULTY_ORDER: ['NORMAL', 'HARD', 'NIGHTMARE', 'ABYSS', 'INFERNO'],
  /**
   * 难度倍率（HP/伤害 作用于怪物；命运碎片 作用于结算产出）。
   * 与 destiny-tree-v2 §3 数值一致；客户端 DIFFICULTY_MULTIPLIERS 同步镜像此表。
   */
  PVE_DIFFICULTY_MULTIPLIERS: {
    NORMAL:    { hpMult: 1.00, atkMult: 1.00, shardMult: 1.00 },
    HARD:      { hpMult: 1.10, atkMult: 1.05, shardMult: 1.15 },
    NIGHTMARE: { hpMult: 1.20, atkMult: 1.10, shardMult: 1.30 },
    ABYSS:     { hpMult: 1.35, atkMult: 1.18, shardMult: 1.50 },
    INFERNO:   { hpMult: 1.50, atkMult: 1.25, shardMult: 1.75 },
  },
};
