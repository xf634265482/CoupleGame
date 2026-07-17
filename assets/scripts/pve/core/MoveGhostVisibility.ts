import type { Coord } from './PveTypes';

/**
 * 移动幽灵终点显隐策略（战士重击击退 / 哨兵逃跑等共用）。
 *
 * - 已揭露：动画期间隐藏真身，结束后 setOccupantVisible(true)。
 * - 未揭露：禁止写入隐藏标记；若已误写入，结束时只 clear suppression，不激活 OccupantArt
 *   （避免雾中露出错误 sprite，同时防止揭雾后图标永久不显示）。
 */
export function shouldHideOccupantForMoveGhost(toRevealed: boolean): boolean {
  return toRevealed;
}

export function moveGhostRestoreMode(toRevealed: boolean): 'activate' | 'clear_suppression_only' {
  return toRevealed ? 'activate' : 'clear_suppression_only';
}

export function isCellRevealed(revealed: ReadonlyArray<ReadonlyArray<boolean>>, cell: Coord): boolean {
  return revealed[cell.y]?.[cell.x] ?? false;
}
