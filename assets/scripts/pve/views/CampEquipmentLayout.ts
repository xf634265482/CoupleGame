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
  viewportHeight: 620,
  summaryY: 250,
  loadoutTitleY: 210,
  loadoutSlotSize: 88,
  loadoutSlotGap: 18,
  loadoutY: 120,
  bagCols: 5,
  bagSize: 96,
  bagGap: 10,
  synthSlotWidth: 100,
  synthSlotHeight: 56,
  synthInputCount: 3,
  synthInputXs: [-130, 0, 130] as const,
  synthButtonWidth: 160,
  synthButtonHeight: 48,
  contentBottomPadding: 40,
} as const;

export function bagRows(count: number): number {
  return Math.max(1, Math.ceil(Math.max(0, count) / CAMP_EQUIPMENT_LAYOUT.bagCols));
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
  const bagBottom = bagFirstRowY - bagRows(bagCount) * (L.bagSize + L.bagGap);
  const synthTitleY = bagBottom - 36;
  const synthResultY = synthTitleY - 50;
  const synthInputY = synthResultY - 90;
  const synthButtonY = synthInputY - 70;
  const top = L.summaryY + 40;
  const bottom = synthButtonY - L.contentBottomPadding;
  return {
    contentHeight: Math.max(L.viewportHeight, top - bottom + 20),
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
