/**
 * CoupleGame 客户端 ↔ 云函数 共享协议类型
 * 血量淘汰玩法改版：specs/260529-combat-board-game-rework/
 * 云函数为 JavaScript 时可对照本文件实现；Cocos 客户端直接 import。
 */

// ---------------------------------------------------------------------------
// 战斗相关类型（常量区前声明，供 WEAPON_STATS 等使用）
// ---------------------------------------------------------------------------

export type WeaponType = 'SWORD' | 'GUN' | 'ROCKET';
export type ArmorType = 'HELMET' | 'ARMOR';
export type ShoesType = 'MARCHING_SHOES';
export type ConsumableItemType = 'DOUBLE_DICE' | 'TRAP' | 'MEDKIT';
export type GoldShopItemType =
  | 'SWORD'
  | 'HELMET'
  | 'MARCHING_SHOES'
  | 'DOUBLE_DICE'
  | 'TRAP'
  | 'IMMUNITY_POTION';
export type LegendaryShopItemType = 'GUN' | 'ARMOR' | 'MEDKIT';
export type FinalShopItemType = 'WEAPON_UPGRADE' | 'DIVINE_STRIKE';
export type ShopType = 'GOLD' | 'LEGENDARY' | 'FINAL' | 'CHARITY';
export type AttackTargetType = 'PLAYER' | 'NEUTRAL_CREATURE';
export type RegionIndex = 0 | 1 | 2;
export type PendingInteractionType =
  | 'GOLD_SHOP'
  | 'LEGENDARY_SHOP'
  | 'FINAL_SHOP'
  | 'LUCKY'
  | 'EVENT'
  | 'CHARITY_SHOP'
  | 'CELL_ACK';

