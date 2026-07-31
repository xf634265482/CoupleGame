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

/** 命痕台：装配 + 背包(固定25) + 合成；整页 ScrollView。格子统一正方形 96。 */
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
  synthInputX: 110,
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
  summaryY: number;
  equippedTitleY: number;
  firstRowY: number;
  filterY: number;
  bagTitleY: number;
  bagFirstRowY: number;
  synthTitleY: number;
  synthResultY: number;
  synthInputY: number;
  synthButtonY: number;
} {
  const L = CAMP_MINGHEN_LAYOUT;
  let fromTop = L.contentTopPadding;
  const summaryFromTop = fromTop + 22;
  fromTop += 54;
  fromTop += 10;
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
  fromTop += 18; // clear title before first bag row
  const bagFirstRowFromTop = fromTop + L.bagSize / 2;
  fromTop += campBagBlockHeight();
  fromTop += 24;
  const synthTitleFromTop = fromTop + 12;
  fromTop += 28;
  fromTop += L.synthSlotSize / 2 + 20;
  const synthResultFromTop = fromTop;
  fromTop += L.synthSlotSize + 16;
  const synthInputFromTop = fromTop;
  fromTop += L.synthSlotSize / 2 + L.synthButtonHeight / 2 + 20;
  const synthButtonFromTop = fromTop;
  fromTop += L.synthButtonHeight / 2 + L.contentBottomPadding;

  const contentHeight = Math.max(L.viewportHeight, fromTop);
  const toY = (distanceFromTop: number): number => contentHeight / 2 - distanceFromTop;

  return {
    contentHeight,
    summaryY: toY(summaryFromTop),
    equippedTitleY: toY(equippedTitleFromTop),
    firstRowY: toY(firstRowFromTop),
    filterY: toY(filterFromTop),
    bagTitleY: toY(bagTitleFromTop),
    bagFirstRowY: toY(bagFirstRowFromTop),
    synthTitleY: toY(synthTitleFromTop),
    synthResultY: toY(synthResultFromTop),
    synthInputY: toY(synthInputFromTop),
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
