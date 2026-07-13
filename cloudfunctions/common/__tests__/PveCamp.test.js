const { createDefaultProfile }=require('../pve/PveProfile');
const { manageEquipment,saveMinghenPreset }=require('../pve/PveCamp');
function profile(){return{...createDefaultProfile(1),gold:100,equipmentInventory:[{instanceId:'i1',definitionId:'W01',quality:'COMMON',enhanceLevel:0,locked:false}],equipmentLoadout:{}};}
describe('PveCamp',()=>{
 test('locks and enhances equipment with authoritative gold cost',()=>{let p=manageEquipment(profile(),{action:'TOGGLE_LOCK',instanceId:'i1'});expect(p.equipmentInventory[0].locked).toBe(true);p=manageEquipment({...p,equipmentInventory:[{...p.equipmentInventory[0],locked:false}]},{action:'ENHANCE',instanceId:'i1'});expect(p).toMatchObject({gold:70,equipmentInventory:[{enhanceLevel:1}]});});
 test('protects locked and equipped items from sale',()=>{expect(()=>manageEquipment({...profile(),equipmentInventory:[{...profile().equipmentInventory[0],locked:true}]},{action:'SELL',instanceId:'i1'})).toThrow('锁定装备不能出售');expect(()=>manageEquipment({...profile(),equipmentLoadout:{WEAPON:'i1'}},{action:'SELL',instanceId:'i1'})).toThrow('已装备物品不能出售');});
 test('sale returns quality value plus half enhancement investment',()=>{const p={...profile(),equipmentInventory:[{...profile().equipmentInventory[0],enhanceLevel:2}]};expect(manageEquipment(p,{action:'SELL',instanceId:'i1'})).toMatchObject({gold:155,equipmentInventory:[]});});
 test('saves at most five immutable Minghen presets',()=>{let p={...profile(),minghenLoadout:[{id:'M01',level:2}]};p=saveMinghenPreset(p,{id:'a',name:'流血'});expect(p.minghenPresets[0]).toEqual({id:'a',name:'流血',entries:[{id:'M01',level:2}]});for(let i=1;i<5;i+=1)p=saveMinghenPreset(p,{id:String(i),name:String(i)});expect(()=>saveMinghenPreset(p,{id:'overflow',name:'x'})).toThrow('最多保存5套');});
});
