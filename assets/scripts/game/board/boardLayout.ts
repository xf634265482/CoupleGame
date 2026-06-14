import { Vec3 } from 'cc';
import { BOARD_SIZE } from '../../core/Constants';

export type BoardLayoutMetrics = {
  centerY: number;
  rectW: number;
  rectH: number;
  cellSize: number;
  landscape: boolean;
};

const SEG_BOTTOM = 25;
const SEG_RIGHT = 13;
const SEG_TOP = 25;
const SEG_LEFT = BOARD_SIZE - SEG_BOTTOM - SEG_RIGHT - SEG_TOP;

/** 产品固定横屏，不随窗口比例回退竖版布局 */
function readLandscape(): boolean {
  return true;
}

/** 横屏优先：宽棋盘 + 居中；竖屏保留兼容 */
export function getBoardLayoutMetrics(): BoardLayoutMetrics {
  const landscape = readLandscape();
  if (landscape) {
    const rectW = 940;
    const rectH = 400;
    const horizontalPitch = rectW / (SEG_BOTTOM - 1);
    const verticalPitch = rectH / (SEG_RIGHT - 1);
    const gapPitch = Math.min(horizontalPitch, verticalPitch);
    // 1.16 略放大格子贴图；主视角 zoom 下调后仍清晰可辨。
    const cellSize = Math.round(gapPitch * 1.16);
    return {
      landscape: true,
      centerY: 32,
      rectW,
      rectH,
      cellSize,
    };
  }
  return {
    landscape: false,
    centerY: 120,
    rectW: 700,
    rectH: 320,
    cellSize: 30,
  };
}

let _cached: BoardLayoutMetrics | null = null;

export function boardLayoutMetrics(): BoardLayoutMetrics {
  if (!_cached) _cached = getBoardLayoutMetrics();
  return _cached;
}

/** 屏幕旋转后调用，使坐标与当前横竖屏一致 */
export function refreshBoardLayoutMetrics(): BoardLayoutMetrics {
  _cached = getBoardLayoutMetrics();
  return _cached;
}

/** @deprecated 使用 boardLayoutMetrics().centerY */
export const BOARD_PLAY_CENTER_Y = 24;

function halfW() {
  return boardLayoutMetrics().rectW / 2;
}

function halfH() {
  return boardLayoutMetrics().rectH / 2;
}

function cellLocalXY(index: number): { x: number; y: number } {
  const hw = halfW();
  const hh = halfH();
  const i = ((index % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  let x = 0;
  let y = 0;

  if (i < SEG_BOTTOM) {
    const t = SEG_BOTTOM <= 1 ? 0 : i / (SEG_BOTTOM - 1);
    x = -hw + t * hw * 2;
    y = -hh;
  } else if (i < SEG_BOTTOM + SEG_RIGHT) {
    const j = i - SEG_BOTTOM;
    const t = SEG_RIGHT <= 1 ? 0 : j / (SEG_RIGHT - 1);
    x = hw;
    y = -hh + t * hh * 2;
  } else if (i < SEG_BOTTOM + SEG_RIGHT + SEG_TOP) {
    const j = i - SEG_BOTTOM - SEG_RIGHT;
    const t = SEG_TOP <= 1 ? 0 : j / (SEG_TOP - 1);
    x = hw - t * hw * 2;
    y = hh;
  } else {
    const j = i - SEG_BOTTOM - SEG_RIGHT - SEG_TOP;
    const t = SEG_LEFT <= 1 ? 0 : j / (SEG_LEFT - 1);
    x = -hw;
    y = hh - t * hh * 2;
  }

  return { x, y };
}

/** 横边相邻格中心间距 */
export function horizontalCellPitch(): number {
  const m = boardLayoutMetrics();
  return m.rectW / (SEG_BOTTOM - 1);
}

/** 竖边相邻格中心间距（右/左边段格数相近，取右段） */
export function verticalCellPitch(): number {
  const m = boardLayoutMetrics();
  return m.rectH / (SEG_RIGHT - 1);
}

/** 环路上最小格心距（用于尺寸与缩放估算） */
export function cellGapPitch(): number {
  return Math.min(horizontalCellPitch(), verticalCellPitch());
}

/** 棋盘内容包围盒（与 BoardView 根节点一致） */
export function boardContentSize(): { w: number; h: number } {
  const m = boardLayoutMetrics();
  return { w: m.rectW + 80, h: m.rectH + 120 };
}

/** 缩放到整盘棋盘塞进视口（地图/overview 用） */
export function boardOverviewZoom(viewportW: number, viewportH: number, pad = 32): number {
  const { w, h } = boardContentSize();
  return Math.min((viewportW - pad) / w, (viewportH - pad) / h);
}

/**
 * 默认对局缩放：视口内约 10 格宽，比上一版小约 1 倍，避免视野过窄。
 */
export function boardFocusZoom(viewportW: number, viewportH: number, pad = 32): number {
  const pitch = cellGapPitch();
  const cellsW = 11.5;
  const zw = (viewportW - pad) / (cellsW * pitch);
  const overview = boardOverviewZoom(viewportW, viewportH, pad);
  return Math.min(Math.max(zw, overview * 1.05), 2.2);
}

/** 所有格子统一按横格标准绘制的正方形边长 */
export function cellDrawSize(_index?: number): number {
  return boardLayoutMetrics().cellSize;
}

/** 棋子显示边长（约为格子 80%，避免 1024 原图挡住棋盘） */
export function pawnDrawSize(): number {
  const cell = cellDrawSize();
  return Math.max(24, Math.min(38, Math.round(cell * 0.9)));
}

function regionFromX(x: number): number {
  const edge = halfW() / 3;
  if (x < -edge) return 0;
  if (x > edge) return 2;
  return 1;
}

function buildCellRegionMap(): number[] {
  const map = new Array<number>(BOARD_SIZE);
  for (let i = 0; i < BOARD_SIZE; i++) {
    map[i] = regionFromX(cellLocalXY(i).x);
  }
  return map;
}

const CELL_REGION = buildCellRegionMap();

/** 棋盘内左/中/右 33% 区域框（用于 UI 绘制） */
export function regionBandRect(regionIndex: number): {
  cx: number;
  cy: number;
  w: number;
  h: number;
} {
  const hw = halfW();
  const hh = halfH();
  const bandW = (hw * 2) / 3;
  const bandH = hh * 1.05;
  const cx = -hw + bandW * (regionIndex + 0.5);
  return { cx, cy: 0, w: bandW - 10, h: bandH - 10 };
}

/** 区域中心（中立生物 HP 展示） */
export function regionCenterLocal(regionIndex: number): Vec3 {
  const { cx, cy } = regionBandRect(regionIndex);
  return new Vec3(cx, cy, 0);
}

/** 格子 index 在棋盘局部坐标（横版长方形环路径，逻辑 index 0～74 环形） */
export function cellLocalPos(index: number): Vec3 {
  const { x, y } = cellLocalXY(index);
  return new Vec3(x, y, 0);
}

/** 按棋盘左/中/右三等分（与云函数 boardRegions 一致） */
export function positionRegionIndex(position: number): number {
  const idx = ((position % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  return CELL_REGION[idx];
}

export function ringDistance(posA: number, posB: number): number {
  const diff = Math.abs(posA - posB);
  return Math.min(diff, BOARD_SIZE - diff);
}
