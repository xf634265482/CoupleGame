/** 微信云开发环境 ID（与 config/wechat.local.json 一致） */
export const CLOUD_ENV_ID = 'cloud1-d9gsn7mh609335539';

/** 棋盘总格数 → AC-1（与 shared/protocol.ts 一致） */
export const BOARD_SIZE = 75;

/** 骰子 1～9；额外投骰由双骰子道具提供 */
export const DICE_MAX = 9;

/** @deprecated 血量淘汰版不以圈数决胜 */
export const TARGET_LAPS = 2;

/** 生存棋盘以最后存活者获胜；行动回合上限仅保留为极端兜底 */
export const TARGET_ACTION_ROUNDS = 999;
export const DEVELOPMENT_END_ROUND = 10;
export const CONTEST_END_ROUND = 18;
export const SUPPLY_CELL_COUNT = 3;
export const GOLD_CELL_STOCK = 400;
export const DIAMOND_CELL_STOCK = 6;

/** 玩家初始 HP → AC-2 */
export const INITIAL_HP = 10;

export const MIN_ATTACK_DAMAGE = 0.5;
export const RESOURCE_VALUE_DIAMOND_MULTIPLIER = 300;
export const LUCKY_DUPLICATE_EQUIP_GOLD = 600;

/** 幸运格 FAST：每格 0.2s */
export const LUCKY_FAST_INTERVAL_MS = 200;
/** 幸运格 SLOW：减速总时长 2s */
export const LUCKY_SLOW_DURATION_MS = 2000;
export const LUCKY_SLOW_INTERVAL_START_MS = 200;
export const LUCKY_SLOW_INTERVAL_STEP_MS = 100;

export const WEAPON_STATS = {
  SWORD: { range: 2, damage: 1 },
  GUN: { range: 4, damage: 1.5 },
  ROCKET: { range: 7, damage: 2 },
} as const;

export const ARMOR_REDUCTION = {
  HELMET: 0.5,
  ARMOR: 1,
} as const;

export const GOLD_SHOP_PRICES = {
  SWORD: 1200,
  HELMET: 1000,
  MARCHING_SHOES: 900,
  DOUBLE_DICE: 700,
  TRAP: 500,
  IMMUNITY_POTION: 400,
} as const;

export const LEGENDARY_SHOP_PRICES = {
  GUN: 8,
  ARMOR: 6,
  MEDKIT: 4,
} as const;

export const FINAL_WEAPON_UPGRADE_GOLD = 2000;
export const FINAL_DIVINE_STRIKE_DIAMOND = 5;

export const NEUTRAL_CREATURE_HP = 6;
export const NEUTRAL_KILL_GOLD = 2000;
export const ROCKET_DROP_CHANCE = 0.1;

export const DIAMOND_CELL_REWARD = 5;
export const NORMAL_SUPPLY_CRATE = {
  gold: 400,
  diamond: 1,
  medkit: 1,
  doubleDice: 1,
} as const;
export const LARGE_SUPPLY_CRATE = {
  gold: 1200,
  diamond: 4,
  weapon: 'GUN',
} as const;

export const ROOM_EXPIRE_MS = 5 * 60 * 1000;
export const MATCH_WAIT_MS = 30 * 1000;

/** 启动耗时埋点开关（→ PerfMarks，AC-502）：dev 调试用，正式发布前关闭。 */
export const PERF_TRACE_ENABLED = true;

/** Cocos 场景名（需在构建前于编辑器中创建对应 scene） */
export const SCENE = {
  BOOTSTRAP: 'bootstrap',
  LOBBY: 'lobby',
  BOARD: 'board',
  SETTLEMENT: 'settlement',
  PVE_EXPEDITION: 'pve_expedition',
  DESTINY_TREE: 'destiny_tree',
} as const;
