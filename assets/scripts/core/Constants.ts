/** 微信云开发环境 ID（与 config/wechat.local.json 一致） */
export const CLOUD_ENV_ID = 'cloud1-d9gsn7mh609335539';

export const BOARD_SIZE = 58;

/** 吹牛开牌/结束结果弹窗倒计时（秒，整秒显示） */
export const BLUFF_RESULT_PROMPT_SEC = 12;

/** 进入吹牛小游戏提示倒计时（秒，整秒显示） */
export const MINIGAME_ENTER_PROMPT_SEC = 5;
export const DICE_MAX = 7;
export const TARGET_LAPS = 2;
/** 行动回合：每位在场玩家各掷一次骰为 1 回合 */
export const TARGET_ACTION_ROUNDS = 10;
export const ROOM_EXPIRE_MS = 5 * 60 * 1000;
export const MATCH_WAIT_MS = 30 * 1000;

/** Cocos 场景名（需在构建前于编辑器中创建对应 scene） */
export const SCENE = {
  BOOTSTRAP: 'bootstrap',
  LOBBY: 'lobby',
  BOARD: 'board',
  MINIGAME_BLUFF: 'minigame_bluff',
  SETTLEMENT: 'settlement',
} as const;
