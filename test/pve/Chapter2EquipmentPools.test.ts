import { FLOOR_EQUIP_QUALITY_WEIGHTS, rollFloorEquipQuality, equipmentPoolForFloor } from '../../assets/scripts/pve/core/equipment/FixedEquipmentLoot';
import { getClassicEquipmentTemplate } from '../../assets/scripts/pve/core/EquipmentSystem';
import { createRng } from '../../assets/scripts/pve/core/rng';

describe('Chapter2 equipment pools', () => {
  test('floor 8-14 equipment names exist in classic pool', () => {
    expect(equipmentPoolForFloor(8)).toEqual(['铁制长剑', '铁制锁甲', '沙地靴']);
    expect(equipmentPoolForFloor(14)).toEqual(['精钢剑', '精钢板甲', '精制战靴', '精制轻盔', '灵力宝珠']);
    for (const name of ['铁制长剑', '精钢剑', '铁战斧']) {
      expect(getClassicEquipmentTemplate(name)).not.toBeNull();
    }
  });

  test('floor 13 backflow pool includes chapter-two non-boss gear', () => {
    const pool = equipmentPoolForFloor(13);
    expect(pool).toContain('精制轻盔');
    expect(pool).toContain('铁制长剑');
    expect(pool).not.toContain('毒蝎尾刺');
  });

  test('quality table allows epic on floor 14', () => {
    const table = FLOOR_EQUIP_QUALITY_WEIGHTS[14]!;
    expect(table.some(([quality]) => quality === 'EPIC')).toBe(true);
    const rng = createRng(999);
    let epic = false;
    for (let i = 0; i < 200; i += 1) {
      if (rollFloorEquipQuality(rng, 14) === 'EPIC') epic = true;
    }
    expect(epic).toBe(true);
  });
});
