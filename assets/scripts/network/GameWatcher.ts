import { EventBus } from '../core/EventBus';
import { GameSession } from '../core/GameSession';
import type { GameDoc, RoomStatus, RoomVO, WatchEventType } from '../types/GameTypes';
import { GameStateMirror } from './GameStateMirror';

type WatcherHandle = { close(): void };

type WatchDoc = {
  _id?: string;
  data?: Record<string, unknown> | (() => Record<string, unknown>);
  [key: string]: unknown;
};

/**
 * 微信小游戏 watch：change.doc 为平铺对象，没有 doc.data()。
 * 勿调用 .data()，否则会报 "doc.data is not a function"。
 */
function readWatchDoc(change: { doc: WatchDoc; docId?: string }): {
  id: string;
  raw: Record<string, unknown>;
} {
  const doc = change.doc ?? {};
  const id = String(change.docId ?? doc._id ?? '');

  if (doc.data && typeof doc.data === 'object' && !Array.isArray(doc.data)) {
    return { id, raw: { ...(doc.data as Record<string, unknown>) } };
  }

  const raw = { ...doc } as Record<string, unknown>;
  delete raw.data;
  return { id, raw };
}

function toRoomVO(roomId: string, raw: Record<string, unknown>): RoomVO {
  return {
    roomId,
    roomCode: String(raw.roomCode ?? ''),
    hostId: String(raw.hostId ?? ''),
    maxPlayers: Number(raw.maxPlayers ?? 4),
    players: (raw.players as RoomVO['players']) || [],
    status: (raw.status as RoomStatus) || 'WAITING',
    gameId: raw.gameId != null && raw.gameId !== '' ? String(raw.gameId) : null,
    createdAt: Number(raw.createdAt ?? 0),
    expireAt: Number(raw.expireAt ?? 0),
  };
}

/**
 * 云数据库 watch → 本地 EventBus（plan.md §4.2 映射）
 */
export class GameWatcher {
  private static _roomWatcher: WatcherHandle | null = null;
  private static _gameWatcher: WatcherHandle | null = null;
  private static _watchingGameId: string | null = null;
  private static _closingGame = false;
  private static _lastGamePhase: string | null = null;
  private static _lastSettlementFin: number | null = null;
  /** 最近一次 watch 推送时间（用于棋盘降频轮询） */
  static lastGamePushAt = 0;
  /** 最近一次房间 watch 推送时间（用于大厅降频轮询） */
  static lastRoomPushAt = 0;

  private static _safeClose(watcher: WatcherHandle | null): void {
    if (!watcher) return;
    try {
      watcher.close();
    } catch (err) {
      console.warn('[GameWatcher] close ignored', err);
    }
  }

