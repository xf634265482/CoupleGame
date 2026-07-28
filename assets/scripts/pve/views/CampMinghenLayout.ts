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

/** 命痕台：装配 + 库存 + 合成三角；整页 ScrollView。装配槽 10 = 5 列 × 2 行。 */
export const CAMP_MINGHEN_LAYOUT = {
  viewportWidth: 570,
  viewportHeight: 620,
  equippedSlots: 10,
  columns: 5,
  cardWidth: 106,
  cardHeight: 64,
  cardGap: 6,
  ownedColumns: 4,
  ownedCardWidth: 132,
  ownedCardHeight: 48,
  ownedGap: 8,
  ownedFontSize: 16,
  equippedFontSize: 18,
  contentTop: 280,
  summaryY: 250,
  equippedTitleY: 200,
  firstRowY: 150,
  /** Owned title Y = ownedBlockTop(ownedCount) + 30 — computed in view. */
  synthSlotWidth: 120,
  synthSlotHeight: 56,
  synthResultYOffset: 0,
  synthInputYOffset: -90,
  synthInputX: 90,
  synthButtonWidth: 160,
  synthButtonHeight: 48,
  contentBottomPadding: 40,
} as const;

export function equippedGridHeight(): number {
  const { cardHeight, cardGap } = CAMP_MINGHEN_LAYOUT;
  return 2 * cardHeight + cardGap;
}

export function ownedRows(ownedCount: number): number {
  return Math.max(1, Math.ceil(Math.max(0, ownedCount) / CAMP_MINGHEN_LAYOUT.ownedColumns));
}

export function ownedBlockHeight(ownedCount: number): number {
  const { ownedCardHeight, ownedGap } = CAMP_MINGHEN_LAYOUT;
  return ownedRows(ownedCount) * (ownedCardHeight + ownedGap);
}

/** Content Y positions from top of scroll content (positive up in Cocos, content origin center). */
export function minghenContentMetrics(ownedCount: number): {
  contentHeight: number;
  ownedTitleY: number;
  ownedFirstRowY: number;
  synthTitleY: number;
  synthResultY: number;
  synthInputY: number;
  synthButtonY: number;
} {
  const L = CAMP_MINGHEN_LAYOUT;
  const equippedBottom = L.firstRowY - equippedGridHeight() - 8;
  const ownedTitleY = equippedBottom - 28;
  const ownedFirstRowY = ownedTitleY - 40;
  const ownedBottom = ownedFirstRowY - ownedBlockHeight(ownedCount);
  const synthTitleY = ownedBottom - 36;
  const synthResultY = synthTitleY - 50;
  const synthInputY = synthResultY + L.synthInputYOffset;
  const synthButtonY = synthInputY - 70;
  const top = L.summaryY + 40;
  const bottom = synthButtonY - L.contentBottomPadding;
  const contentHeight = Math.max(L.viewportHeight, top - bottom + 20);
  return {
    contentHeight,
    ownedTitleY,
    ownedFirstRowY,
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
