export interface LayoutBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerY: number;
}

/** 装备台：穿戴 + 背包 + 合成（上1下3）；整页 ScrollView。 */
export const CAMP_EQUIPMENT_LAYOUT = {
  viewportWidth: 570,
  viewportHeight: 720,
  summaryY: 320,
  loadoutTitleY: 275,
  loadoutSlotSize: 88,
  loadoutSlotGap: 18,
  loadoutY: 185,
  bagCols: 5,
  bagSize: 96,
  bagGap: 10,
  synthSlotWidth: 100,
  synthSlotHeight: 56,
  synthInputCount: 3,
  synthInputXs: [-130, 0, 130] as const,
  synthButtonWidth: 160,
  synthButtonHeight: 48,
  /** 滚到底时合成按钮下方留白，避免 Mask 裁切。 */
  contentBottomPadding: 100,
} as const;

export function bagRows(count: number): number {
  return Math.ceil(Math.max(0, count) / CAMP_EQUIPMENT_LAYOUT.bagCols);
}

export function equipmentContentMetrics(bagCount: number): {
  contentHeight: number;
  bagTitleY: number;
  bagFirstRowY: number;
  synthTitleY: number;
  synthResultY: number;
  synthInputY: number;
  synthButtonY: number;
} {
  const L = CAMP_EQUIPMENT_LAYOUT;
  const loadoutBottom = L.loadoutY - L.loadoutSlotSize / 2 - 24;
  const bagTitleY = loadoutBottom - 20;
  const bagFirstRowY = bagTitleY - 50;
  const rows = bagRows(bagCount);
  const bagBottom = rows > 0
    ? bagFirstRowY - rows * (L.bagSize + L.bagGap)
    : bagTitleY - 12;
  const synthTitleY = bagBottom - 28;
  const synthResultY = synthTitleY - 48;
  const synthInputY = synthResultY - 88;
  const synthButtonY = synthInputY - (L.synthSlotHeight / 2 + L.synthButtonHeight / 2 + 20);
  const top = L.summaryY + 36;
  const bottom = synthButtonY - L.synthButtonHeight / 2 - L.contentBottomPadding;
  return {
    contentHeight: Math.max(L.viewportHeight, top - bottom),
    bagTitleY,
    bagFirstRowY,
    synthTitleY,
    synthResultY,
    synthInputY,
    synthButtonY,
  };
}

export function intersects(a: LayoutBounds, b: LayoutBounds): boolean {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
}
