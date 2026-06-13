// 战争迷雾系统（design §5）：地图初始全隐藏，仅显示玩家附近区域，移动后逐步揭开。
// 纯函数：不修改入参的 revealed 矩阵，返回"新揭示"的格子坐标列表（供 Controller 播放揭示动画）。

import { FOG_REVEAL_RADIUS } from './PveConstants';
import type { Coord } from './PveTypes';

/**
 * 创建一个全 false 的 size×size 揭示矩阵：revealed[y][x]。
 */
export function createFogGrid(size: number): boolean[][] {
  const grid: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    grid.push(new Array<boolean>(size).fill(false));
  }
  return grid;
}

function inBounds(size: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

/**
 * 以 center 为中心、按曼哈顿距离 radius 揭示格子。
 * 直接原地修改 revealed（FloorState 中的矩阵），返回本次新揭示（此前未揭示）的坐标列表。
 * 已揭示的格子不会重复出现在返回值中（幂等）。
 */
export function revealAround(
  revealed: boolean[][],
  center: Coord,
  radius: number = FOG_REVEAL_RADIUS,
): Coord[] {
  const size = revealed.length;
  const newly: Coord[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    const remain = radius - Math.abs(dy);
    for (let dx = -remain; dx <= remain; dx++) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (!inBounds(size, x, y)) continue;
      if (revealed[y][x]) continue;
      revealed[y][x] = true;
      newly.push({ x, y });
    }
  }
  return newly;
}

/**
 * 不修改入参，返回揭示后的新矩阵（深拷贝）+ 新揭示坐标。core 的 ApplyResult 模式倾向于不可变，
 * 在性能敏感路径（如 MapGenerator 初始化）可直接用 revealAround 原地操作刚创建的矩阵。
 */
export function reveal(
  revealed: boolean[][],
  center: Coord,
  radius: number = FOG_REVEAL_RADIUS,
): { revealed: boolean[][]; cells: Coord[] } {
  const next = revealed.map((row) => row.slice());
  const cells = revealAround(next, center, radius);
  return { revealed: next, cells };
}

export function isRevealed(revealed: boolean[][], pos: Coord): boolean {
  const size = revealed.length;
  if (!inBounds(size, pos.x, pos.y)) return false;
  return revealed[pos.y][pos.x];
}
