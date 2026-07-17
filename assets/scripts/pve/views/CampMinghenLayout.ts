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

export const CAMP_MINGHEN_LAYOUT = {
  bodyWidth: 570,
  bodyHeight: 620,
  columns: 4,
  cardWidth: 132,
  cardHeight: 58,
  cardGap: 8,
  firstRowY: 130,
  equippedTitle: { x: 0, y: 175, width: 540, height: 30 },
  ownedTitle: { x: 0, y: -12, width: 540, height: 30 },
  inventory: { x: 0, y: -145, width: 570, height: 210 },
  saveButton: { x: 0, y: -285, width: 180, height: 48 },
} as const;

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
