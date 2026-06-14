import { callFunction } from './CloudService';
import type { RoomVO } from '../types/GameTypes';

interface CloudOk {
  ok: boolean;
  code?: string;
  message?: string;
}

export interface CreateRoomResponse extends CloudOk {
  roomId?: string;
  roomCode?: string;
  room?: RoomVO;
}

export interface ListRoomsResponse extends CloudOk {
  rooms?: RoomVO[];
}

export interface JoinRoomResponse extends CloudOk {
  room?: RoomVO;
}

export interface StartRoomResponse extends CloudOk {
  gameId?: string;
  roomId?: string;
}

export interface SetMatchFillResponse extends CloudOk {
  room?: RoomVO;
}

export interface MatchEnqueueResponse extends CloudOk {
  ticketId?: string;
  alreadyQueued?: boolean;
  enqueueAt?: number;
}

export interface MatchPollResponse extends CloudOk {
  status?: 'IDLE' | 'QUEUED' | 'IN_ROOM' | 'PLAYING';
  ticketId?: string;
  enqueueAt?: number;
  roomId?: string;
  gameId?: string;
  room?: RoomVO;
}

function ensureOk<T extends CloudOk>(res: T, fallback: string): T {
  if (!res.ok) {
    throw new Error(res.message || res.code || fallback);
  }
  return res;
}

export async function createRoom(
  gameName: string,
  nickname?: string,
): Promise<CreateRoomResponse> {
  return ensureOk(
    await callFunction<CreateRoomResponse>('room', {
      action: 'create',
      gameName,
      nickname: nickname || gameName,
    }),
    'CREATE_ROOM_FAILED',
  );
}

export async function listRooms(): Promise<ListRoomsResponse> {
  return ensureOk(
    await callFunction<ListRoomsResponse>('room', { action: 'list' }),
    'LIST_ROOMS_FAILED',
  );
}

export async function joinRoom(
  roomCode: string,
  nickname?: string,
): Promise<JoinRoomResponse> {
  return ensureOk(
    await callFunction<JoinRoomResponse>('room', {
      action: 'join',
      roomCode,
      nickname,
    }),
    'JOIN_ROOM_FAILED',
  );
}

export async function startRoom(roomId: string): Promise<StartRoomResponse> {
  return ensureOk(
    await callFunction<StartRoomResponse>('room', { action: 'start', roomId }),
    'START_ROOM_FAILED',
  );
}

export interface LeaveRoomResponse extends CloudOk {
  settledGameId?: string | null;
}

export async function leaveRoom(roomId: string): Promise<LeaveRoomResponse> {
  return ensureOk(
    await callFunction<LeaveRoomResponse>('room', { action: 'leave', roomId }),
    'LEAVE_ROOM_FAILED',
  );
}

export async function disbandRoom(roomId: string): Promise<CloudOk> {
  return ensureOk(
    await callFunction<CloudOk>('room', { action: 'disband', roomId }),
    'DISBAND_ROOM_FAILED',
  );
}

export async function setRoomMatchFill(
  roomId: string,
  enabled: boolean,
): Promise<SetMatchFillResponse> {
  return ensureOk(
    await callFunction<SetMatchFillResponse>('room', {
      action: 'setMatchFill',
      roomId,
      enabled,
    }),
    'SET_MATCH_FILL_FAILED',
  );
}

/** 全局匹配队列（房内「在线匹配」由路人入队后优先补位） */
export async function matchEnqueue(): Promise<MatchEnqueueResponse> {
  return ensureOk(
    await callFunction<MatchEnqueueResponse>('match', { action: 'enqueue', maxPlayers: 4 }),
    'MATCH_ENQUEUE_FAILED',
  );
}

export async function matchCancel(ticketId?: string): Promise<void> {
  ensureOk(
    await callFunction<CloudOk>('match', { action: 'cancel', ticketId }),
    'MATCH_CANCEL_FAILED',
  );
}

export async function matchPoll(): Promise<MatchPollResponse> {
  return callFunction<MatchPollResponse>('match', { action: 'poll' });
}
