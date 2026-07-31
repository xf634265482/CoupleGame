export const CAMP_SLOT_SIZE = 96;
export const CAMP_SLOT_GAP = 8;
export const CAMP_BAG_COLS = 5;
/** Default / starter bag capacity; runtime capacity comes from profile.bagCapacity. */
export const CAMP_BAG_DEFAULT_SLOTS = 25;
/** @deprecated Prefer CAMP_BAG_DEFAULT_SLOTS or profile.bagCapacity */
export const CAMP_BAG_SLOTS = CAMP_BAG_DEFAULT_SLOTS;
export const CAMP_BAG_ROWS = CAMP_BAG_DEFAULT_SLOTS / CAMP_BAG_COLS;

export function campBagRows(slots: number): number {
  return Math.ceil(Math.max(1, slots) / CAMP_BAG_COLS);
}

export function campBagBlockHeight(slots: number = CAMP_BAG_DEFAULT_SLOTS): number {
  const rows = campBagRows(slots);
  return rows * CAMP_SLOT_SIZE + (rows - 1) * CAMP_SLOT_GAP;
}
