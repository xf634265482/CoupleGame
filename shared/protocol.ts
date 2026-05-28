/**
 * CoupleGame 客户端 ↔ 云函数 共享协议类型
 * 参考：plan.md §4、design.md §6
 *
 * 云函数为 JavaScript 时可对照本文件实现；Cocos 客户端直接 import。
 */

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 棋盘总格数 → AC-6 */
export const BOARD_SIZE = 58;

/** 骰子面数：1～6 正常步数，7 再掷一次 */
export const DICE_MAX = 7;

/** 完成圈数触发结算 → AC-11 */
export const TARGET_LAPS = 2;

/** 行动回合上限：每位在场玩家各掷一次骰为 1 回合 → AC-11 */
export const TARGET_ACTION_ROUNDS = 10;

/** 好友房未开始自动解散 → AC-4 */
export const ROOM_EXPIRE_MS = 5 * 60 * 1000;

/** 随机匹配最长等待 → AC-5 */
export const MATCH_WAIT_MS = 30 * 1000;

/** 吹牛叫点回合超时（毫秒）→ AC-10 */
export const BLUFF_TURN_TIMEOUT_MS = 30 * 1000;

/** 钻石格奖励 → AC-9 */
export const DIAMOND_CELL_REWARD = 5;

/** 吹牛局内金币奖励 [1st, 2nd, 3rd] → AC-10 */
export const BLUFF_GOLD_REWARDS: Readonly<Record<number, number[]>> = {
  2: [800],
  3: [800, 500],
  4: [800, 500, 200],
};

// ---------------------------------------------------------------------------
// 枚举 / 字面量联合
// ---------------------------------------------------------------------------

/** 对局阶段 */
export type GamePhase = 'BOARD' | 'MINIGAME_BLUFF' | 'SETTLED';

/** 格子类型 → AC-6 */
export type CellType = 'NORMAL' | 'GOLD' | 'DIAMOND' | 'EVENT' | 'MINIGAME';

/** 金币格子子类型 → AC-8 */
export type GoldVariant =
  | 'FIXED_100'
  | 'FIXED_200'
  | 'FIXED_300'
  | 'RANDOM_0_500'
  | 'RANDOM_NEG200_400';

/** 房间状态 → AC-2, AC-4 */
export type RoomStatus = 'WAITING' | 'PLAYING' | 'DISBANDED';

/** 云函数名 */
export type CloudFunctionName = 'login' | 'room' | 'match' | 'game' | 'scheduler';

/** login 云函数 action */
export type LoginAction = 'profile';

/** room 云函数 action → AC-2, AC-3 */
export type RoomAction = 'create' | 'join' | 'start';

/** match 云函数 action → AC-5 */
export type MatchAction = 'enqueue' | 'cancel';

/** game 云函数 action → AC-7, AC-10, AC-13, AC-14 */
export type GameAction =
  | 'rollDice'
  | 'bluffShake'
  | 'bluffBid'
  | 'bluffOpen'
  | 'quit';

/** 数据库 watch 等效事件（plan.md §4.2） */
export type WatchEventType =
  | 'room_update'
  | 'room_disbanded'
  | 'match_found'
  | 'game_start'
  | 'game_update'
  | 'minigame_start'
  | 'minigame_update'
  | 'minigame_end'
  | 'game_over';

/** 对局人数上限配置 → AC-2 */
export type MaxPlayersOption = 2 | 3 | 4;

// ---------------------------------------------------------------------------
// 用户与房间
// ---------------------------------------------------------------------------

/** 用户档案 → AC-1, AC-12 */
export interface UserVO {
  id: string;
  openId: string;
  nickname: string;
  avatarUrl: string;
  /** 局外钻石 */
  diamond: number;
}

/** 房间成员槽位 */
export interface PlayerSlotVO {
  userId: string;
  openId: string;
  nickname: string;
  avatarUrl: string;
  seat: number;
}

