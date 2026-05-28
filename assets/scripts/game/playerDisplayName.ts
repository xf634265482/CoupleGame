import type { GamePlayer } from '../types/GameTypes';

/** 对局内统一展示名（与是否本人无关，避免「玩家」/「玩家1」混用） */
export function playerDisplayName(p: GamePlayer): string {
  const n = p.nickname?.trim();
  if (n) return n;
  return `玩家${p.seat + 1}`;
}