export interface MovePauseState {
  seat: number;
  fromPosition?: number;
  segmentSteps?: number;
  remainingPath: number[];
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 棋盘总格数 → AC-1 */
export const BOARD_SIZE = 75;

/** 骰子面数：1～9（额外投骰由双骰子道具提供）→ AC-3, AC-13 */
export const DICE_MAX = 9;

/** @deprecated 血量淘汰版不以圈数决胜；保留字段兼容旧对局/展示 */
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

/** 单次攻击最低伤害 → AC-12 */
export const MIN_ATTACK_DAMAGE = 0.5;

/** 资源价值折算：diamond * 系数 → AC-19 */
export const RESOURCE_VALUE_DIAMOND_MULTIPLIER = 300;

/** 幸运格重复装备转化金币 → AC-10 */
export const LUCKY_DUPLICATE_EQUIP_GOLD = 600;

/** 武器：攻击距离 / 基础伤害 → AC-11 */
export const WEAPON_STATS: Readonly<
  Record<WeaponType, { range: number; damage: number }>
> = {
  SWORD: { range: 2, damage: 1 },
  GUN: { range: 4, damage: 1.5 },
  ROCKET: { range: 7, damage: 2 },
};

/** 护甲减免 → AC-12 */
export const ARMOR_REDUCTION: Readonly<Record<ArmorType, number>> = {
  HELMET: 0.5,
  ARMOR: 1,
};

/** 金币商店价格（金币）→ AC-6 */
export const GOLD_SHOP_PRICES: Readonly<Record<GoldShopItemType, number>> = {
  SWORD: 1200,
  HELMET: 1000,
  MARCHING_SHOES: 900,
  DOUBLE_DICE: 700,
  TRAP: 500,
  IMMUNITY_POTION: 400,
};

/** 传说商店价格（局内钻石）→ AC-8 */
export const LEGENDARY_SHOP_PRICES: Readonly<Record<LegendaryShopItemType, number>> = {
  GUN: 8,
  ARMOR: 6,
  MEDKIT: 4,
};

/** 中立生物 → AC-17 */
export const NEUTRAL_CREATURE_HP = 6;
export const NEUTRAL_KILL_GOLD = 2000;
export const ROCKET_DROP_CHANCE = 0.1;

/** 好友房未开始自动解散 */
export const ROOM_EXPIRE_MS = 5 * 60 * 1000;

/** 随机匹配最长等待 */
export const MATCH_WAIT_MS = 30 * 1000;

/** 钻石格奖励（局内钻石） */
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

// ---------------------------------------------------------------------------
// 枚举 / 字面量联合
// ---------------------------------------------------------------------------

/** 对局阶段 */
export type GamePhase = 'BOARD' | 'SETTLED';

/** 格子类型 → AC-1, AC-5 */
export type CellType =
  | 'NORMAL'
  | 'GOLD'
  | 'DIAMOND'
  | 'SUPPLY'
  | 'WASTE'
  | 'BURNING'
  | 'EVENT'
  | 'GOLD_SHOP'
  | 'LEGENDARY_SHOP'
  | 'FINAL_SHOP'
  | 'LUCKY';

export type SurvivalPhase = 'DEVELOPMENT' | 'CONTEST' | 'FINAL';
export type SupplyCrateType = 'NORMAL' | 'LARGE';

/** 金币格子子类型 */
export type GoldVariant =
  | 'FIXED_100'
  | 'FIXED_200'
  | 'FIXED_300'
  | 'RANDOM_0_500'
  | 'RANDOM_NEG200_400';

/** 房间状态 */
export type RoomStatus = 'WAITING' | 'PLAYING' | 'DISBANDED';

/** 云函数名 */
export type CloudFunctionName = 'login' | 'room' | 'match' | 'game' | 'scheduler';

export type LoginAction = 'profile';
export type RoomAction = 'create' | 'join' | 'start';
export type MatchAction = 'enqueue' | 'cancel';

/** game 云函数 action → AC-3, AC-6～AC-18, AC-21 */
export type GameAction =
  | 'rollDice'
  | 'extraRollDice'
  | 'useItem'
  | 'attack'
  | 'buyShopItem'
  | 'endTurn'
  | 'tick'
  | 'resolveEvent'
  | 'luckyStart'
  | 'luckyEnd'
  | 'continueMove'
  | 'sendChat'
  | 'quit';

export type WatchEventType =
  | 'room_update'
  | 'room_disbanded'
  | 'match_found'
  | 'game_start'
  | 'game_update'
  | 'game_over';

export type MaxPlayersOption = 2 | 3 | 4;

// ---------------------------------------------------------------------------
// 战斗 / 棋盘运行时
// ---------------------------------------------------------------------------

/** 玩家背包道具数量 → AC-14～AC-16 */
export interface PlayerItems {
  doubleDice: number;
  trap: number;
  medkit: number;
}

/** 每玩家独立商店库存 → AC-7, AC-9 */
export interface PlayerShopStock {
  goldShopVersion: number;
  legendaryShopVersion: number;
  goldShop: Record<GoldShopItemType, boolean>;
  legendaryShop: Record<LegendaryShopItemType, boolean>;
}

/** 本回合行动标记 → AC-3 */
export interface PlayerTurnActions {
  rolled: boolean;
  usedItem: boolean;
  attacked: boolean;
  extraRollAvailable: boolean;
  extraRolled: boolean;
}

/** 地图陷阱 → AC-15 */
export interface TrapState {
  id: string;
  ownerSeat: number;
  cellIndex: number;
  damage: number;
  active: boolean;
}

/** 区域中立生物 → AC-1, AC-17 */
export interface NeutralCreatureState {
  regionIndex: RegionIndex;
  hp: number;
  maxHp: number;
  defeated: boolean;
  damageBySeat?: Record<number, number>;
}

/** 移动结束后待处理交互（商店/小游戏） */
export interface PendingInteraction {
  seat: number;
  // 为了兼容云数据库已部署 schema，这里不强制要求 cellIndex
  cellIndex?: number;
  type: PendingInteractionType;
  cellType?: string;
}

// ---------------------------------------------------------------------------
// 用户与房间
// ---------------------------------------------------------------------------

/** 用户档案（无局外钻石，钻石仅存在于对局内 players[].diamond） */
export interface UserVO {
  id: string;
  openId: string;
  nickname: string;
  avatarUrl: string;
}

export interface PlayerSlotVO {
  userId: string;
  openId: string;
  nickname: string;
  avatarUrl: string;
  seat: number;
  isBot?: boolean;
}

export interface RoomVO {
  roomId: string;
  roomCode: string;
  hostId: string;
  maxPlayers: MaxPlayersOption;
  players: PlayerSlotVO[];
  status: RoomStatus;
  gameId?: string | null;
  gameName?: string;
  matchFill?: boolean;
  hostNickname?: string;
  createdAt: number;
  expireAt: number;
}

// ---------------------------------------------------------------------------
// 棋盘与对局
// ---------------------------------------------------------------------------

/** 对局内玩家 → AC-2, AC-20 */
export interface GamePlayer {
  userId: string;
  openId: string;
  seat: number;
  position: number;
  /** @deprecated 血量淘汰版不以圈数决胜；可保留展示 */
  lap: number;
  gold: number;
  /** 局内钻石（传说商店等） */
  diamond: number;
  isOnline: boolean;
  /** 淘汰态（HP 清零或退出）→ AC-18 */
  isDefeated: boolean;
  hp: number;
  maxHp: number;
  kills: number;
  weapon?: WeaponType;
  armor?: ArmorType;
  shoes?: ShoesType;
  items: PlayerItems;
  shopStock: PlayerShopStock;
  turnActions: PlayerTurnActions;
  doomRemainingTurns?: number;
  isBot?: boolean;
  weaponAttackBonus?: number;
  weaponInventory?: Partial<Record<WeaponType, number>>;
}

export interface BoardCell {
  index: number;
  type: CellType;
  goldVariant?: GoldVariant;
  stock?: number;
  initialStock?: number;
  claimCount?: number;
  depleted?: boolean;
  crate?: SupplyCrateType | null;
}

export interface GameLastEvent {
  type: string;
  message: string;
  actorSeat?: number;
}

/**
 * 云数据库 games 集合文档
 * 客户端 watch 驱动 UI → AC-1～AC-21
 */
export interface GameDoc {
  _id: string;
  roomId: string;
  gameName?: string;
  phase: GamePhase;
  survivalPhase?: SurvivalPhase;
  boardSize?: typeof BOARD_SIZE;
  players: GamePlayer[];
  boardCells: BoardCell[];
  diamondCellIndex: number;
  currentSeat: number;
  /** 当前座位回合截止时间（ms 时间戳），用于 24 秒倒计时 */
  turnDeadlineAt?: number;
  startedAt: number;
  actionRoundCount?: number;
  rolledSeatsThisRound?: number[];
  pendingInteraction?: PendingInteraction | null;
  movePause?: MovePauseState | null;
  luckySpin?: LuckySpinState | null;
  traps?: TrapState[];
  neutralCreatures?: NeutralCreatureState[];
  lastDice?: number;
  lastEvent?: GameLastEvent;
  lastEvents?: GameLastEvent[];
  eventState?: {
    id: string;
    title: string;
    description: string;
    effect: string;
    phase: string;
    triggerSeat: number;
    cellIndex?: number;
    data?: Record<string, unknown>;
  } | null;
  settlement?: SettlementVO;
  updatedAt: number;
  version?: number;
}

export type LuckySpinPhase = 'READY' | 'FAST' | 'SLOW' | 'DONE';

export interface LuckySpinState {
  seat: number;
  phase: LuckySpinPhase;
  options: string[]; // 7 个增益项文案
  startedAt?: number;
  slowAt?: number;
  stopAt?: number;
  finalIndex?: number;
}

// ---------------------------------------------------------------------------
// 结算 → AC-18, AC-19
// ---------------------------------------------------------------------------

export type SettlementReason =
  | 'NORMAL'
  | 'TIMEOUT'
  | 'LAP'
  | 'QUIT'
  | 'ACTION_ROUNDS'
  | 'LAST_STANDING'
  | 'ELIMINATION';

export interface SettlementPlayerResult {
  userId: string;
  openId: string;
  seat: number;
  rank: number;
  gold: number;
  diamond: number;
  /** 局外钻石增量；血量淘汰版默认 0 → PD7 */
  diamondEarned?: number;
  isDefeated: boolean;
  isTie?: boolean;
  /** 血量淘汰版 */
  isWinner?: boolean;
  hp?: number;
  kills?: number;
  resourceValue?: number;
}

export interface SettlementVO {
  reason: SettlementReason;
  players: SettlementPlayerResult[];
  finishedAt: number;
}

// ---------------------------------------------------------------------------
// 匹配队列
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

export interface GameExtraRollDiceRequest {
  action: 'extraRollDice';
  gameId: string;
}

export interface GameUseItemRequest {
  action: 'useItem';
  gameId: string;
  itemType: ConsumableItemType;
  targetCellIndex?: number;
}

export interface GameAttackRequest {
  action: 'attack';
  gameId: string;
  targetType: AttackTargetType;
  targetSeat?: number;
  regionIndex?: RegionIndex;
}

export interface GameBuyShopItemRequest {
  action: 'buyShopItem';
  gameId: string;
  shopType: ShopType;
  itemType: GoldShopItemType | LegendaryShopItemType;
}

export interface GameEndTurnRequest {
  action: 'endTurn';
  gameId: string;
}

export interface GameResolveEventRequest {
  action: 'resolveEvent';
  gameId: string;
  payload?: Record<string, unknown>;
}

export interface GameQuitRequest {
  action: 'quit';
  gameId: string;
}

export type GameCloudRequest =
  | GameRollDiceRequest
  | GameExtraRollDiceRequest
  | GameUseItemRequest
  | GameAttackRequest
  | GameBuyShopItemRequest
  | GameEndTurnRequest
  | GameResolveEventRequest
  | GameQuitRequest;

/** 移动/战斗事件（服务端权威） */
export interface GameMoveEvent {
  type: string;
  message: string;
  cellIndex?: number;
}

export interface GameRollDiceResponse {
  ok: true;
  dice?: number;
  steps?: number[];
  segmentPath?: number[];
  segmentSteps?: number;
  paused?: boolean;
  events?: GameMoveEvent[];
  settled?: boolean;
  game?: GameDoc;
}

export interface GameContinueMoveResponse {
  ok: true;
  segmentPath?: number[];
  segmentSteps?: number;
  paused?: boolean;
  events?: GameMoveEvent[];
  settled?: boolean;
  game?: GameDoc;
}

export interface GameAttackResponse {
  ok: true;
  damage?: number;
  eliminated?: boolean;
  drops?: { type: string; message?: string }[];
}

export interface GameBuyShopItemResponse {
  ok: true;
  purchasedItem?: string;
}

export interface GameUseItemResponse {
  ok: true;
  event?: GameMoveEvent;
}

export interface GameEndTurnResponse {
  ok: true;
  currentSeat?: number;
}

export interface GameOkResponse {
  ok: true;
}

export interface CloudErrorResponse {
  ok: false;
  code: string;
  message: string;
}

export interface WechatLocalConfig {
  appId: string;
  cloudEnvId: string;
}

// ---------------------------------------------------------------------------
// apiKey 映射表
// ---------------------------------------------------------------------------

export const API_REGISTRY = {
  'auth.login': { function: 'login' as const, ac: ['AC-1'] },
  'user.profile': { function: 'login' as const, action: 'profile' as const, ac: ['AC-1'] },
  'room.create': { function: 'room' as const, action: 'create' as const, ac: ['AC-2'] },
  'room.join': { function: 'room' as const, action: 'join' as const, ac: ['AC-2'] },
  'room.start': { function: 'room' as const, action: 'start' as const, ac: ['AC-3'] },
  'match.enqueue': { function: 'match' as const, action: 'enqueue' as const, ac: ['AC-5'] },
  'match.cancel': { function: 'match' as const, action: 'cancel' as const, ac: [] },
  'game.roll_dice': {
    function: 'game' as const,
    action: 'rollDice' as const,
    ac: ['AC-3', 'AC-4', 'AC-13', 'AC-21'],
  },
  'game.extra_roll_dice': {
    function: 'game' as const,
    action: 'extraRollDice' as const,
    ac: ['AC-14', 'AC-21'],
  },
  'game.use_item': {
    function: 'game' as const,
    action: 'useItem' as const,
    ac: ['AC-14', 'AC-15', 'AC-16', 'AC-21'],
  },
  'game.attack': {
    function: 'game' as const,
    action: 'attack' as const,
    ac: ['AC-11', 'AC-12', 'AC-17', 'AC-18', 'AC-21'],
  },
  'game.buy_shop_item': {
    function: 'game' as const,
    action: 'buyShopItem' as const,
    ac: ['AC-6', 'AC-7', 'AC-8', 'AC-9', 'AC-21'],
  },
  'game.end_turn': {
    function: 'game' as const,
    action: 'endTurn' as const,
    ac: ['AC-3', 'AC-21'],
  },
  'game.resolve_event': {
    function: 'game' as const,
    action: 'resolveEvent' as const,
    ac: ['AC-5', 'AC-26'],
  },
  'game.quit': { function: 'game' as const, action: 'quit' as const, ac: ['AC-18'] },
} as const;

export type ApiKey = keyof typeof API_REGISTRY;
