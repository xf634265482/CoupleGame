const { createDefaultProfile }=require('../pve/PveProfile');
const { manageEquipment,saveMinghenPreset,synthesizeMinghen }=require('../pve/PveCamp');
function profile(){return{...createDefaultProfile(1),gold:100,equipmentInventory:[{instanceId:'i1',definitionId:'生锈短刃',quality:'COMMON',enhanceLevel:0,locked:false}],equipmentLoadout:{}};}
describe('PveCamp',()=>{
 test('locks and enhances equipment with authoritative stardust cost',()=>{let p=manageEquipment(profile(),{action:'TOGGLE_LOCK',instanceId:'i1'});expect(p.equipmentInventory[0].locked).toBe(true);p=manageEquipment({...p,equipmentInventory:[{...p.equipmentInventory[0],locked:false}]},{action:'ENHANCE',instanceId:'i1'});expect(p).toMatchObject({gold:70,equipmentInventory:[{enhanceLevel:1}]});});
 test('protects locked and equipped items from sale',()=>{expect(()=>manageEquipment({...profile(),equipmentInventory:[{...profile().equipmentInventory[0],locked:true}]},{action:'SELL',instanceId:'i1'})).toThrow('锁定装备不能出售');expect(()=>manageEquipment({...profile(),equipmentLoadout:{WEAPON:'i1'}},{action:'SELL',instanceId:'i1'})).toThrow('已装备物品不能出售');});
 test('sale returns half quality value plus half enhancement investment',()=>{const p={...profile(),equipmentInventory:[{...profile().equipmentInventory[0],enhanceLevel:2}]};expect(manageEquipment(p,{action:'SELL',instanceId:'i1'})).toMatchObject({gold:150,equipmentInventory:[]});});
 test('saves at most five immutable Minghen presets',()=>{let p={...profile(),minghenLoadout:[{id:'M01',level:2}]};p=saveMinghenPreset(p,{id:'a',name:'流血'});expect(p.minghenPresets[0]).toEqual({id:'a',name:'流血',entries:[{id:'M01',level:2}]});for(let i=1;i<5;i+=1)p=saveMinghenPreset(p,{id:String(i),name:String(i)});expect(()=>saveMinghenPreset(p,{id:'overflow',name:'x'})).toThrow('最多保存5套');});
 test('synthesizes three same common gear into one fine',()=>{
  const p={
   ...profile(),
   gold:100,
   equipmentInventory:[
    {instanceId:'a',definitionId:'生锈短刃',quality:'COMMON',enhanceLevel:2,locked:false,baseStat:8},
    {instanceId:'b',definitionId:'生锈短刃',quality:'COMMON',enhanceLevel:0,locked:false,baseStat:10},
    {instanceId:'c',definitionId:'生锈短刃',quality:'COMMON',enhanceLevel:1,locked:false,baseStat:12},
   ],
  };
  const next=manageEquipment(p,{action:'SYNTHESIZE',instanceIds:['a','b','c']});
  expect(next.gold).toBe(85);
  expect(next.equipmentInventory).toHaveLength(1);
  expect(next.equipmentInventory[0]).toMatchObject({
   definitionId:'生锈短刃',quality:'FINE',enhanceLevel:0,locked:false,baseStat:10,
  });
  expect(next.equipmentInventory[0].instanceId).toMatch(/^synth_/);
 });
 test('synthesize rejects equipped locked and legendary',()=>{
  const base=[
   {instanceId:'a',definitionId:'生锈短刃',quality:'COMMON',enhanceLevel:0,locked:false,baseStat:10},
   {instanceId:'b',definitionId:'生锈短刃',quality:'COMMON',enhanceLevel:0,locked:false,baseStat:10},
   {instanceId:'c',definitionId:'生锈短刃',quality:'COMMON',enhanceLevel:0,locked:false,baseStat:10},
  ];
  expect(()=>manageEquipment({...profile(),equipmentInventory:base,equipmentLoadout:{WEAPON:'a'}},{action:'SYNTHESIZE',instanceIds:['a','b','c']})).toThrow('已装备');
  expect(()=>manageEquipment({...profile(),equipmentInventory:base.map((x,i)=>i===2?{...x,locked:true}:x)},{action:'SYNTHESIZE',instanceIds:['a','b','c']})).toThrow('锁定');
  const legend=base.map(x=>({...x,quality:'LEGENDARY'}));
  expect(()=>manageEquipment({...profile(),equipmentInventory:legend},{action:'SYNTHESIZE',instanceIds:['a','b','c']})).toThrow('传奇');
 });
 test('synthesizes minghen I to II without spending copies',()=>{
  const p={
   ...profile(),
   minghenCollection:{M01:{id:'M01',level:1,copies:2,trialCompleted:false}},
   minghenLoadout:[],
  };
  const next=synthesizeMinghen(p,{id:'M01'});
  expect(next.minghenCollection.M01).toMatchObject({level:2,copies:2});
 });
 test('minghen synthesize rejects equipped short and already II',()=>{
  const base={...profile(),minghenCollection:{M01:{id:'M01',level:1,copies:2,trialCompleted:false}}};
  expect(()=>synthesizeMinghen({...base,minghenLoadout:[{id:'M01',level:1}]},{id:'M01'})).toThrow('已装配');
  expect(()=>synthesizeMinghen({...base,minghenCollection:{M01:{id:'M01',level:1,copies:1,trialCompleted:false}}},{id:'M01'})).toThrow('副本不足');
  expect(()=>synthesizeMinghen({...base,minghenCollection:{M01:{id:'M01',level:2,copies:2,trialCompleted:false}}},{id:'M01'})).toThrow('已是II');
 });
});
