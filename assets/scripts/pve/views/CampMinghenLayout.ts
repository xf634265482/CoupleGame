import {
  CAMP_BAG_COLS,
  CAMP_BAG_SLOTS,
  CAMP_SLOT_GAP,
  CAMP_SLOT_SIZE,
  campBagBlockHeight,
} from './CampLayoutConstants';
import {
  CAMP_STARCHART_STAGE_HEIGHT,
  CAMP_SYNTH_STAGE_WIDTH,
  starchartSlotLocals,
} from './CampSynthStageLayout';

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerY: number;
}

/** 命痕台：装配 + 背包(固定25) + 星盘合成台；整页 ScrollView。格子统一正方形 96。 */
export const CAMP_MINGHEN_LAYOUT = {
  viewportWidth: 570,
  viewportHeight: 720,
  equippedSlots: 10,
  columns: CAMP_BAG_COLS,
  cardWidth: CAMP_SLOT_SIZE,
  cardHeight: CAMP_SLOT_SIZE,
  cardGap: CAMP_SLOT_GAP,
  bagSlots: CAMP_BAG_SLOTS,
  bagColumns: CAMP_BAG_COLS,
  bagSize: CAMP_SLOT_SIZE,
  bagGap: CAMP_SLOT_GAP,
  synthSlotSize: CAMP_SLOT_SIZE,
  synthStageWidth: CAMP_SYNTH_STAGE_WIDTH,
  synthStageHeight: CAMP_STARCHART_STAGE_HEIGHT,
  synthButtonWidth: 160,
  synthButtonHeight: 48,
  contentTopPadding: 18,
  contentBottomPadding: 80,
} as const;

export function equippedGridHeight(): number {
  const { cardHeight, cardGap } = CAMP_MINGHEN_LAYOUT;
  return 2 * cardHeight + cardGap;
}

/**
 * Pack layout from content top so ScrollView has no empty band above summary.
 * Returned Y values are center-origin (Cocos content node).
 */
export function minghenContentMetrics(): {
  contentHeight: number;
  equippedTitleY: number;
  firstRowY: number;
  filterY: number;
  bagTitleY: number;
  bagFirstRowY: number;
  synthStageY: number;
  synthTitleY: number;
  synthResultY: number;
  synthInputY: number;
  synthInputLeftX: number;
  synthInputRightX: number;
  synthButtonY: number;
} {
  const L = CAMP_MINGHEN_LAYOUT;
  const locals = starchartSlotLocals();
  let fromTop = L.contentTopPadding;
  const equippedTitleFromTop = fromTop + 12;
  fromTop += 28;
  fromTop += 6;
  const firstRowFromTop = fromTop + L.cardHeight / 2;
  fromTop += equippedGridHeight();
  fromTop += 18;
  const filterFromTop = fromTop + 20;
  fromTop += 44;
  fromTop += 10;
  const bagTitleFromTop = fromTop + 12;
  fromTop += 28;
  fromTop += 18;
  const bagFirstRowFromTop = fromTop + L.bagSize / 2;
  fromTop += campBagBlockHeight();
  fromTop += 20;
  const stageCenterFromTop = fromTop + L.synthStageHeight / 2;
  fromTop += L.synthStageHeight;
  fromTop += 16;
  const synthButtonFromTop = fromTop + L.synthButtonHeight / 2;
  fromTop += L.synthButtonHeight / 2 + L.contentBottomPadding;

  const contentHeight = Math.max(L.viewportHeight, fromTop);
  const toY = (distanceFromTop: number): number => contentHeight / 2 - distanceFromTop;
  const synthStageY = toY(stageCenterFromTop);

  return {
    contentHeight,
    equippedTitleY: toY(equippedTitleFromTop),
    firstRowY: toY(firstRowFromTop),
    filterY: toY(filterFromTop),
    bagTitleY: toY(bagTitleFromTop),
    bagFirstRowY: toY(bagFirstRowFromTop),
    synthStageY,
    synthTitleY: synthStageY + L.synthStageHeight / 2 - 22,
    synthResultY: synthStageY + locals.result.y,
    synthInputY: synthStageY + locals.inputs[0]!.y,
    synthInputLeftX: locals.inputs[0]!.x,
    synthInputRightX: locals.inputs[1]!.x,
    synthButtonY: toY(synthButtonFromTop),
  };
}

export function rectBounds(rect: LayoutRect): LayoutBounds {
  return {
    left: rect.x - rect.width / 2,
    right: rect.x + rect.width / 2,
    top: rect.y + rect.height / 2,
    bottom: rect.y - rect.height / 2,
    centerY: rect.y,
  };
}

export function cardBounds(index: number): LayoutBounds {
  const metrics = minghenContentMetrics();
  const { columns, cardWidth, cardHeight, cardGap } = CAMP_MINGHEN_LAYOUT;
  const totalWidth = columns * cardWidth + (columns - 1) * cardGap;
  const column = index % columns;
  const row = Math.floor(index / columns);
  return rectBounds({
    x: -totalWidth / 2 + cardWidth / 2 + column * (cardWidth + cardGap),
    y: metrics.firstRowY - row * (cardHeight + cardGap),
    width: cardWidth,
    height: cardHeight,
  });
}

export function intersects(a: LayoutBounds, b: LayoutBounds): boolean {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
}
