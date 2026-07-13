import { CHAPTER1_FLOORS } from '../../assets/scripts/pve/core/chapter1/Chapter1FloorCatalog';
import { MINGHEN_CATALOG } from '../../assets/scripts/pve/core/minghen/MinghenCatalog';
import { FIXED_EQUIPMENT_CATALOG } from '../../assets/scripts/pve/core/equipment/EquipmentDefinition';
describe('chapter one reward sources',()=>{
 test('all 24 Minghen have exactly one first chapter source',()=>{const ids=Object.values(CHAPTER1_FLOORS).flatMap(x=>x.minghenIds);expect(ids).toHaveLength(24);expect(new Set(ids).size).toBe(24);expect(new Set(ids)).toEqual(new Set(MINGHEN_CATALOG.map(x=>x.id)));});
 test('all 22 fixed equipment definitions appear in chapter source pools',()=>{const ids=new Set(Object.values(CHAPTER1_FLOORS).flatMap(x=>x.equipmentIds));expect(ids).toEqual(new Set(FIXED_EQUIPMENT_CATALOG.map(x=>x.id)));});
 test('boss rewards are isolated to floor seven',()=>{expect(CHAPTER1_FLOORS[7].equipmentIds).toEqual(['B01','B02','B03']);for(let floor=1;floor<=6;floor+=1)expect(CHAPTER1_FLOORS[floor].equipmentIds.some(id=>id.startsWith('B'))).toBe(false);});
});
