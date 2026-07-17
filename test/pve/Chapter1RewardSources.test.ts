import { CHAPTER1_FLOORS } from '../../assets/scripts/pve/core/chapter1/Chapter1FloorCatalog';
import { MINGHEN_CATALOG } from '../../assets/scripts/pve/core/minghen/MinghenCatalog';
import { getClassicEquipmentTemplate } from '../../assets/scripts/pve/core/EquipmentSystem';

describe('chapter one reward sources', () => {
  test('all chapter-one Minghen appear exactly once in chapter-one floor pools', () => {
    const ids = Object.values(CHAPTER1_FLOORS).flatMap((x) => x.minghenIds);
    expect(ids).toHaveLength(24);
    expect(new Set(ids).size).toBe(24);
    expect(new Set(ids)).toEqual(new Set(MINGHEN_CATALOG.filter((x) => x.sourceFloor <= 7).map((x) => x.id)));
  });

  test('all chapter-one equipment names exist in classic equipment pool', () => {
    const ids = new Set(Object.values(CHAPTER1_FLOORS).flatMap((x) => x.equipmentIds));
    for (const name of ids) {
      expect(getClassicEquipmentTemplate(name)).not.toBeNull();
    }
  });

  test('boss floor uses mid-tier extra pool, not legendaries', () => {
    expect(CHAPTER1_FLOORS[7].equipmentIds).toEqual(['铁战斧', '铁制板甲', '铁制战靴', '铁制重盔', '灵力宝珠']);
    for (let floor = 1; floor <= 6; floor += 1) {
      expect(CHAPTER1_FLOORS[floor].equipmentIds.every((id) => getClassicEquipmentTemplate(id)?.quality !== 'LEGENDARY')).toBe(true);
    }
  });
});
