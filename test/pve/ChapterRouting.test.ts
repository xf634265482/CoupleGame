import { chapterFloorOf, chapterIdForFloor, isFloorContentReady } from '../../assets/scripts/pve/core/chapterRouting';

describe('chapterRouting', () => {
  test('maps global floors to chapter and in-chapter index', () => {
    expect(chapterIdForFloor(1)).toBe(1);
    expect(chapterIdForFloor(7)).toBe(1);
    expect(chapterIdForFloor(8)).toBe(2);
    expect(chapterIdForFloor(14)).toBe(2);
    expect(chapterFloorOf(8)).toBe(1);
    expect(chapterFloorOf(14)).toBe(7);
    expect(isFloorContentReady(14)).toBe(true);
    expect(isFloorContentReady(15)).toBe(false);
    expect(() => chapterIdForFloor(15)).toThrow('PVE_FLOOR_CONTENT_NOT_READY');
  });
});
