/**
 * 游戏共享常量（PVE「命运远征」+ 共享基础设施）
 * PVP 棋盘对战已于 2026-06-29 移除。
 */
module.exports = {
  COLLECTIONS: {
    USERS: 'users',
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
