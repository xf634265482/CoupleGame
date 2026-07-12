import { getFixedEquipmentDefinition } from '../../assets/scripts/pve/core/equipment/EquipmentDefinition';
import { weaponCanTarget, weaponSecondaryCells } from '../../assets/scripts/pve/core/equipment/WeaponGeometry';

describe('fixed weapon geometry',()=>{
  const from={x:3,y:3};
  test('longbow enforces minimum range and straight line',()=>{
    const bow=getFixedEquipmentDefinition('W05');
    expect(weaponCanTarget(bow,from,{x:3,y:4})).toBe(false);
    expect(weaponCanTarget(bow,from,{x:3,y:8})).toBe(true);
    expect(weaponCanTarget(bow,from,{x:5,y:5})).toBe(false);
  });
  test('spear and sweep generate fixed non-recursive secondary cells',()=>{
    expect(weaponSecondaryCells(getFixedEquipmentDefinition('W03'),from,{x:3,y:4})).toEqual([{x:3,y:5}]);
    expect(weaponSecondaryCells(getFixedEquipmentDefinition('W02'),from,{x:3,y:4})).toEqual([{x:2,y:4},{x:4,y:4}]);
  });
});
