import { _decorator, Component } from 'cc';

import { EventBus } from '../core/EventBus';

import { GameSession } from '../core/GameSession';

import { SceneLoader } from '../core/SceneLoader';

import { GameWatcher } from '../network/GameWatcher';

import { leaveRoom, matchPoll, startRoom } from '../network/LobbyService';

import { quitGame } from '../network/GameService';

import type { RoomVO } from '../types/GameTypes';



const { ccclass } = _decorator;



export type RoomUiCallbacks = {

  onStatus: (text: string) => void;

  onRoomUpdate: (room: RoomVO) => void;

  onDisbanded: () => void;

};



/**

 * 房间内 watch、开始游戏、解散提示 → AC-3、AC-4

 */

@ccclass('RoomController')

export class RoomController extends Component {

  private _callbacks: RoomUiCallbacks | null = null;

  private _roomId: string | null = null;

  private _starting = false;

  private _roomPollTimer: ReturnType<typeof setInterval> | null = null;

  /** 正在切到棋盘场景，onDestroy 时勿当作「退出房间」 */

  private _enteringGame = false;



  /** 微信构建后 class field 箭头函数可能丢失，用 bind 句柄注册 EventBus */

  private _roomUpdateHandler!: (room: RoomVO) => void;

  private _disbandedHandler!: () => void;

  private _matchFoundHandler!: (payload: { gameId?: string }) => void;



  onLoad(): void {

    this._roomUpdateHandler = (room: RoomVO) => this._handleRoomUpdate(room);

    this._disbandedHandler = () => this._handleDisbanded();

    this._matchFoundHandler = (payload: { gameId?: string }) => this._handleMatchFound(payload);

  }



  private _handleRoomUpdate(room: RoomVO): void {

    if (!this.isValid || this._enteringGame) return;

    this._callbacks?.onRoomUpdate(room);

    if (room.status === 'PLAYING') {

      if (room.gameId) {

        this._enterGame(String(room.gameId));

      } else {

        void this._resolvePlayingRoom();

      }

    }

  }



  private _handleDisbanded(): void {

    if (!this.isValid || this._enteringGame) return;

    this._detachWatchers();

    this._callbacks?.onDisbanded();

  }



  private _handleMatchFound(payload: { gameId?: string }): void {

    if (!this.isValid || this._enteringGame) return;

    if (payload.gameId) {

      this._enterGame(payload.gameId);

    }

  }



  bind(callbacks: RoomUiCallbacks): void {

    this._callbacks = callbacks;

  }



  enterRoom(roomId: string): void {

    this._detachWatchers();

    this._roomId = roomId;

    GameSession.roomId = roomId;

    GameWatcher.watchRoom(roomId);

    GameWatcher.on('room_update', this._roomUpdateHandler);

    GameWatcher.on('room_disbanded', this._disbandedHandler);

    GameWatcher.on('match_found', this._matchFoundHandler);

    this._callbacks?.onStatus('已连接房间，等待玩家…');

    this._startRoomPoll();

  }



  private _startRoomPoll(): void {

    this._stopRoomPoll();

    this._roomPollTimer = setInterval(() => void this._pollRoom(), 4000);

    void this._pollRoom();

  }



  private _stopRoomPoll(): void {

    if (this._roomPollTimer) {

      clearInterval(this._roomPollTimer);

      this._roomPollTimer = null;

    }

  }



  private async _pollRoom(): Promise<void> {

    const roomId = this._roomId;

    if (!roomId || !this.isValid || this._enteringGame) return;

    void matchPoll().catch((err) => console.warn('[Room] match poll', err));

    if (Date.now() - GameWatcher.lastRoomPushAt < 4000) return;



    const room = await GameWatcher.pullRoomSnapshot(roomId);

    if (!room || !this.isValid || this._enteringGame) return;

    this._roomUpdateHandler(room);

  }



  private async _resolvePlayingRoom(): Promise<void> {

    const roomId = this._roomId;

    if (!roomId || !this.isValid || this._enteringGame) return;

    const room = await GameWatcher.pullRoomSnapshot(roomId);

    if (room?.status === 'PLAYING' && room.gameId) {

      this._enterGame(String(room.gameId));

    }

  }



  async tryStart(): Promise<void> {

    if (!this._roomId || this._starting) return;

    const user = GameSession.user;

    if (!user) return;



    this._starting = true;

    try {

      const res = await startRoom(this._roomId);

      if (res.gameId) {

        this._enterGame(res.gameId);

      }

    } catch (err: unknown) {

      const msg = err instanceof Error ? err.message : String(err);

      this._callbacks?.onStatus(`开始失败：${msg}`);

    } finally {

      this._starting = false;

    }

  }



  /** 即将进入棋盘（匹配成功或房主开始），避免场景销毁时误触发 quit */

  markEnteringGame(): void {

    this._enteringGame = true;

    this._detachWatchers();

  }



  private _enterGame(gameId: string): void {

    if (this._enteringGame) return;

    this.markEnteringGame();

    GameSession.gameId = gameId;

    this._callbacks?.onStatus('对局开始，进入棋盘…');

    SceneLoader.loadBoard();

  }



  /** 仅断开房间 watch，不触发退房/认输 */

  detachOnly(): void {

    this._detachWatchers();

  }



  private _detachWatchers(): void {

    this._stopRoomPoll();

    if (this._roomUpdateHandler) {

      GameWatcher.off('room_update', this._roomUpdateHandler);

    }

    if (this._disbandedHandler) {

      GameWatcher.off('room_disbanded', this._disbandedHandler);

    }

    if (this._matchFoundHandler) {

      GameWatcher.off('match_found', this._matchFoundHandler);

    }

    GameWatcher.stopRoom();

    this._roomId = null;

    GameSession.clearRoom();

  }



  /** 用户主动离开房间 UI（返回大厅等） */

  stop(): void {

    if (this._enteringGame) {

      return;

    }

    const roomId = this._roomId;

    const gameId = GameSession.gameId;

    if (gameId) {

      void quitGame(gameId).catch((err) => console.warn('[Room] quit on stop', err));

    } else if (roomId) {

      void leaveRoom(roomId).catch((err) => console.warn('[Room] leave on stop', err));

    }

    this._detachWatchers();

  }



  onDestroy(): void {

    if (!this._enteringGame) {

      this.stop();

    }

  }

}


