import { addEquipment, equipEquipment, sellEquipment, toggleEquipmentLock } from '../../assets/scripts/pve/core/equipment/EquipmentInventory';
import { createFixedEquipmentInstance } from '../../assets/scripts/pve/core/equipment/EquipmentDefinition';

describe('equipment inventory',()=>{
  const sword=createFixedEquipmentInstance('sword-1','生锈短刃','COMMON');
  test('equips by fixed slot and protects equipped or locked items from sale',()=>{
    const inventory=addEquipment([], [sword]);
    const loadout=equipEquipment({},inventory,sword.instanceId);
    expect(loadout).toEqual({WEAPON:'sword-1'});
    expect(()=>sellEquipment(inventory,loadout,'sword-1')).toThrow('EQUIPMENT_EQUIPPED');
    const locked=toggleEquipmentLock(inventory,'sword-1');
    expect(()=>sellEquipment(locked,{},'sword-1')).toThrow('EQUIPMENT_LOCKED');
  });
  test('inventory overflow is explicit and never silently drops rewards',()=>{
    const full=Array.from({length:60},(_,i)=>createFixedEquipmentInstance(`i${i}`,'生锈短刃','COMMON'));
    expect(()=>addEquipment(full,[sword])).toThrow('EQUIPMENT_INVENTORY_FULL');
  });
});
