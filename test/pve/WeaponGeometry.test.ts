import { getFixedEquipmentDefinition } from '../../assets/scripts/pve/core/equipment/EquipmentDefinition';
import { weaponCanTarget, weaponSecondaryCells } from '../../assets/scripts/pve/core/equipment/WeaponGeometry';

describe('classic weapon geometry', () => {
  const from = { x: 3, y: 3 };

  test('spear enforces straight line and range', () => {
    const spear = getFixedEquipmentDefinition('铁制长矛');
    expect(weaponCanTarget(spear, from, { x: 3, y: 4 })).toBe(true);
    expect(weaponCanTarget(spear, from, { x: 5, y: 5 })).toBe(false);
  });

  test('spear generates fixed secondary cell', () => {
    expect(weaponSecondaryCells(getFixedEquipmentDefinition('精钢长枪'), from, { x: 3, y: 4 })).toEqual([{ x: 3, y: 5 }]);
  });
});
