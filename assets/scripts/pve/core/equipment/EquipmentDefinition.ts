import type { EquipSlot, PveEquipmentInstance } from '../PveProgressionTypes';

export type WeaponShape = 'SINGLE'|'SWEEP_3'|'LINE_PIERCE'|'PROJECTILE'|'FAN_3';
export interface FixedEquipmentDefinition {
  id:string; name:string; slot:EquipSlot; sourceFloor:number; boss?:boolean;
  scalable:{power?:number;maxHp?:number;armor?:number};
  fixed:{apCost?:number;minRange?:number;maxRange?:number;shape?:WeaponShape;straightLine?:boolean;damageCoefficient?:number;secondaryDamageRatio?:number;armorPenetration?:number;knockback?:number;maxMoveStepsBeforeUse?:number;maxAp?:number;carryAp?:number;spiritGain?:number;healingShieldGain?:number;moveCostReduction?:number;forcedMoveModifier?:number;fogRadius?:number;statusDurationReduction?:number;terrainDamageReduction?:number;terrainApReduction?:number;firstMoveApPenalty?:number;maxHpPenalty?:number;armorPenalty?:number;adjacentDamagePenalty?:number;damageTakenThreshold?:number;excessDamageReduction?:number;burstSpiritRetention?:number;damageSpiritMultiplier?:number};
}

const e=(id:string,name:string,slot:EquipSlot,sourceFloor:number,scalable:FixedEquipmentDefinition['scalable'],fixed:FixedEquipmentDefinition['fixed'],boss=false):FixedEquipmentDefinition=>({id,name,slot,sourceFloor,scalable,fixed,...(boss?{boss:true}:{})});
export const FIXED_EQUIPMENT_CATALOG:readonly FixedEquipmentDefinition[]=[
 e('W01','哨兵短剑','WEAPON',1,{power:6},{apCost:3,minRange:1,maxRange:1,shape:'SINGLE',damageCoefficient:1,armorPenetration:.1}),
 e('W02','营地巨剑','WEAPON',5,{power:12},{apCost:5,minRange:1,maxRange:1,shape:'SWEEP_3',damageCoefficient:1,secondaryDamageRatio:.6}),
 e('W03','哨站长枪','WEAPON',2,{power:8},{apCost:4,minRange:1,maxRange:2,shape:'LINE_PIERCE',straightLine:true,damageCoefficient:.95,secondaryDamageRatio:.5}),
 e('W04','猎营短弓','WEAPON',2,{power:5},{apCost:3,minRange:1,maxRange:3,shape:'PROJECTILE',damageCoefficient:.9,adjacentDamagePenalty:.3}),
 e('W05','断旗长弓','WEAPON',3,{power:12},{apCost:5,minRange:2,maxRange:5,shape:'PROJECTILE',straightLine:true,damageCoefficient:1.1,armorPenetration:.25}),
 e('W06','夺令双刃','WEAPON',4,{power:3},{apCost:1,minRange:1,maxRange:1,shape:'SINGLE',damageCoefficient:.35}),
 e('W07','碎石重锤','WEAPON',3,{power:9},{apCost:4,minRange:1,maxRange:1,shape:'SINGLE',damageCoefficient:.9,knockback:2,secondaryDamageRatio:.3}),
 e('H01','斥候兜帽','HELMET',2,{armor:1},{fogRadius:1}),e('H02','铁制战盔','HELMET',3,{armor:3,maxHp:15},{spiritGain:-.1}),e('H03','凝神额冠','HELMET',6,{maxHp:10},{maxAp:1,armorPenalty:1}),
 e('A01','皮革轻甲','ARMOR',1,{maxHp:30,armor:2},{}),e('A02','棉布韧甲','ARMOR',3,{maxHp:45,armor:1},{statusDurationReduction:1}),e('A03','铁制板甲','ARMOR',5,{maxHp:70,armor:5},{firstMoveApPenalty:1}),
 e('S01','旅行皮靴','SHOES',1,{maxHp:15},{moveCostReduction:1,forcedMoveModifier:1}),e('S02','铁制战靴','SHOES',5,{armor:2,maxHp:20},{forcedMoveModifier:-1}),e('S03','灰烬行靴','SHOES',4,{maxHp:20},{terrainDamageReduction:.3,terrainApReduction:1}),
 e('T01','聚灵宝珠','TRINKET',4,{maxHp:10},{spiritGain:.15}),e('T02','生息护符','TRINKET',4,{maxHp:20},{healingShieldGain:.2}),e('T03','战术沙漏','TRINKET',6,{},{maxAp:1,carryAp:1,maxHpPenalty:25}),
 e('B01','酋长裂阵斧','WEAPON',7,{power:14},{apCost:5,minRange:1,maxRange:1,shape:'FAN_3',damageCoefficient:1,secondaryDamageRatio:.55,knockback:1,maxMoveStepsBeforeUse:2},true),
 e('B02','酋长披甲','ARMOR',7,{maxHp:80,armor:4},{damageTakenThreshold:.2,excessDamageReduction:.2,firstMoveApPenalty:1},true),
 e('B03','号角战徽','TRINKET',7,{maxHp:35},{spiritGain:.1,burstSpiritRetention:.1,damageSpiritMultiplier:.5},true),
] as const;
export const FIXED_EQUIPMENT_BY_ID=new Map(FIXED_EQUIPMENT_CATALOG.map(x=>[x.id,x]));
export function getFixedEquipmentDefinition(id:string):FixedEquipmentDefinition{const value=FIXED_EQUIPMENT_BY_ID.get(id);if(!value)throw new Error('UNKNOWN_EQUIPMENT_DEFINITION');return value;}
export function validateEquipmentInstance(instance:PveEquipmentInstance):PveEquipmentInstance{getFixedEquipmentDefinition(instance.definitionId);if(!Number.isInteger(instance.enhanceLevel)||instance.enhanceLevel<0||instance.enhanceLevel>5)throw new Error('INVALID_ENHANCE_LEVEL');return{...instance};}
export function createFixedEquipmentInstance(instanceId:string,definitionId:string,quality:PveEquipmentInstance['quality']):PveEquipmentInstance{return validateEquipmentInstance({instanceId,definitionId,quality,enhanceLevel:0,locked:false});}
export function equipmentPoolForFloor(floor:number):string[]{if(floor===6)return FIXED_EQUIPMENT_CATALOG.filter(x=>!x.boss&&x.sourceFloor<=6).map(x=>x.id);return FIXED_EQUIPMENT_CATALOG.filter(x=>x.sourceFloor===floor).map(x=>x.id);}
export function fixedWeaponAction(definitionId:string):{apCost:number;knockback:number;hasSweep:boolean;straightProjectile:boolean}{const d=getFixedEquipmentDefinition(definitionId);if(d.slot!=='WEAPON')throw new Error('EQUIPMENT_NOT_WEAPON');return{apCost:d.fixed.apCost??1,knockback:d.fixed.knockback??0,hasSweep:d.fixed.shape==='SWEEP_3'||d.fixed.shape==='FAN_3',straightProjectile:!!d.fixed.straightLine};}