  private static _isBenignWatchError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('initWatchFail') ||
      msg.includes('CLOSED') ||
      msg.includes('sessionInfo') ||
      msg.includes('non-fatal')
    );
  }

  /** 进入棋盘时立即拉取快照（watch 首包可能延迟） */
  static async pullGameSnapshot(gameId: string): Promise<GameDoc | null> {
    if (typeof wx === 'undefined' || !wx.cloud) return null;
    try {
      const res = await wx.cloud.database().collection('games').doc(gameId).get();
      const raw = (res.data || {}) as Record<string, unknown>;
      if (!raw || Object.keys(raw).length === 0) return null;
      GameStateMirror.setGame(raw);
      return { _id: gameId, ...raw } as GameDoc;
    } catch (err) {
      console.warn('[GameWatcher] pullGameSnapshot', err);
      return null;
    }
  }

  /** 拉取完整房间文档（watch 增量包可能缺 gameId） */
  static async pullRoomSnapshot(roomId: string): Promise<RoomVO | null> {
    if (typeof wx === 'undefined' || !wx.cloud) return null;
    try {
      const res = await wx.cloud.database().collection('rooms').doc(roomId).get();
      const raw = (res.data || {}) as Record<string, unknown>;
      if (!raw || Object.keys(raw).length === 0) return null;
      const room = toRoomVO(roomId, raw);
      GameStateMirror.setRoom(raw);
      return room;
    } catch (err) {
      console.warn('[GameWatcher] pullRoomSnapshot', err);
      return null;
    }
  }

  private static async _dispatchRoomSnapshot(
    roomId: string,
    raw: Record<string, unknown>,
  ): Promise<void> {
    let room = toRoomVO(roomId, raw);
    if (room.status === 'PLAYING' && !room.gameId) {
      const full = await this.pullRoomSnapshot(roomId);
      if (full) room = full;
    }

    this.lastRoomPushAt = Date.now();
    GameStateMirror.setRoom(room as unknown as Record<string, unknown>);

    if (room.status === 'DISBANDED') {
      EventBus.emit('room_disbanded', { reason: 'DISBANDED' });
      return;
    }

    EventBus.emit('room_update', room);

    if (room.status === 'PLAYING' && room.gameId && !GameSession.gameId) {
      GameSession.gameId = String(room.gameId);
      EventBus.emit('match_found', {
        roomId,
        gameId: String(room.gameId),
      });
    }
  }

  static watchRoom(roomId: string): void {
    this.stopRoom();
    if (typeof wx === 'undefined' || !wx.cloud) return;

    GameSession.roomId = roomId;
    const db = wx.cloud.database();
    this._roomWatcher = db.collection('rooms').doc(roomId).watch({
      onChange: (snapshot) => {
        const changes = snapshot.docChanges?.length
          ? snapshot.docChanges
          : (snapshot.docs || []).map((doc) => ({
              doc: doc as WatchDoc,
              docId: String((doc as { _id?: string })._id ?? roomId),
              dataType: 'init',
            }));

        changes.forEach((change) => {
          const { id, raw } = readWatchDoc(change);
          void this._dispatchRoomSnapshot(id || roomId, raw);
        });
      },
      onError: (err) => {
        if (!this._isBenignWatchError(err)) {
          console.error('[GameWatcher] room error', err);
        }
      },
    });
  }

  static watchGame(gameId: string): void {
    if (typeof wx === 'undefined' || !wx.cloud) return;

    if (this._watchingGameId === gameId && this._gameWatcher) {
      return;
    }

    this.stopGame();
    GameSession.gameId = gameId;
    this._watchingGameId = gameId;
    this._lastGamePhase = null;

    const db = wx.cloud.database();
    this._gameWatcher = db.collection('games').doc(gameId).watch({
      onChange: (snapshot) => {
        snapshot.docChanges.forEach((change) => {
          const { id, raw } = readWatchDoc(change);
          const game = { _id: id || gameId, ...raw } as unknown as GameDoc;
          GameStateMirror.setGame(raw);
          this._dispatchGameEvents(game);
        });
      },
      onError: (err) => {
        if (this._closingGame || this._isBenignWatchError(err)) {
          return;
        }
        console.error('[GameWatcher] game error', err);
      },
    });
  }

  private static _dispatchGameEvents(game: GameDoc): void {
    const phase = game.phase;
    const prev = this._lastGamePhase;

    this.lastGamePushAt = Date.now();

    if (prev === null) {
      EventBus.emit('game_start', game);
    } else if (phase === 'BOARD' || phase === 'SETTLED') {
      EventBus.emit('game_update', game);
    }

    if (prev !== 'MINIGAME_BLUFF' && phase === 'MINIGAME_BLUFF') {
      EventBus.emit('minigame_start', game);
    } else if (prev === 'MINIGAME_BLUFF' && phase === 'MINIGAME_BLUFF') {
      EventBus.emit('minigame_update', game);
    }

    if (prev === 'MINIGAME_BLUFF' && phase === 'BOARD') {
      EventBus.emit('minigame_end', game);
    }

    const fin = game.settlement?.finishedAt;
    if (game.settlement && fin !== this._lastSettlementFin) {
      this._lastSettlementFin = fin ?? Date.now();
      EventBus.emit('game_over', game);
    }

    this._lastGamePhase = phase;
  }

  static stopRoom(): void {
    this._safeClose(this._roomWatcher);
    this._roomWatcher = null;
  }

  static stopGame(): void {
    this._closingGame = true;
    this._safeClose(this._gameWatcher);
    this._gameWatcher = null;
    this._watchingGameId = null;
    this._lastGamePhase = null;
    this._lastSettlementFin = null;
    this._closingGame = false;
  }

  static stopAll(): void {
    this.stopRoom();
    this.stopGame();
  }

  /** 订阅便捷方法 */
  static on<T extends WatchEventType>(
    event: T,
    handler: (payload: Parameters<typeof EventBus.emit<T>>[1]) => void,
  ): void {
    EventBus.on(event, handler);
  }

  static off<T extends WatchEventType>(
    event: T,
    handler: (payload: Parameters<typeof EventBus.emit<T>>[1]) => void,
  ): void {
    EventBus.off(event, handler);
  }
}
