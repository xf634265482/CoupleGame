export const CAMP_SLOT_SIZE = 96;
export const CAMP_SLOT_GAP = 8;
export const CAMP_BAG_COLS = 5;
export const CAMP_BAG_SLOTS = 25;
export const CAMP_BAG_ROWS = CAMP_BAG_SLOTS / CAMP_BAG_COLS;

export function campBagBlockHeight(): number {
  return CAMP_BAG_ROWS * CAMP_SLOT_SIZE + (CAMP_BAG_ROWS - 1) * CAMP_SLOT_GAP;
}