/** 房间快照 → AC-2, AC-3, AC-4 */
export interface RoomVO {
  roomId: string;
  roomCode: string;
  hostId: string;
  maxPlayers: MaxPlayersOption;
  players: PlayerSlotVO[];
  status: RoomStatus;
  gameId?: string | null;
  createdAt: number;
  /** createdAt + ROOM_EXPIRE_MS */
  expireAt: number;
}

// ---------------------------------------------------------------------------
// 棋盘与对局
// ---------------------------------------------------------------------------

/** 对局内玩家 */
export interface GamePlayer {
  userId: string;
  openId: string;
  seat: number;
  /** 0 ~ BOARD_SIZE-1 */
  position: number;
  lap: number;
  gold: number;
  diamond: number;
  isOnline: boolean;
  isDefeated: boolean;
  /** 厄运降临剩余回合（仅影响该玩家金币格） */
  doomRemainingTurns?: number;
}

/** 棋盘格子 */
export interface BoardCell {
  index: number;
  type: CellType;
  goldVariant?: GoldVariant;
}

/** 最近一次格子/事件提示 */
export interface GameLastEvent {
  type: string;
  message: string;
}

/**
 * 云数据库 games 集合文档
 * 客户端 watch 驱动 UI → AC-6～AC-9, AC-11
 */
export interface GameDoc {
  _id: string;
  roomId: string;
  phase: GamePhase;
  players: GamePlayer[];
  boardCells: BoardCell[];
  diamondCellIndex: number;
  currentSeat: number;
  startedAt: number;
  /** 已完成的行动回合数 */
  actionRoundCount?: number;
  /** 本行动回合内已结束掷骰的座位 */
  rolledSeatsThisRound?: number[];
  lastDice?: number;
  lastEvent?: GameLastEvent;
  bluffState?: BluffState;
  settlement?: SettlementVO;
  updatedAt: number;
  /** 乐观锁版本号（可选） */
  version?: number;
}

// ---------------------------------------------------------------------------
// 吹牛小游戏 → AC-10
// ---------------------------------------------------------------------------

export type BluffPhase = 'SHAKING' | 'BIDDING' | 'RESOLVED';

/** 吹牛公共状态（写入 games.bluffState，全员可见） */
export interface BluffState {
  phase: BluffPhase;
  /** 触发本次吹牛的棋盘座位 */
  triggerSeat: number;
  /** 当前叫点/行动座位 */
  currentSeat: number;
  /** 上家叫点：至少 count 个 face（1-6） */
  lastBid?: { seat: number; count: number; face: number };
  /** 已出局座位（按出局顺序） */
  eliminatedSeats: number[];
  /** 最终排名 seat 列表，index 0 = 第 1 名 */
  rankings?: number[];
  /** 各座位已确认摇完 */
  shakenSeats: number[];
  /** 当前回合截止时间戳（毫秒） */
  turnDeadlineAt?: number;
}

/** 仅 callFunction 响应返回，不写入 games → AC-14 */
export interface BluffMyDice {
  dice: number[];
}

// ---------------------------------------------------------------------------
// 结算 → AC-11, AC-12, AC-13
// ---------------------------------------------------------------------------

export interface SettlementPlayerResult {
  userId: string;
  openId: string;
  seat: number;
  rank: number;
  gold: number;
  diamond: number;
  /** 本局获得的局外钻石增量 */
  diamondEarned: number;
  isDefeated: boolean;
  /** 是否平局（多人同钻石同金币）→ AC-11 T3 */
  isTie?: boolean;
}

export interface SettlementVO {
  reason: 'NORMAL' | 'TIMEOUT' | 'LAP' | 'QUIT' | 'ACTION_ROUNDS';
  players: SettlementPlayerResult[];
  finishedAt: number;
}

// ---------------------------------------------------------------------------
// 匹配队列（云数据库 match_queue）
// ---------------------------------------------------------------------------

export interface MatchQueueDoc {
  _id: string;
  ticketId: string;
  openId: string;
  userId: string;
  maxPlayers: MaxPlayersOption;
  enqueueAt: number;
}

// ---------------------------------------------------------------------------
// 云函数请求 / 响应
// ---------------------------------------------------------------------------

