import { callFunction } from './CloudService';
import type {
  AttackTargetType,
  ConsumableItemType,
  GameDoc,
  GameMoveEvent,
  FinalShopItemType,
  GoldShopItemType,
  LegendaryShopItemType,
  RegionIndex,
  ShopType,
} from '../types/GameTypes';

export interface GameActionResponse {
  ok: boolean;
  game?: GameDoc;
  code?: string;
  message?: string;
}

export interface GameRollResponse extends GameActionResponse {
  dice?: number;
  totalSteps?: number;
  steps?: number[];
  segmentPath?: number[];
  segmentSteps?: number;
  paused?: boolean;
  extraRoll?: boolean;
  events?: GameMoveEvent[];
  settled?: boolean;
}

export interface GameContinueMoveResponse extends GameActionResponse {
  segmentPath?: number[];
  segmentSteps?: number;
  paused?: boolean;
  events?: GameMoveEvent[];
  settled?: boolean;
}

export interface GameAttackResponse extends GameActionResponse {
  damage?: number;
  killed?: boolean;
  targetType?: AttackTargetType;
  targetSeat?: number;
  regionIndex?: RegionIndex;
  targetHp?: number;
  creatureHp?: number;
  rewards?: {
    itemGranted?: string;
    rocketDropped?: boolean;
    goldReward?: number;
  };
  event?: GameMoveEvent;
  settled?: boolean;
}

export interface GameShopResponse extends GameActionResponse {
  purchasedItem?: string;
  price?: number;
  event?: GameMoveEvent;
}

export interface GameItemResponse extends GameActionResponse {
  event?: GameMoveEvent;
}

export interface GameEndTurnResponse extends GameActionResponse {
  currentSeat?: number;
  settled?: boolean;
}

export interface GameTickResponse extends GameActionResponse {}

export interface GameQuitResponse {
  ok: boolean;
  settled?: boolean;
  game?: GameDoc;
  code?: string;
  message?: string;
}

function ensureOk<T extends { ok: boolean; message?: string; code?: string }>(
  res: T,
  fallback: string,
): T {
  if (!res.ok) throw new Error(res.message || res.code || fallback);
  return res;
}

export async function rollDice(gameId: string): Promise<GameRollResponse> {
  return ensureOk(
    await callFunction<GameRollResponse>('game', { action: 'rollDice', gameId }),
    'ROLL_DICE_FAILED',
  );
}

export async function extraRollDice(gameId: string): Promise<GameRollResponse> {
  return ensureOk(
    await callFunction<GameRollResponse>('game', {
      action: 'extraRollDice',
      gameId,
    }),
    'EXTRA_ROLL_FAILED',
  );
}

export async function useItem(
  gameId: string,
  itemType: ConsumableItemType,
  targetCellIndex?: number,
): Promise<GameItemResponse> {
  return ensureOk(
    await callFunction<GameItemResponse>('game', {
      action: 'useItem',
      gameId,
      itemType,
      targetCellIndex,
    }),
    'USE_ITEM_FAILED',
  );
}

export async function buyShopItem(
  gameId: string,
  shopType: ShopType,
  itemType: GoldShopItemType | LegendaryShopItemType | FinalShopItemType,
): Promise<GameShopResponse> {
  return ensureOk(
    await callFunction<GameShopResponse>('game', {
      action: 'buyShopItem',
      gameId,
      shopType,
      itemType,
    }),
    'BUY_SHOP_FAILED',
  );
}

export async function attackTarget(
  gameId: string,
  targetType: AttackTargetType,
  opts?: { targetSeat?: number; regionIndex?: RegionIndex },
): Promise<GameAttackResponse> {
  return ensureOk(
    await callFunction<GameAttackResponse>('game', {
      action: 'attack',
      gameId,
      targetType,
      targetSeat: opts?.targetSeat,
      regionIndex: opts?.regionIndex,
    }),
    'ATTACK_FAILED',
  );
}

export async function endTurn(gameId: string): Promise<GameEndTurnResponse> {
  return ensureOk(
    await callFunction<GameEndTurnResponse>('game', { action: 'endTurn', gameId }),
    'END_TURN_FAILED',
  );
}

export async function continueMove(
  gameId: string,
): Promise<GameContinueMoveResponse> {
  return ensureOk(
    await callFunction<GameContinueMoveResponse>('game', {
      action: 'continueMove',
      gameId,
    }),
    'CONTINUE_MOVE_FAILED',
  );
}

export async function tick(gameId: string): Promise<GameTickResponse> {
  return ensureOk(
    await callFunction<GameTickResponse>('game', { action: 'tick', gameId }),
    'TICK_FAILED',
  );
}

export async function sendChat(gameId: string, text: string): Promise<GameTickResponse> {
  return ensureOk(
    await callFunction<GameTickResponse>('game', { action: 'sendChat', gameId, text }),
    'SEND_CHAT_FAILED',
  );
}

export async function luckyStart(gameId: string): Promise<GameTickResponse> {
  return ensureOk(
    await callFunction<GameTickResponse>('game', { action: 'luckyStart', gameId }),
    'LUCKY_START_FAILED',
  );
}

export async function luckyEnd(gameId: string): Promise<GameTickResponse> {
  return ensureOk(
    await callFunction<GameTickResponse>('game', { action: 'luckyEnd', gameId }),
    'LUCKY_END_FAILED',
  );
}

export async function resolveEvent(
  gameId: string,
  payload: Record<string, unknown>,
): Promise<GameTickResponse> {
  return ensureOk(
    await callFunction<GameTickResponse>('game', {
      action: 'resolveEvent',
      gameId,
      payload,
    }),
    'RESOLVE_EVENT_FAILED',
  );
}

export async function quitGame(gameId: string): Promise<GameQuitResponse> {
  return ensureOk(
    await callFunction<GameQuitResponse>('game', { action: 'quit', gameId }),
    'QUIT_GAME_FAILED',
  );
}
