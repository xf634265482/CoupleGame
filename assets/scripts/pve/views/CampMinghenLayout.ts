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
  viewportHeight: 720,
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
  contentTop: 320,
  summaryY: 320,
  equippedTitleY: 270,
  firstRowY: 220,
  synthSlotWidth: 120,
  synthSlotHeight: 56,
  synthResultYOffset: 0,
  synthInputYOffset: -90,
  synthInputX: 90,
  synthButtonWidth: 160,
  synthButtonHeight: 48,
  contentBottomPadding: 100,
} as const;

export function equippedGridHeight(): number {
  const { cardHeight, cardGap } = CAMP_MINGHEN_LAYOUT;
  return 2 * cardHeight + cardGap;
}

export function ownedRows(ownedCount: number): number {
  return Math.ceil(Math.max(0, ownedCount) / CAMP_MINGHEN_LAYOUT.ownedColumns);
}

export function ownedBlockHeight(ownedCount: number): number {
  const { ownedCardHeight, ownedGap } = CAMP_MINGHEN_LAYOUT;
  const rows = ownedRows(ownedCount);
  if (rows <= 0) return 0;
  return rows * (ownedCardHeight + ownedGap);
}

/** Content Y positions from top of scroll content (positive up in Cocos). */
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
  const ownedH = ownedBlockHeight(ownedCount);
  const ownedBottom = ownedH > 0 ? ownedFirstRowY - ownedH : ownedTitleY - 12;
  const synthTitleY = ownedBottom - 28;
  const synthResultY = synthTitleY - 48;
  const synthInputY = synthResultY + L.synthInputYOffset;
  const synthButtonY = synthInputY - (L.synthSlotHeight / 2 + L.synthButtonHeight / 2 + 20);
  const top = L.summaryY + 36;
  const bottom = synthButtonY - L.synthButtonHeight / 2 - L.contentBottomPadding;
  return {
    contentHeight: Math.max(L.viewportHeight, top - bottom),
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
