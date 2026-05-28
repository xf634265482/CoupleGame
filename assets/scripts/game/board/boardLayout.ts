import { Vec3 } from 'cc';
import { BOARD_SIZE } from '../../core/Constants';

/** 棋盘区上移，为底部 HUD 留空 */
export const BOARD_PLAY_CENTER_Y = 200;
export const RADIUS_X = 360;
export const RADIUS_Y = 215;

/** 格子 index 在棋盘局部坐标（与 BoardView 一致） */
export function cellLocalPos(index: number): Vec3 {
  const i = ((index % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  const angle = (i / BOARD_SIZE) * Math.PI * 2 - Math.PI / 2;
  return new Vec3(Math.cos(angle) * RADIUS_X, Math.sin(angle) * RADIUS_Y, 0);
}
