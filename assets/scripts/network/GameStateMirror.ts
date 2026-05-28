import type { GameDoc, RoomVO } from '../types/GameTypes';

/** 只读镜像：客户端禁止本地改骰子/金币，仅展示服务端快照 → AC-14 */
export class GameStateMirror {
  private static _room: RoomVO | null = null;
  private static _game: GameDoc | null = null;

  static get room(): RoomVO | null {
    return this._room;
  }

  static get game(): GameDoc | null {
    return this._game;
  }

  static setRoom(doc: Record<string, unknown> | null): void {
    this._room = doc ? (doc as unknown as RoomVO) : null;
  }

  static setGame(doc: Record<string, unknown> | null): void {
    this._game = doc ? (doc as unknown as GameDoc) : null;
  }

  static clear(): void {
    this._room = null;
    this._game = null;
  }
}
