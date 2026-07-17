const ENHANCE_COST=[0,30,60,110,180,280];
/** 出售基础价：原金币价的 50%，防刷装换星尘。 */
const SELL_BASE={COMMON:5,FINE:10,RARE:20,EPIC:40,LEGENDARY:80};
function fail(code,message){const err=new Error(message);err.code=code;throw err;}
function requireItem(profile,instanceId){const index=profile.equipmentInventory.findIndex(x=>x.instanceId===instanceId);if(index<0)fail('PVE_EQUIPMENT_NOT_OWNED','未持有该装备');return{item:profile.equipmentInventory[index],index};}
function manageEquipment(profile,request){const{item,index}=requireItem(profile,request.instanceId);const inventory=profile.equipmentInventory.map(x=>({...x}));const equipped=Object.values(profile.equipmentLoadout).includes(item.instanceId);
 if(request.action==='TOGGLE_LOCK'){inventory[index]={...item,locked:!item.locked};return{...profile,equipmentInventory:inventory};}
 if(request.action==='ENHANCE'){if(item.enhanceLevel>=5)fail('PVE_EQUIPMENT_MAX_ENHANCE','装备已强化至上限');const level=item.enhanceLevel+1,cost=ENHANCE_COST[level];if(profile.gold<cost)fail('PVE_STARDUST_NOT_ENOUGH','星尘不足');inventory[index]={...item,enhanceLevel:level};return{...profile,gold:profile.gold-cost,equipmentInventory:inventory};}
 if(request.action==='SELL'){if(item.locked)fail('PVE_EQUIPMENT_LOCKED','锁定装备不能出售');if(equipped)fail('PVE_EQUIPMENT_EQUIPPED','已装备物品不能出售');let invested=0;for(let i=1;i<=item.enhanceLevel;i+=1)invested+=ENHANCE_COST[i];const price=(SELL_BASE[item.quality]??0)+Math.floor(invested*.5);return{...profile,gold:profile.gold+price,equipmentInventory:inventory.filter(x=>x.instanceId!==item.instanceId)};}
 fail('PVE_INVALID_CAMP_ACTION','未知装备管理动作');}
function saveMinghenPreset(profile,request){const name=typeof request.name==='string'?request.name.trim().slice(0,12):'';if(!name)fail('PVE_INVALID_PRESET_NAME','方案名称不能为空');const id=typeof request.id==='string'&&request.id?request.id:`preset_${Date.now()}`;const preset={id,name,entries:profile.minghenLoadout.map(x=>({...x}))};const existing=profile.minghenPresets.findIndex(x=>x.id===id);let presets=profile.minghenPresets.map(x=>({...x,entries:x.entries.map(e=>({...e}))}));if(existing>=0)presets[existing]=preset;else{if(presets.length>=5)fail('PVE_PRESET_LIMIT','最多保存5套命痕方案');presets.push(preset);}return{...profile,minghenPresets:presets};}
module.exports={ENHANCE_COST,SELL_BASE,manageEquipment,saveMinghenPreset};
