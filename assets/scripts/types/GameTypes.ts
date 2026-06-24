/**
 * 客户端协议类型（与 shared/protocol.ts 保持同步）
 * 血量淘汰玩法改版：specs/260529-combat-board-game-rework/
 */

export type GamePhase = 'BOARD' | 'SETTLED';

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

export type GoldVariant =
  | 'FIXED_100'
  | 'FIXED_200'
  | 'FIXED_300'
  | 'RANDOM_0_500'
  | 'RANDOM_NEG200_400';

export type WeaponType = 'SWORD' | 'GUN' | 'ROCKET';
export type ArmorType = 'HELMET' | 'ARMOR';
export type ShoesType = 'MARCHING_SHOES' | 'RAPID_SHOES';
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

export type RoomStatus = 'WAITING' | 'PLAYING' | 'DISBANDED';

export type WatchEventType =
  | 'room_update'
  | 'room_disbanded'
  | 'match_found'
  | 'game_start'
  | 'game_update'
  | 'game_over';

export interface PlayerItems {
  doubleDice: number;
  trap: number;
  medkit: number;
}

export interface PlayerShopStock {
  goldShopVersion: number;
  legendaryShopVersion: number;
  goldShop: Record<GoldShopItemType, boolean>;
  legendaryShop: Record<LegendaryShopItemType, boolean>;
  finalShop?: Record<FinalShopItemType, boolean>;
}

export interface PlayerTurnActions {
  rolled: boolean;
  usedItem: boolean;
  attacked: boolean;
  extraRollAvailable: boolean;
  extraRolled: boolean;
}

export interface TrapState {
  id: string;
  ownerSeat: number;
  cellIndex: number;
  damage: number;
  active: boolean;
}

export interface NeutralCreatureState {
  regionIndex: RegionIndex;
  hp: number;
  maxHp: number;
  defeated: boolean;
  damageBySeat?: Record<number, number>;
}

export interface PendingInteraction {
  seat: number;
  cellIndex?: number;
  type: PendingInteractionType;
  cellType?: string;
}

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
  maxPlayers: number;
  players: PlayerSlotVO[];
  status: RoomStatus;
  gameId?: string | null;
  gameName?: string;
  matchFill?: boolean;
  hostNickname?: string;
  createdAt: number;
  expireAt: number;
}

/** 对局内玩家 → AC-2, AC-20（战斗字段在服务端 Task 2 前可能缺失，客户端用 ?? 兜底） */
export interface GamePlayer {
  userId: string;
  openId: string;
  nickname?: string;
  seat: number;
  position: number;
  lap: number;
  gold: number;
  /** 局内钻石 */
  diamond: number;
  isOnline: boolean;
  isDefeated: boolean;
  hp?: number;
  maxHp?: number;
  kills?: number;
  weapon?: WeaponType;
  armor?: ArmorType;
  shoes?: ShoesType;
  shoesCount?: number;
  items?: PlayerItems;
  shopStock?: PlayerShopStock;
  turnActions?: PlayerTurnActions;
  /** 本回合移动经过的区域（0/1/2），用于攻击对应中立 */
  visitedRegionsThisTurn?: number[];
  doomRemainingTurns?: number;
  isBot?: boolean;
  weaponAttackBonus?: number;
  weaponInventory?: Partial<Record<WeaponType, number>>;
  /** 吸血石：造成伤害后回复伤害值一半的 HP */
  vampireStone?: boolean;
  infected?: boolean;
  mysteriousAmulet?: boolean;
  chosenOne?: boolean;
  tempAttackBonus?: number;
  permanentDamageBonus?: number;
}

export interface BoardCell {
  index: number;
  type: CellType;
  goldVariant?: GoldVariant | string;
  stock?: number;
  initialStock?: number;
  claimCount?: number;
  depleted?: boolean;
  crate?: SupplyCrateType | null;
}

export interface SettlementPlayerRow {
  userId: string;
  openId: string;
  seat: number;
  rank: number;
  gold: number;
  diamond: number;
  diamondEarned?: number;
  isDefeated?: boolean;
  isTie?: boolean;
  isWinner?: boolean;
  hp?: number;
  kills?: number;
  resourceValue?: number;
}

export type SettlementReason =
  | 'NORMAL'
  | 'TIMEOUT'
  | 'LAP'
  | 'QUIT'
  | 'ACTION_ROUNDS'
  | 'LAST_STANDING'
  | 'ELIMINATION'
  | string;

export interface SettlementVO {
  reason: SettlementReason;
  players: SettlementPlayerRow[];
  finishedAt: number;
}

export interface GameLastEvent {
  type: string;
  message: string;
  actorSeat?: number;
}

export interface GameDoc {
  _id: string;
  roomId: string;
  gameName?: string;
  phase: GamePhase;
  survivalPhase?: SurvivalPhase;
  finalShopsSpawned?: boolean;
  boardSize?: number;
  players: GamePlayer[];
  boardCells: BoardCell[];
  diamondCellIndex: number;
  currentSeat: number;
  turnDeadlineAt?: number;
  turnDeadlinePausedMs?: number | null;
  actionRoundCount?: number;
  rolledSeatsThisRound?: number[];
  startedAt: number;
  pendingInteraction?: PendingInteraction | null;
  movePause?: MovePauseState | null;
  luckySpin?: LuckySpinState | null;
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
  bountySeat?: number | null;
  sandstormRound?: number | null;
  traps?: TrapState[];
  neutralCreatures?: NeutralCreatureState[];
  lastDice?: number;
  lastEvent?: GameLastEvent;
  lastEvents?: GameLastEvent[];
  chatLog?: { ts: number; seat: number; nickname: string; text: string }[];
  settlement?: SettlementVO;
  updatedAt: number;
  version?: number;
}

export type LuckySpinPhase = 'READY' | 'FAST' | 'SLOW' | 'DONE';

export interface LuckySpinState {
  seat: number;
  phase: LuckySpinPhase;
  options: string[];
  startedAt?: number;
  slowAt?: number;
  stopAt?: number;
  finalIndex?: number;
}

export interface GameMoveEvent {
  type: string;
  message: string;
  actorSeat?: number;
  cellIndex?: number;
}

export interface LoginResponse {
  ok: boolean;
  user?: UserVO;
  code?: string;
  message?: string;
}
