import type { MinghenLoadoutEntry } from '../PveProgressionTypes';
import { getMinghenDefinition } from './MinghenCatalog';
import { emptyMinghenEffectResult, type MinghenEffectResult, type MinghenEventContext } from './MinghenEventContext';

export interface MinghenTriggerMemory { eventKeys: string[]; turnKeys: string[]; layerKeys: string[]; states: string[]; }
export function createMinghenTriggerMemory(): MinghenTriggerMemory { return { eventKeys: [], turnKeys: [], layerKeys: [], states: [] }; }
function once(memory: MinghenTriggerMemory, scope: 'eventKeys'|'turnKeys'|'layerKeys', key: string): boolean { if (memory[scope].includes(key)) return false; memory[scope].push(key); return true; }
function store(memory: MinghenTriggerMemory, key: string): void { if (!memory.states.includes(key)) memory.states.push(key); }
function consume(memory: MinghenTriggerMemory, key: string): boolean { const i=memory.states.indexOf(key); if(i<0)return false; memory.states.splice(i,1); return true; }

export function resolveMinghenEffects(loadout: readonly MinghenLoadoutEntry[], context: MinghenEventContext, memory: MinghenTriggerMemory): MinghenEffectResult {
  const result = emptyMinghenEffectResult();
  if (context.source === 'MINGHEN_SECONDARY') return result;
  for (const equipped of loadout) {
    const def = getMinghenDefinition(equipped.id);
    if (!def.hooks.includes(context.hook)) continue;
    if (!once(memory, 'eventKeys', `${context.eventId}:${equipped.id}`)) continue;
    const v = def.values[equipped.level];
    const value = (index: number): number => v[index] ?? 0;
    const turnKey = `${context.turn}:${equipped.id}`;
    switch (equipped.id) {
      case 'M01': if (context.hook === 'AFTER_HIT' && (context.activeMoveStepsThisTurn ?? 0) >= value(0)) result.applyStatuses.push({ id:'BLEED', stacks:1 }); break;
      case 'M02': if (context.hook === 'AFTER_HIT' && (context.activeHitsOnTargetThisTurn ?? 0) >= 2) result.applyStatuses.push({ id:'POISON', stacks:1 }); break;
      case 'M03': if (context.hook === 'AFTER_HIT' && (context.apCost ?? 0) >= value(0)) result.applyStatuses.push({ id:'BURN', stacks:1 }); break;
      case 'M04': if (context.hook === 'AFTER_HIT' && !context.movedThisTurn) result.applyStatuses.push({ id:'CHILL', stacks:value(0) }); break;
      case 'M05': if (context.hook === 'TURN_END' && !context.attackedThisTurn) {store(memory,'M05_READY');result.flags.push('STORE_HIDDEN_EDGE');} else if(context.hook==='BEFORE_HIT'&&consume(memory,'M05_READY')) result.damageMultiplierBonus+=value(0); break;
      case 'M06': if (context.hook === 'TURN_END' && (context.apLeft ?? 0) >= value(0)) {store(memory,'M06_AP');result.flags.push('GRANT_NEXT_TURN_AP');} if (context.hook === 'BEFORE_ATTACK' && equipped.level === 3&&consume(memory,'M06_AP')) result.armorPenetrationBonus += .2; break;
      case 'M07': if (context.hook === 'DAMAGED' && (context.actualDamage ?? 0) >= (context.maxHp ?? 1)*value(0)) {store(memory,'M07_READY');result.flags.push('STORE_REVENGE');} if (context.hook === 'BEFORE_HIT'&&consume(memory,'M07_READY')) result.damageMultiplierBonus += value(1); break;
      case 'M08': if (context.hook === 'AFTER_MOVE' && context.enteredDangerousTerrain) {store(memory,'M08_READY');result.flags.push('STORE_TERRAIN_CHARGE');} if (context.hook === 'BEFORE_HIT'&&consume(memory,'M08_READY')) result.damageMultiplierBonus += value(0); break;
      case 'M09': if (context.hook === 'BEFORE_HIT' && context.targetHasStatus && once(memory,'turnKeys',turnKey)) result.damageMultiplierBonus += value(0); break;
      case 'M10': if (context.hook === 'STATUS_APPLIED' && (context.targetStatuses?.length ?? 0)>0 && !context.targetStatuses?.includes(context.appliedStatus!)) { result.flags.push('EXTEND_EXISTING_STATUS'); if(equipped.level>=2) result.applyStatuses.push({id:context.appliedStatus!,stacks:1}); if(equipped.level===3) result.secondaryDamageRatio=Math.max(result.secondaryDamageRatio,.4); } break;
      case 'M11': if(context.hook==='SHIELD_BROKEN'){store(memory,'M11_READY');result.flags.push('STORE_FIRM_EDGE');} if(context.hook==='BEFORE_HIT'&&consume(memory,'M11_READY')) result.damageMultiplierBonus+=value(0); break;
      case 'M12': if(context.hook==='HEALED'&&(context.overheal??0)>0) result.shield+=Math.min((context.overheal??0)*value(0),(context.maxHp??0)*value(1)); if(context.hook==='BEFORE_HIT'&&equipped.level===3&&(context.shield??0)>0) result.armorPenetrationBonus+=.2; break;
      case 'M13': if(context.hook==='COLLISION'&&context.collision&&once(memory,'turnKeys',turnKey)){result.shield+=(context.maxHp??0)*value(0);if(equipped.level===3)store(memory,'M13_DISCOUNT');} if(context.hook==='BEFORE_ATTACK'&&consume(memory,'M13_DISCOUNT')) result.apDelta-=1; break;
      case 'M14': if(context.hook==='AFTER_ATTACK'){store(memory,'M14_MOVE');result.flags.push('FLOW_MOVE_READY');} if(context.hook==='BEFORE_MOVE'&&consume(memory,'M14_MOVE')){result.moveCostReduction=1;if(equipped.level>=2)store(memory,'M14_ATTACK');} if(context.hook==='BEFORE_HIT'&&consume(memory,'M14_ATTACK')) result.damageMultiplierBonus+=value(1); break;
      case 'M15': if(context.hook==='KILL'&&context.source==='ACTIVE_ACTION'){store(memory,'M15_READY');result.flags.push('CHAIN_READY');} if(context.hook==='BEFORE_HIT'&&context.differentTarget&&consume(memory,'M15_READY')) result.damageMultiplierBonus+=value(0); break;
      case 'M16': if(context.hook==='TURN_END'&&context.apLeft===0) result.spiritGain+=value(0); if(context.hook==='SPIRIT_BURST'&&equipped.level===3&&once(memory,'layerKeys',equipped.id)) result.apDelta+=1; break;
      case 'M17': if((context.hook==='KILL'||(equipped.level===3&&context.hook==='STATUS_KILL'))&&context.targetHasStatus) result.flags.push(equipped.level>=2?'SPREAD_ALL_STATUS':'SPREAD_HIGHEST_STATUS'); break;
      case 'M18': if(context.hook==='AFTER_HIT'&&(context.apCost??0)>=value(0)&&context.targetHasStatus&&once(memory,'turnKeys',`${turnKey}:${context.targetId}`)) result.flags.push(equipped.level===3&&(context.targetHpRatio??1)<=.3?'DETONATE_TWO':'DETONATE_ONE'); break;
      case 'M19': if(context.hook==='KILL'&&(context.overkill??0)>0) result.secondaryDamageRatio=Math.max(result.secondaryDamageRatio,value(0)); break;
      case 'M20': if(context.hook==='AFTER_ATTACK'&&(context.hitCount??0)>=2){store(memory,`M20_${Math.min(3,context.hitCount??2)}`);result.flags.push('FOCUS_EDGE_READY');} if(context.hook==='BEFORE_HIT'&&context.hitCount===1){const key=memory.states.find(x=>x.startsWith('M20_'));if(key){consume(memory,key);const extra=Math.max(1,Number(key.slice(4))-1);result.damageMultiplierBonus+=Math.min(value(1),extra*value(0));}} break;
      case 'M21': if(context.hook==='BEFORE_HIT'&&(context.hp??1)<=(context.maxHp??1)*value(1)) result.damageMultiplierBonus+=value(0); if(context.hook==='KILL'&&equipped.level===3&&once(memory,'layerKeys',equipped.id)) result.heal+=(context.maxHp??0)*.12; break;
      case 'M22': if((context.hook==='AFTER_MOVE'||context.hook==='AFTER_ATTACK')&&context.lastAction&&context.action&&context.lastAction!==context.action){store(memory,'M22_READY');result.flags.push('CLOUD_STEP_READY');} if((context.hook==='BEFORE_MOVE'||context.hook==='BEFORE_ATTACK')&&consume(memory,'M22_READY')) result.apDelta-=1; break;
      case 'M23': if(context.hook==='TURN_START'&&context.voluntary) { result.heal-=(context.maxHp??0)*value(0); result.apDelta+=value(1); } if(context.hook==='KILL'&&equipped.level===3&&once(memory,'turnKeys',turnKey)) result.heal+=(context.maxHp??0)*.06; break;
      case 'M24': if(context.hook==='TURN_START'&&context.voluntary){store(memory,'M24_ACTIVE');result.flags.push('ENTER_STILL_FIELD');} if(context.hook==='BEFORE_MOVE'&&memory.states.includes('M24_ACTIVE')) result.flags.push('BLOCK_MOVE'); if(context.hook==='BEFORE_HIT'&&consume(memory,'M24_ACTIVE')) { result.rangeBonus+=1; result.damageMultiplierBonus+=value(1); if(equipped.level===3) result.armorPenetrationBonus+=.25; } break;
    }
  }
  result.apDelta = Math.max(-1, result.apDelta);
  result.moveCostReduction = Math.min(1, result.moveCostReduction);
  return result;
}
