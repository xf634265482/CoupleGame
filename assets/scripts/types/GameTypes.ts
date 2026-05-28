/**
 * 客户端协议类型（与 shared/protocol.ts 保持同步）
 */

export type GamePhase = 'BOARD' | 'MINIGAME_BLUFF' | 'SETTLED';

export type CellType = 'NORMAL' | 'GOLD' | 'DIAMOND' | 'EVENT' | 'MINIGAME';

export type RoomStatus = 'WAITING' | 'PLAYING' | 'DISBANDED';

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

export interface UserVO {
  id: string;
  openId: string;
  nickname: string;
  avatarUrl: string;
  diamond: number;
}

export interface PlayerSlotVO {
  userId: string;
  openId: string;
  nickname: string;
  avatarUrl: string;
  seat: number;
}

export interface RoomVO {
  roomId: string;
  roomCode: string;
  hostId: string;
  maxPlayers: number;
  players: PlayerSlotVO[];
  status: RoomStatus;
  gameId?: string | null;
  createdAt: number;
  expireAt: number;
}

export interface GamePlayer {
  userId: string;
  openId: string;
  nickname?: string;
  seat: number;
  position: number;
  lap: number;
  gold: number;
  diamond: number;
  isOnline: boolean;
  isDefeated: boolean;
  /** 厄运降临剩余回合（仅该玩家金币格翻转） */
  doomRemainingTurns?: number;
}

export interface BoardCell {
  index: number;
  type: CellType;
  goldVariant?: string;
}

export interface BluffBid {
  count: number;
  face: number;
  seat: number;
}

export interface BluffState {
  phase: 'SHAKING' | 'BIDDING' | 'DONE';
  triggerSeat: number;
  currentSeat: number;
  eliminatedSeats: number[];
  shakenSeats: number[];
  eliminationOrder?: number[];
  lastBid?: BluffBid | null;
  turnDeadline?: number;
  lastOpenResult?: {
    actual: number;
    faceOnly?: number;
    wildOnes?: number;
    bid: BluffBid;
    loserSeat: number;
    openerSeat: number;
  };
  rankings?: Array<{ seat: number; rank: number; goldReward: number }>;
}

export interface SettlementPlayerRow {
  userId: string;
  openId: string;
  seat: number;
  rank: number;
  gold: number;
  diamond: number;
  diamondEarned: number;
  isDefeated?: boolean;
  isTie?: boolean;
}

export interface SettlementVO {
  reason: string;
  players: SettlementPlayerRow[];
  finishedAt: number;
}

export interface GameDoc {
  _id: string;
  roomId: string;
  phase: GamePhase;
  players: GamePlayer[];
  boardCells: BoardCell[];
  diamondCellIndex: number;
  currentSeat: number;
  actionRoundCount?: number;
  rolledSeatsThisRound?: number[];
  startedAt: number;
  lastDice?: number;
  lastEvent?: {
    type: string;
    message: string;
    actorSeat?: number;
    lastOpenResult?: BluffState['lastOpenResult'];
  };
  bluffState?: BluffState;
  settlement?: SettlementVO;
  updatedAt: number;
  version?: number;
}

export interface LoginResponse {
  ok: boolean;
  user?: UserVO;
  code?: string;
  message?: string;
}
