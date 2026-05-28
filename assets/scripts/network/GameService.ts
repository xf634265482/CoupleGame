import { callFunction } from './CloudService';
import type { BluffState, GameDoc } from '../types/GameTypes';

export interface GameRollResponse {
  ok: boolean;
  dice?: number;
  /** 掷出 7 时可再掷一次 */
  extraRoll?: boolean;
  events?: Array<{ type: string; message: string }>;
  settled?: boolean;
  game?: GameDoc;
  code?: string;
  message?: string;
}

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

export async function quitGame(gameId: string): Promise<GameQuitResponse> {
  return ensureOk(
    await callFunction<GameQuitResponse>('game', { action: 'quit', gameId }),
    'QUIT_GAME_FAILED',
  );
}

export interface BluffShakeResponse {
  ok: boolean;
  myDice?: number[];
  bluffState?: BluffState;
  game?: GameDoc;
  code?: string;
  message?: string;
}

export interface BluffBidResponse {
  ok: boolean;
  skipped?: boolean;
  bluffState?: BluffState;
  game?: GameDoc;
  code?: string;
  message?: string;
}

export interface BluffTickResponse {
  ok: boolean;
  game?: GameDoc;
  code?: string;
  message?: string;
}

export interface BluffOpenResponse {
  ok: boolean;
  bluffState?: BluffState;
  rankings?: Array<{ seat: number; rank: number; goldReward: number }>;
  openResult?: BluffState['lastOpenResult'];
  game?: GameDoc;
  code?: string;
  message?: string;
}

export interface BluffMyDiceResponse {
  ok: boolean;
  myDice?: number[];
  code?: string;
  message?: string;
}

export async function bluffMyDice(gameId: string): Promise<BluffMyDiceResponse> {
  return ensureOk(
    await callFunction<BluffMyDiceResponse>('game', { action: 'bluffMyDice', gameId }),
    'BLUFF_MY_DICE_FAILED',
  );
}

export async function bluffShake(gameId: string): Promise<BluffShakeResponse> {
  return ensureOk(
    await callFunction<BluffShakeResponse>('game', { action: 'bluffShake', gameId }),
    'BLUFF_SHAKE_FAILED',
  );
}

export async function bluffBid(
  gameId: string,
  count: number,
  face: number,
): Promise<BluffBidResponse> {
  return ensureOk(
    await callFunction<BluffBidResponse>('game', {
      action: 'bluffBid',
      gameId,
      count,
      face,
    }),
    'BLUFF_BID_FAILED',
  );
}

export async function bluffTick(gameId: string): Promise<BluffTickResponse> {
  return ensureOk(
    await callFunction<BluffTickResponse>('game', { action: 'bluffTick', gameId }),
    'BLUFF_TICK_FAILED',
  );
}

export async function bluffOpen(gameId: string): Promise<BluffOpenResponse> {
  return ensureOk(
    await callFunction<BluffOpenResponse>('game', { action: 'bluffOpen', gameId }),
    'BLUFF_OPEN_FAILED',
  );
}
