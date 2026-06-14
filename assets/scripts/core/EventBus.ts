import type { WatchEventType } from '../types/GameTypes';
import type { GameDoc, RoomVO } from '../types/GameTypes';

type EventPayload = {
  room_update: RoomVO;
  room_disbanded: { reason?: string };
  match_found: { roomId: string; gameId?: string };
  game_start: GameDoc;
  game_update: GameDoc;
  game_over: GameDoc;
};

type Handler<T extends WatchEventType> = (payload: EventPayload[T]) => void;

export class EventBus {
  private static _handlers = new Map<string, Set<(p: unknown) => void>>();

  static on<T extends WatchEventType>(event: T, handler: Handler<T>): void {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event)!.add(handler as (p: unknown) => void);
  }

  static off<T extends WatchEventType>(event: T, handler: Handler<T>): void {
    this._handlers.get(event)?.delete(handler as (p: unknown) => void);
  }

  static emit<T extends WatchEventType>(event: T, payload: EventPayload[T]): void {
    this._handlers.get(event)?.forEach((h) => h(payload));
  }

  static clear(): void {
    this._handlers.clear();
  }
}
