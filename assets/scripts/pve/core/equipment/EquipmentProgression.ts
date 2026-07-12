import type { PveEquipmentInstance } from '../PveProgressionTypes';
import { getFixedEquipmentDefinition } from './EquipmentDefinition';
export const QUALITY_MULTIPLIER={COMMON:1,FINE:1.15,RARE:1.32,EPIC:1.52,LEGENDARY:1.75} as const;
export const QUALITY_SELL_PRICE={COMMON:10,FINE:20,RARE:40,EPIC:80,LEGENDARY:160} as const;
export const ENHANCE_COST=[0,30,60,110,180,280] as const;
export function scaledEquipmentStats(instance:PveEquipmentInstance){const d=getFixedEquipmentDefinition(instance.definitionId);const multiplier=QUALITY_MULTIPLIER[instance.quality]*(1+instance.enhanceLevel*.06);return{power:Math.round((d.scalable.power??0)*multiplier),maxHp:Math.round((d.scalable.maxHp??0)*multiplier),armor:Math.round((d.scalable.armor??0)*multiplier),fixed:{...d.fixed}};}
export function enhanceEquipment(instance:PveEquipmentInstance,gold:number){if(instance.enhanceLevel>=5)throw new Error('EQUIPMENT_MAX_ENHANCE');const nextLevel=instance.enhanceLevel+1;const cost=ENHANCE_COST[nextLevel]??0;if(gold<cost)throw new Error('GOLD_NOT_ENOUGH');return{instance:{...instance,enhanceLevel:nextLevel},gold:gold-cost,cost};}
export function equipmentSellPrice(instance:PveEquipmentInstance):number{let invested=0;for(let i=1;i<=instance.enhanceLevel;i+=1)invested+=ENHANCE_COST[i]??0;return QUALITY_SELL_PRICE[instance.quality]+Math.floor(invested*.5);}
