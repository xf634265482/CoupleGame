import {
  CAMP_BAG_COLS,
  CAMP_BAG_SLOTS,
  CAMP_SLOT_GAP,
  CAMP_SLOT_SIZE,
  campBagBlockHeight,
} from './CampLayoutConstants';

export interface LayoutBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerY: number;
}

/** 装备台：穿戴 + 共用库存(固定25) + 合成；整页 ScrollView。格子统一正方形 96。 */
export const CAMP_EQUIPMENT_LAYOUT = {
  viewportWidth: 570,
  viewportHeight: 720,
  summaryY: 320,
  loadoutTitleY: 275,
  loadoutSlotSize: CAMP_SLOT_SIZE,
  loadoutSlotGap: 14,
  loadoutY: 175,
  bagSlots: CAMP_BAG_SLOTS,
  bagCols: CAMP_BAG_COLS,
  bagSize: CAMP_SLOT_SIZE,
  bagGap: CAMP_SLOT_GAP,
  filterYOffset: 28,
  bagTitleYOffset: 36,
  synthSlotSize: CAMP_SLOT_SIZE,
  synthInputCount: 3,
  synthInputXs: [-130, 0, 130] as const,
  synthButtonWidth: 160,
  synthButtonHeight: 48,
  contentBottomPadding: 100,
} as const;

/** Content metrics with fixed 25-slot bag block (no count-based growth). */
export function equipmentContentMetrics(): {
  contentHeight: number;
  filterY: number;
  bagTitleY: number;
  bagFirstRowY: number;
  synthTitleY: number;
  synthResultY: number;
  synthInputY: number;
  synthButtonY: number;
} {
  const L = CAMP_EQUIPMENT_LAYOUT;
  const loadoutBottom = L.loadoutY - L.loadoutSlotSize / 2 - 24;
  const filterY = loadoutBottom - L.filterYOffset;
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
    contentHeight: Math.max(L.viewportHeight, 2 * Math.max(Math.abs(top), Math.abs(bottom))),
    filterY,
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
