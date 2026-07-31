import {
  CAMP_BAG_COLS,
  CAMP_BAG_SLOTS,
  CAMP_SLOT_GAP,
  CAMP_SLOT_SIZE,
  campBagBlockHeight,
} from './CampLayoutConstants';

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

/** 命痕台：装配 + 共用库存(固定25) + 合成；整页 ScrollView。格子统一正方形 96。 */
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
  contentTop: 320,
  summaryY: 320,
  equippedTitleY: 270,
  firstRowY: 200,
  filterYOffset: 28,
  bagTitleYOffset: 36,
  synthSlotSize: CAMP_SLOT_SIZE,
  synthInputX: 110,
  synthButtonWidth: 160,
  synthButtonHeight: 48,
  contentBottomPadding: 100,
} as const;

export function equippedGridHeight(): number {
  const { cardHeight, cardGap } = CAMP_MINGHEN_LAYOUT;
  return 2 * cardHeight + cardGap;
}

/** Content Y positions from top of scroll content (positive up in Cocos). Fixed bag = 25 slots. */
export function minghenContentMetrics(): {
  contentHeight: number;
  filterY: number;
  bagTitleY: number;
  bagFirstRowY: number;
  synthTitleY: number;
  synthResultY: number;
  synthInputY: number;
  synthButtonY: number;
} {
  const L = CAMP_MINGHEN_LAYOUT;
  const equippedBottom = L.firstRowY - equippedGridHeight() - 8;
  const filterY = equippedBottom - L.filterYOffset;
  const bagTitleY = filterY - L.bagTitleYOffset;
  const bagFirstRowY = bagTitleY - 44;
  const bagBottom = bagFirstRowY - campBagBlockHeight();
  const synthTitleY = bagBottom - 28;
  const synthResultY = synthTitleY - (L.synthSlotSize / 2 + 28);
  const synthInputY = synthResultY - (L.synthSlotSize + 16);
  const synthButtonY = synthInputY - (L.synthSlotSize / 2 + L.synthButtonHeight / 2 + 20);
  const top = L.summaryY + 36;
  const bottom = synthButtonY - L.synthButtonHeight / 2 - L.contentBottomPadding;
  return {
    contentHeight: Math.max(L.viewportHeight, top - bottom),
    filterY,
    bagTitleY,
    bagFirstRowY,
    synthTitleY,
    synthResultY,
    synthInputY,
    synthButtonY,
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
  const { columns, cardWidth, cardHeight, cardGap, firstRowY } = CAMP_MINGHEN_LAYOUT;
  const totalWidth = columns * cardWidth + (columns - 1) * cardGap;
  const column = index % columns;
  const row = Math.floor(index / columns);
  return rectBounds({
    x: -totalWidth / 2 + cardWidth / 2 + column * (cardWidth + cardGap),
    y: firstRowY - row * (cardHeight + cardGap),
    width: cardWidth,
    height: cardHeight,
  });
}

export function intersects(a: LayoutBounds, b: LayoutBounds): boolean {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
}
