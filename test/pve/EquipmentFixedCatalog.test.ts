import { FIXED_EQUIPMENT_CATALOG, createFixedEquipmentInstance, equipmentPoolForFloor, fixedWeaponAction, getFixedEquipmentDefinition } from '../../assets/scripts/pve/core/equipment/EquipmentDefinition';
import { enhanceEquipment, equipmentSellPrice, scaledEquipmentStats } from '../../assets/scripts/pve/core/equipment/EquipmentProgression';

describe('fixed equipment catalog',()=>{
  test('contains 22 unique profession-agnostic definitions without affixes',()=>{
    expect(FIXED_EQUIPMENT_CATALOG).toHaveLength(22);
    expect(new Set(FIXED_EQUIPMENT_CATALOG.map(x=>x.id)).size).toBe(22);
    expect(JSON.stringify(FIXED_EQUIPMENT_CATALOG)).not.toContain('profession');
    expect(JSON.stringify(FIXED_EQUIPMENT_CATALOG)).not.toContain('affix');
  });
  test('quality and enhancement only scale whitelisted positive stats',()=>{
    const base=createFixedEquipmentInstance('i1','W05','COMMON');
    const rare={...base,quality:'RARE' as const,enhanceLevel:3};
    const a=scaledEquipmentStats(base),b=scaledEquipmentStats(rare);
    expect(b.power).toBeGreaterThan(a.power);
    expect(b.fixed).toEqual(a.fixed);
    expect(b.fixed.apCost).toBe(5);
    expect(b.fixed.minRange).toBe(2);
  });
  test('enhancement always succeeds with fixed cost and sale returns half investment',()=>{
    const item=createFixedEquipmentInstance('i1','A01','COMMON');
    const upgraded=enhanceEquipment(item,100);
    expect(upgraded).toMatchObject({gold:70,cost:30,instance:{enhanceLevel:1}});
    expect(equipmentSellPrice(upgraded.instance)).toBe(25);
  });
  test('floor 6 expands to all non-boss equipment while floor 7 is boss-only',()=>{
    expect(equipmentPoolForFloor(6)).toHaveLength(19);
    expect(equipmentPoolForFloor(7)).toEqual(['B01','B02','B03']);
    expect(getFixedEquipmentDefinition('B03').boss).toBe(true);
  });
  test('weapon action parameters are fixed before any profession rule is applied',()=>{
    expect(fixedWeaponAction('W07')).toEqual({apCost:4,knockback:2,hasSweep:false,straightProjectile:false});
    expect(fixedWeaponAction('W05')).toEqual({apCost:5,knockback:0,hasSweep:false,straightProjectile:true});
  });
});
