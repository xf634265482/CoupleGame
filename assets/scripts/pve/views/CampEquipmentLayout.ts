import {
  CAMP_BAG_COLS,
  CAMP_BAG_DEFAULT_SLOTS,
  CAMP_SLOT_GAP,
  CAMP_SLOT_SIZE,
  campBagBlockHeight,
} from './CampLayoutConstants';
import { normalizeBagCapacity } from '../core/CampBagUpgrade';
import {
  CAMP_FURNACE_STAGE_HEIGHT,
  CAMP_SYNTH_STAGE_WIDTH,
  furnaceSlotLocals,
} from './CampSynthStageLayout';

export interface LayoutBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerY: number;
}

/** 装备台：穿戴 + 背包(固定25) + 熔炉合成台；整页 ScrollView。格子统一正方形 96。 */
export const CAMP_EQUIPMENT_LAYOUT = {
  viewportWidth: 570,
  viewportHeight: 720,
  loadoutSlotSize: CAMP_SLOT_SIZE,
  loadoutSlotGap: 14,
  bagSlots: CAMP_BAG_DEFAULT_SLOTS,
  bagCols: CAMP_BAG_COLS,
  bagSize: CAMP_SLOT_SIZE,
  bagGap: CAMP_SLOT_GAP,
  synthSlotSize: CAMP_SLOT_SIZE,
  synthStageWidth: CAMP_SYNTH_STAGE_WIDTH,
  synthStageHeight: CAMP_FURNACE_STAGE_HEIGHT,
  synthInputCount: 3,
  synthButtonWidth: 160,
  synthButtonHeight: 48,
  contentTopPadding: 18,
  contentBottomPadding: 80,
} as const;

/** Pack from content top — no empty band above summary. */
export function equipmentContentMetrics(bagCapacity: number = CAMP_BAG_DEFAULT_SLOTS): {
  contentHeight: number;
  loadoutTitleY: number;
  loadoutY: number;
  filterY: number;
  bagTitleY: number;
  bagFirstRowY: number;
  bagSlots: number;
  synthStageY: number;
  synthTitleY: number;
  synthResultY: number;
  synthInputY: number;
  synthInputXs: readonly [number, number, number];
  synthButtonY: number;
} {
  const L = CAMP_EQUIPMENT_LAYOUT;
  const bagSlots = normalizeBagCapacity(bagCapacity);
  const locals = furnaceSlotLocals();
  let fromTop = L.contentTopPadding;
  const loadoutTitleFromTop = fromTop + 12;
  fromTop += 28;
  fromTop += 10;
  const loadoutFromTop = fromTop + L.loadoutSlotSize / 2 + 18;
  fromTop += 18 + L.loadoutSlotSize;
  fromTop += 18;
  const filterFromTop = fromTop + 20;
  fromTop += 44;
  fromTop += 10;
  const bagTitleFromTop = fromTop + 12;
  fromTop += 28;
  fromTop += 18;
  const bagFirstRowFromTop = fromTop + L.bagSize / 2;
  fromTop += campBagBlockHeight(bagSlots);
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
    loadoutTitleY: toY(loadoutTitleFromTop),
    loadoutY: toY(loadoutFromTop),
    filterY: toY(filterFromTop),
    bagTitleY: toY(bagTitleFromTop),
    bagFirstRowY: toY(bagFirstRowFromTop),
    bagSlots,
    synthStageY,
    synthTitleY: synthStageY + L.synthStageHeight / 2 - 22,
    synthResultY: synthStageY + locals.result.y,
    synthInputY: synthStageY + locals.inputs[0]!.y,
    synthInputXs: [locals.inputs[0]!.x, locals.inputs[1]!.x, locals.inputs[2]!.x] as const,
    synthButtonY: toY(synthButtonFromTop),
  };
}

export function intersects(a: LayoutBounds, b: LayoutBounds): boolean {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
}
