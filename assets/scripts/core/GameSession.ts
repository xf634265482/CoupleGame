import type { UserVO } from '../types/GameTypes';

/** 跨场景会话单例 */
export class GameSession {
  private static _user: UserVO | null = null;
  private static _roomId: string | null = null;
  private static _gameId: string | null = null;

  static get user(): UserVO | null {
    return this._user;
  }

  static set user(v: UserVO | null) {
    this._user = v;
  }

  static get roomId(): string | null {
    return this._roomId;
  }

  static set roomId(v: string | null) {
    this._roomId = v;
  }

  static get gameId(): string | null {
    return this._gameId;
  }

  static set gameId(v: string | null) {
    this._gameId = v;
  }

  static clearRoom(): void {
    this._roomId = null;
  }

  static clearGame(): void {
    this._gameId = null;
  }
}
