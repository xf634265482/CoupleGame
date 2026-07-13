/** 已移除 PVP 后仍由登录与通用事件总线复用的最小兼容类型。 */
export type WatchEventType = 'room_update' | 'room_disbanded' | 'match_found' | 'game_start' | 'game_update' | 'game_over';
export interface UserVO { id: string; nickname: string; avatarUrl?: string; diamond?: number; [key: string]: unknown; }
export interface RoomVO { id?: string; status?: string; [key: string]: unknown; }
export interface GameDoc { id?: string; status?: string; [key: string]: unknown; }
export interface LoginResponse { ok: boolean; user?: UserVO; code?: string; message?: string; }