/** login 默认登录 */
export interface LoginRequest {
  nickname?: string;
  avatarUrl?: string;
}

export interface LoginProfileRequest {
  action: 'profile';
}

export type LoginCloudRequest = LoginRequest | LoginProfileRequest;

export interface LoginResponse {
  user: UserVO;
}

export interface RoomCreateRequest {
  action: 'create';
  maxPlayers: MaxPlayersOption;
}

export interface RoomJoinRequest {
  action: 'join';
  roomCode: string;
}

export interface RoomStartRequest {
  action: 'start';
  roomId: string;
}

export type RoomCloudRequest = RoomCreateRequest | RoomJoinRequest | RoomStartRequest;

export interface RoomCreateResponse {
  roomId: string;
  roomCode: string;
}

export interface RoomJoinResponse {
  room: RoomVO;
}

export interface RoomStartResponse {
  gameId: string;
}

export interface MatchEnqueueRequest {
  action: 'enqueue';
  maxPlayers?: MaxPlayersOption;
}

export interface MatchCancelRequest {
  action: 'cancel';
  ticketId: string;
}

export type MatchCloudRequest = MatchEnqueueRequest | MatchCancelRequest;

export interface MatchEnqueueResponse {
  ticketId: string;
}

export interface MatchCancelResponse {
  ok: true;
}

export interface GameRollDiceRequest {
  action: 'rollDice';
  gameId: string;
}

export interface GameBluffShakeRequest {
  action: 'bluffShake';
  gameId: string;
}

export interface GameBluffBidRequest {
  action: 'bluffBid';
  gameId: string;
  count: number;
  face: number;
}

export interface GameBluffOpenRequest {
  action: 'bluffOpen';
  gameId: string;
}

export interface GameQuitRequest {
  action: 'quit';
  gameId: string;
}

export type GameCloudRequest =
  | GameRollDiceRequest
  | GameBluffShakeRequest
  | GameBluffBidRequest
  | GameBluffOpenRequest
  | GameQuitRequest;

/** rollDice 响应；private 仅本人可见 */
export interface GameRollDiceResponse {
  ok: true;
  private?: {
    myDice?: BluffMyDice;
  };
}

export interface GameOkResponse {
  ok: true;
}

export interface CloudErrorResponse {
  ok: false;
  code: string;
  message: string;
}

// ---------------------------------------------------------------------------
// 本地微信配置（config/wechat.local.json）
// ---------------------------------------------------------------------------

export interface WechatLocalConfig {
  appId: string;
  cloudEnvId: string;
}

// ---------------------------------------------------------------------------
// apiKey 映射表（文档用，运行时直接用 CloudFunctionName + action）
// ---------------------------------------------------------------------------

export const API_REGISTRY = {
  'auth.login': { function: 'login' as const, ac: ['AC-1'] },
  'user.profile': { function: 'login' as const, action: 'profile' as const, ac: ['AC-1', 'AC-12'] },
  'room.create': { function: 'room' as const, action: 'create' as const, ac: ['AC-2'] },
  'room.join': { function: 'room' as const, action: 'join' as const, ac: ['AC-2'] },
  'room.start': { function: 'room' as const, action: 'start' as const, ac: ['AC-3'] },
  'match.enqueue': { function: 'match' as const, action: 'enqueue' as const, ac: ['AC-5'] },
  'match.cancel': { function: 'match' as const, action: 'cancel' as const, ac: [] },
  'game.roll_dice': { function: 'game' as const, action: 'rollDice' as const, ac: ['AC-7', 'AC-14'] },
  'game.bluff_shake': { function: 'game' as const, action: 'bluffShake' as const, ac: ['AC-10'] },
  'game.bluff_bid': { function: 'game' as const, action: 'bluffBid' as const, ac: ['AC-10'] },
  'game.bluff_open': { function: 'game' as const, action: 'bluffOpen' as const, ac: ['AC-10'] },
  'game.quit': { function: 'game' as const, action: 'quit' as const, ac: ['AC-13'] },
} as const;

export type ApiKey = keyof typeof API_REGISTRY;
