export const MAX_READY_FLOOR = 14 as const;
export const CHAPTER_SIZE = 7 as const;

export function chapterIdForFloor(floor: number): 1 | 2 {
  if (floor < 1 || !Number.isInteger(floor)) throw new Error('INVALID_FLOOR');
  if (floor <= 7) return 1;
  if (floor <= 14) return 2;
  throw new Error('PVE_FLOOR_CONTENT_NOT_READY');
}

export function chapterFloorOf(floor: number): number {
  const chapter = chapterIdForFloor(floor);
  return chapter === 1 ? floor : floor - 7;
}

export function isFloorContentReady(floor: number): boolean {
  return Number.isInteger(floor) && floor >= 1 && floor <= MAX_READY_FLOOR;
}
