/**
 * 棋盘三区域：按格子在环路上的局部 X 坐标三等分（左/中/右），与客户端 boardLayout 一致。
 */
const { BOARD_SIZE } = require('./constants');

const SEG_BOTTOM = 25;
const SEG_RIGHT = 13;
const SEG_TOP = 25;
const SEG_LEFT = BOARD_SIZE - SEG_BOTTOM - SEG_RIGHT - SEG_TOP;

const RECT_W = 940;
const RECT_H = 400;

function halfW() {
  return RECT_W / 2;
}

function halfH() {
  return RECT_H / 2;
}

function cellLocalXY(index) {
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

function regionFromX(x) {
  const edge = halfW() / 3;
  if (x < -edge) return 0;
  if (x > edge) return 2;
  return 1;
}

function buildCellRegionMap() {
  const map = new Array(BOARD_SIZE);
  for (let i = 0; i < BOARD_SIZE; i++) {
    map[i] = regionFromX(cellLocalXY(i).x);
  }
  return map;
}

const CELL_REGION = buildCellRegionMap();

function regionBandRect(regionIndex) {
  const hw = halfW();
  const hh = halfH();
  const bandW = (hw * 2) / 3;
  const bandH = hh * 1.05;
  const cx = -hw + bandW * (regionIndex + 0.5);
  return { cx, cy: 0, w: bandW - 10, h: bandH - 10 };
}

function positionRegionIndex(position) {
  const idx = ((position % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  return CELL_REGION[idx];
}

function regionCenterXY(regionIndex) {
  const { cx, cy } = regionBandRect(regionIndex);
  return { x: cx, y: cy };
}

function markRegionVisited(player, cellIndex) {
  const region = positionRegionIndex(cellIndex);
  if (!Array.isArray(player.visitedRegionsThisTurn)) {
    player.visitedRegionsThisTurn = [];
  }
  if (!player.visitedRegionsThisTurn.includes(region)) {
    player.visitedRegionsThisTurn.push(region);
  }
}

function canAttackNeutralRegion(player, regionIndex) {
  const visited = player.visitedRegionsThisTurn || [];
  return visited.includes(regionIndex);
}

module.exports = {
  CELL_REGION,
  positionRegionIndex,
  regionCenterXY,
  regionBandRect,
  markRegionVisited,
  canAttackNeutralRegion,
};
