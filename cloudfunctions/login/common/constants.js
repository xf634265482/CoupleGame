/**
 * 与 shared/protocol.ts 对齐的游戏常量
 */
module.exports = {
  BOARD_SIZE: 58,
  DICE_MAX: 7,
  TARGET_LAPS: 2,
  /** 行动回合数：每位在场玩家各掷一次骰为 1 回合，满此数结算 */
  TARGET_ACTION_ROUNDS: 10,
  ROOM_EXPIRE_MS: 5 * 60 * 1000,
  MATCH_WAIT_MS: 30 * 1000,
  BLUFF_TURN_TIMEOUT_MS: 30 * 1000,
  DIAMOND_CELL_REWARD: 5,
  BLUFF_GOLD_REWARDS: {
    2: [800],
    3: [800, 500],
    4: [800, 500, 200],
  },
  COLLECTIONS: {
    USERS: 'users',
    ROOMS: 'rooms',
    GAMES: 'games',
    MATCH_QUEUE: 'match_queue',
    BLUFF_PRIVATE: 'bluff_private',
  },
};
