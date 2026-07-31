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

/** 装备台：穿戴 + 背包(固定25) + 合成；整页 ScrollView。格子统一正方形 96。 */
export const CAMP_EQUIPMENT_LAYOUT = {
  viewportWidth: 570,
  viewportHeight: 720,
  loadoutSlotSize: CAMP_SLOT_SIZE,
  loadoutSlotGap: 14,
  bagSlots: CAMP_BAG_SLOTS,
  bagCols: CAMP_BAG_COLS,
  bagSize: CAMP_SLOT_SIZE,
  bagGap: CAMP_SLOT_GAP,
  synthSlotSize: CAMP_SLOT_SIZE,
  synthInputCount: 3,
  synthInputXs: [-130, 0, 130] as const,
  synthButtonWidth: 160,
  synthButtonHeight: 48,
  contentTopPadding: 18,
  contentBottomPadding: 80,
} as const;

/** Pack from content top — no empty band above summary. */
export function equipmentContentMetrics(): {
  contentHeight: number;
  summaryY: number;
  loadoutTitleY: number;
  loadoutY: number;
  filterY: number;
  bagTitleY: number;
  bagFirstRowY: number;
  synthTitleY: number;
  synthResultY: number;
  synthInputY: number;
  synthButtonY: number;
} {
  const L = CAMP_EQUIPMENT_LAYOUT;
  let fromTop = L.contentTopPadding;
  const summaryFromTop = fromTop + 22;
  fromTop += 54;
  fromTop += 8;
  const loadoutTitleFromTop = fromTop + 12;
  fromTop += 28;
  fromTop += 10;
  const loadoutFromTop = fromTop + L.loadoutSlotSize / 2 + 18; // title above slot
  fromTop += 18 + L.loadoutSlotSize;
  fromTop += 18;
  const filterFromTop = fromTop + 20;
  fromTop += 44;
  fromTop += 10;
  const bagTitleFromTop = fromTop + 12;
  fromTop += 28;
  fromTop += 18;
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
    loadoutTitleY: toY(loadoutTitleFromTop),
    loadoutY: toY(loadoutFromTop),
    filterY: toY(filterFromTop),
    bagTitleY: toY(bagTitleFromTop),
    bagFirstRowY: toY(bagFirstRowFromTop),
    synthTitleY: toY(synthTitleFromTop),
    synthResultY: toY(synthResultFromTop),
    synthInputY: toY(synthInputFromTop),
    synthButtonY: toY(synthButtonFromTop),
  };
}

export function intersects(a: LayoutBounds, b: LayoutBounds): boolean {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
}
