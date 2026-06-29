// 视线（LOS）系统（specs/260629-map-terrain Phase 2，AC-MT-4/5/8）。
// 纯几何、零 RNG、零 cc 依赖，AC-13 确定性不破。
//
// 规则：用 Bresenham 直线从 attacker 到 target 中间格，
// 遇到 BLOCKS_LOS_TYPES 地形（ROCK/ICE_WALL/FREEZE_WALL）则视线被挡。
// 地面型（SAND_PIT / ICE_TILE / LAVA_TILE）不挡视线（AC-MT-5）。
// 近战（range=1）调用方不调用本模块（AC-MT-4）。

import { BLOCKS_LOS_TYPES } from './PveConstants';
import type { Coord, FloorState } from './PveTypes';

/**
 * Bresenham 直线：返回从 a 到 b（不含 a 和 b 本身）的中间格序列，顺序从 a 到 b。
 * 使用整数算术，确定性，无浮点误差。
 */
export function bresenhamLine(a: Coord, b: Coord): Coord[] {
  const cells: Coord[] = [];
  let x = a.x, y = a.y;
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
  const sx = b.x > a.x ? 1 : -1;
  const sy = b.y > a.y ? 1 : -1;
  let err = dx - dy;

  while (x !== b.x || y !== b.y) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx)  { err += dx; y += sy; }
    // 跳过终点（终点是目标本身，不算中间格）
    if (x === b.x && y === b.y) break;
    cells.push({ x, y });
  }
  return cells;
}

/**
 * 判定 from → to 的视线是否被地形遮挡。
 * 返回第一个遮挡格坐标（如有），否则 null。
 * range=1 的调用方不应调用此函数（相邻无中间格，永远返回 null）。
 */
export function checkLos(floor: FloorState, from: Coord, to: Coord): Coord | null {
  const line = bresenhamLine(from, to);
  for (const cell of line) {
    const blocker = floor.entities.find(
      (e) => !e.consumed && BLOCKS_LOS_TYPES.has(e.type) && e.pos.x === cell.x && e.pos.y === cell.y,
    );
    if (blocker) return cell;
  }
  return null;
}
