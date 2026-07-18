import type { MinghenLoadoutEntry } from '../PveProgressionTypes';
import { getMinghenDefinition } from './MinghenCatalog';
import { emptyMinghenEffectResult, type MinghenEffectResult, type MinghenEventContext } from './MinghenEventContext';

export interface MinghenTriggerMemory { eventKeys: string[]; turnKeys: string[]; layerKeys: string[]; states: string[]; }
export function createMinghenTriggerMemory(): MinghenTriggerMemory { return { eventKeys: [], turnKeys: [], layerKeys: [], states: [] }; }

/**
 * 命痕去重键会随「回合 × 事件 × 命痕」增长；不裁剪时 includes 线性变慢，
 * 长线打到第 10 层后表现为移动/攻击越来越卡。只保留近两回合的 event/turn 键即可。
 */
export function pruneMinghenMemory(memory: MinghenTriggerMemory, turn: number): MinghenTriggerMemory {
  const minTurn = Math.max(1, turn - 1);
  const keepRecent = (key: string): boolean => {
    const match = /(?:^|:)(\d+)(?::|$)/.exec(key);
    if (!match) return true;
    return Number(match[1]) >= minTurn;
  };
  if (memory.eventKeys.length < 96 && memory.turnKeys.length < 48) {
    const needsEvent = memory.eventKeys.some((key) => !keepRecent(key));
    const needsTurn = memory.turnKeys.some((key) => !keepRecent(key));
    if (!needsEvent && !needsTurn) return memory;
  }
  return {
    eventKeys: memory.eventKeys.filter(keepRecent),
    turnKeys: memory.turnKeys.filter(keepRecent),
    layerKeys: memory.layerKeys,
    states: memory.states,
  };
}

function once(memory: MinghenTriggerMemory, scope: 'eventKeys'|'turnKeys'|'layerKeys', key: string): boolean {
  if (memory[scope].includes(key)) return false;
  memory[scope].push(key);
  return true;
}
function store(memory: MinghenTriggerMemory, key: string): void { if (!memory.states.includes(key)) memory.states.push(key); }
function consume(memory: MinghenTriggerMemory, key: string): boolean { const i=memory.states.indexOf(key); if(i<0)return false; memory.states.splice(i,1); return true; }
function incrementCounter(memory:MinghenTriggerMemory,key:string):number{const prefix=`${key}:`;const current=memory.states.find(x=>x.startsWith(prefix));const next=(current?Number(current.slice(prefix.length)):0)+1;if(current)consume(memory,current);store(memory,`${prefix}${next}`);return next;}

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
      case 'M01': if (context.hook === 'AFTER_HIT' && (context.activeMoveStepsThisTurn ?? 0) >= value(0)) {result.applyStatuses.push({ id:'BLEED', stacks:1 });if(equipped.level===3&&context.killed&&once(memory,'turnKeys',turnKey))result.apDelta+=1;} break;
      case 'M02': if (context.hook === 'AFTER_HIT' && incrementCounter(memory,`M02_HIT:${context.turn}:${context.targetId}`) >= 2) result.applyStatuses.push({ id:'POISON', stacks:1 }); break;
      case 'M03': if (context.hook === 'AFTER_HIT' && (context.apCost ?? 0) >= value(0)) {const extra=equipped.level===3&&context.targetStatuses?.includes('BURN')&&once(memory,'turnKeys',`${turnKey}:${context.targetId}`)?1:0;result.applyStatuses.push({ id:'BURN', stacks:1+extra });} break;
      case 'M04': if (context.hook === 'AFTER_HIT' && !context.movedThisTurn) result.applyStatuses.push({ id:'CHILL', stacks:value(0) }); break;
      case 'M05': if (context.hook === 'TURN_END' && !context.attackedThisTurn) {store(memory,'M05_READY');result.flags.push('STORE_HIDDEN_EDGE');} else if(context.hook==='BEFORE_HIT'&&consume(memory,'M05_READY')) result.damageMultiplierBonus+=value(0); break;
      case 'M06': if (context.hook === 'TURN_END' && (context.apLeft ?? 0) >= value(0)) {store(memory,'M06_AP');result.flags.push('GRANT_NEXT_TURN_AP');} if(context.hook==='TURN_START'&&consume(memory,'M06_AP')){result.apDelta+=value(1);if(equipped.level===3)store(memory,'M06_PEN');} if (context.hook === 'BEFORE_ATTACK' && equipped.level === 3&&consume(memory,'M06_PEN')) result.armorPenetrationBonus += .2; break;
      case 'M07': if (context.hook === 'DAMAGED' && (context.actualDamage ?? 0) >= (context.maxHp ?? 1)*value(0)) {store(memory,'M07_READY');result.flags.push('STORE_REVENGE');} if (context.hook === 'BEFORE_HIT'&&consume(memory,'M07_READY')){result.damageMultiplierBonus += value(1);if(equipped.level===3)store(memory,'M07_HEAL');} if(context.hook==='AFTER_HIT'&&consume(memory,'M07_HEAL'))result.heal+=Math.min((context.actualDamage??0)*value(2),(context.maxHp??0)*value(3)); break;
      case 'M08':
        if (context.hook === 'AFTER_MOVE' && context.enteredDangerousTerrain) {
          store(memory, 'M08_READY');
          result.flags.push('STORE_TERRAIN_CHARGE');
          if (equipped.level >= 2) store(memory, 'M08_MOVE');
        }
        if (context.hook === 'BEFORE_MOVE' && consume(memory, 'M08_MOVE')) {
          result.moveCostReduction = value(1) || 1;
        }
        if (context.hook === 'BEFORE_HIT' && consume(memory, 'M08_READY')) {
          result.damageMultiplierBonus += value(0);
          if (equipped.level === 3) store(memory, 'M08_SHIELD_HIT');
        }
        if (context.hook === 'AFTER_HIT' && equipped.level === 3 && consume(memory, 'M08_SHIELD_HIT')) {
          result.shield += (context.maxHp ?? 0) * value(2);
        }
        break;
      case 'M09': if (context.hook === 'BEFORE_HIT' && context.targetHasStatus && once(memory,'turnKeys',turnKey)){result.damageMultiplierBonus += value(0);if(equipped.level===3)store(memory,'M09_EMPOWERED');} if(context.hook==='KILL'&&context.targetHasStatus&&consume(memory,'M09_EMPOWERED'))result.heal+=(context.maxHp??0)*value(1); break;
      case 'M10': if (context.hook === 'STATUS_APPLIED' && (context.targetStatuses?.length ?? 0)>0 && !context.targetStatuses?.includes(context.appliedStatus!)) { result.flags.push('EXTEND_EXISTING_STATUS'); if(equipped.level>=2) result.applyStatuses.push({id:context.appliedStatus!,stacks:1}); if(equipped.level===3) result.secondaryDamageRatio=Math.max(result.secondaryDamageRatio,.4); } break;
      case 'M11': if(context.hook==='SHIELD_BROKEN'){store(memory,'M11_READY');result.flags.push('STORE_FIRM_EDGE');} if(context.hook==='BEFORE_HIT'&&consume(memory,'M11_READY')){result.damageMultiplierBonus+=value(0);if(equipped.level===3)store(memory,'M11_REBUILD');} if(context.hook==='AFTER_HIT'&&consume(memory,'M11_REBUILD'))result.shield+=Math.min((context.actualDamage??0)*value(1),(context.maxHp??0)*value(2)); break;
      case 'M12': if(context.hook==='HEALED'&&(context.overheal??0)>0) result.shield+=Math.min((context.overheal??0)*value(0),(context.maxHp??0)*value(1)); if(context.hook==='BEFORE_HIT'&&equipped.level===3&&(context.shield??0)>0) result.armorPenetrationBonus+=.2; break;
      case 'M13': if(context.hook==='COLLISION'&&context.collision&&once(memory,'turnKeys',turnKey)){result.shield+=(context.maxHp??0)*value(0);if(equipped.level===3)store(memory,'M13_DISCOUNT');} if(context.hook==='BEFORE_ATTACK'&&consume(memory,'M13_DISCOUNT')) result.apDelta-=1; break;
      case 'M14': if(context.hook==='AFTER_ATTACK'){store(memory,'M14_MOVE');result.flags.push('FLOW_MOVE_READY');if(equipped.level===3&&consume(memory,'M14_FINISH'))result.apDelta+=value(2);} if(context.hook==='BEFORE_MOVE'&&consume(memory,'M14_MOVE')){result.moveCostReduction=1;if(equipped.level>=2)store(memory,'M14_ATTACK');} if(context.hook==='BEFORE_HIT'&&consume(memory,'M14_ATTACK')){result.damageMultiplierBonus+=value(1);if(equipped.level===3)store(memory,'M14_FINISH');} break;
      case 'M15': if(context.hook==='KILL'&&context.source==='ACTIVE_ACTION'){if(equipped.level===3&&consume(memory,'M15_BOOSTED')&&once(memory,'turnKeys',turnKey))result.apDelta+=value(1);memory.states.filter(x=>x.startsWith('M15_LAST:')).forEach(x=>consume(memory,x));store(memory,`M15_LAST:${context.targetId}`);store(memory,'M15_READY');result.flags.push('CHAIN_READY');} if(context.hook==='BEFORE_HIT'&&memory.states.some(x=>x.startsWith('M15_LAST:')&&x!==`M15_LAST:${context.targetId}`)&&consume(memory,'M15_READY')){result.damageMultiplierBonus+=value(0);memory.states.filter(x=>x.startsWith('M15_LAST:')).forEach(x=>consume(memory,x));if(equipped.level===3)store(memory,'M15_BOOSTED');} break;
      case 'M16': if(context.hook==='TURN_END'&&context.apLeft===0) result.spiritGain+=value(0); if(context.hook==='SPIRIT_BURST'&&equipped.level===3&&once(memory,'layerKeys',equipped.id)) result.apDelta+=1; break;
      case 'M17': if((context.hook==='KILL'||(equipped.level===3&&context.hook==='STATUS_KILL'))&&context.targetHasStatus) result.flags.push(equipped.level>=2?'SPREAD_ALL_STATUS':'SPREAD_HIGHEST_STATUS'); break;
      case 'M18': if(context.hook==='AFTER_HIT'&&(context.apCost??0)>=value(0)&&context.targetHasStatus&&once(memory,'turnKeys',`${turnKey}:${context.targetId}`)) result.flags.push(equipped.level===3&&(context.targetHpRatio??1)<=.3?'DETONATE_TWO':'DETONATE_ONE'); break;
      case 'M19': if(context.hook==='KILL'&&(context.overkill??0)>0) result.secondaryDamageRatio=Math.max(result.secondaryDamageRatio,value(0)); break;
      case 'M20': if(context.hook==='AFTER_ATTACK'&&(context.hitCount??0)>=2){store(memory,`M20_${Math.min(3,context.hitCount??2)}`);result.flags.push('FOCUS_EDGE_READY');} if(context.hook==='BEFORE_HIT'&&context.hitCount===1){const key=memory.states.find(x=>x.startsWith('M20_'));if(key){consume(memory,key);const extra=Math.max(1,Number(key.slice(4))-1);result.damageMultiplierBonus+=Math.min(value(1),extra*value(0));if(equipped.level===3)store(memory,'M20_BOOSTED');}} if(context.hook==='KILL'&&consume(memory,'M20_BOOSTED')&&once(memory,'turnKeys',turnKey))result.apDelta+=value(2); break;
      case 'M21': if(context.hook==='BEFORE_HIT'&&(context.hp??1)<=(context.maxHp??1)*value(1)) result.damageMultiplierBonus+=value(0); if(context.hook==='KILL'&&equipped.level===3&&once(memory,'layerKeys',equipped.id)) result.heal+=(context.maxHp??0)*.12; break;
      case 'M22':
        if (context.hook === 'TURN_START' && (context.adjacentEnemyCount ?? 0) >= value(0)) store(memory, 'M22_ESCAPE_READY');
        if (context.hook === 'BEFORE_MOVE' && consume(memory, 'M22_ESCAPE_READY')) {
          result.moveCostReduction = value(1);
          store(memory, 'M22_USED_DISCOUNT');
        }
        if (context.hook === 'AFTER_MOVE' && memory.states.includes('M22_USED_DISCOUNT') && (context.adjacentEnemyCount ?? 0) === 0) {
          consume(memory, 'M22_USED_DISCOUNT');
          if (equipped.level >= 2) result.shield += (context.maxHp ?? 0) * value(2);
          if (equipped.level >= 3) store(memory, 'M22_ATTACK');
        }
        if (context.hook === 'BEFORE_HIT' && consume(memory, 'M22_ATTACK')) result.damageMultiplierBonus += value(3);
        break;
      case 'M23': if(context.hook==='TURN_START'&&context.voluntary) { result.heal-=(context.maxHp??0)*value(0); result.apDelta+=value(1);store(memory,'M23_ACTIVE'); } if(context.hook==='KILL'&&equipped.level===3&&memory.states.includes('M23_ACTIVE')&&once(memory,'turnKeys',turnKey)) result.heal+=(context.maxHp??0)*.06; break;
      case 'M24': if(context.hook==='TURN_START'&&context.voluntary){store(memory,'M24_ACTIVE');result.flags.push('ENTER_STILL_FIELD');} if(context.hook==='BEFORE_MOVE'&&memory.states.includes('M24_ACTIVE')) result.flags.push('BLOCK_MOVE'); if(context.hook==='BEFORE_HIT'&&consume(memory,'M24_ACTIVE')) { result.rangeBonus+=1; result.damageMultiplierBonus+=value(1); if(equipped.level===3){result.armorPenetrationBonus+=.25;if((context.apLeft??0)>=3)store(memory,'M24_SHIELD');} } if(context.hook==='AFTER_HIT'&&consume(memory,'M24_SHIELD'))result.shield+=(context.maxHp??0)*value(3); break;
      case 'M25':
        if (context.hook === 'BEFORE_HIT' && equipped.level >= 3
          && (context.attackerOnSandPit || context.onExtraMoveCostTerrain)
          && once(memory, 'turnKeys', turnKey)) {
          result.damageMultiplierBonus += value(2);
        }
        break;
      case 'M26': {
        const envHit = context.source === 'ENVIRONMENT'
          || (context.environmentDamage ?? 0) > 0
          || (context.source === 'TERRAIN' && (context.terrainDamage ?? 0) > 0);
        if (context.hook === 'DAMAGED' && envHit && equipped.level >= 3) store(memory, 'M26_READY');
        if (context.hook === 'BEFORE_HIT' && consume(memory, 'M26_READY')) result.damageMultiplierBonus += value(1);
        break;
      }
      case 'M27':
        if (context.hook === 'STATUS_APPLIED' && context.appliedStatus
          && (context.targetStatuses?.length ?? 0) === 1
          && context.targetStatuses?.[0] === context.appliedStatus
          && once(memory, 'turnKeys', `${turnKey}:${context.targetId}`)) {
          result.applyStatuses.push({ id: context.appliedStatus, stacks: value(0) });
        }
        if (context.hook === 'BEFORE_HIT' && equipped.level >= 2
          && (context.targetStatuses?.length ?? 0) === 1 && context.targetHasStatus) {
          result.armorPenetrationBonus += value(1);
          if (equipped.level === 3 && once(memory, 'turnKeys', `${turnKey}:extend:${context.targetId}`)) {
            result.flags.push('EXTEND_SINGLE_STATUS');
          }
        }
        break;
      case 'M28':
        if (context.hook === 'STATUS_APPLIED' && context.appliedStatus
          && once(memory, 'turnKeys', `${turnKey}:${context.targetId}`)) {
          const hasBurn = context.targetStatuses?.includes('BURN');
          const hasChill = context.targetStatuses?.includes('CHILL');
          const converts = (context.appliedStatus === 'BURN' && hasChill) || (context.appliedStatus === 'CHILL' && hasBurn);
          if (converts) {
            result.flags.push('CONVERT_BURN_CHILL');
            result.secondaryDamageRatio = Math.max(result.secondaryDamageRatio, value(0));
            if (equipped.level >= 2) result.applyStatuses.push({ id: context.appliedStatus, stacks: value(1) });
          }
        }
        break;
      case 'M29': {
        const hasBleed = context.targetStatuses?.includes('BLEED');
        const hasPoison = context.targetStatuses?.includes('POISON');
        if (context.hook === 'STATUS_APPLIED' && hasBleed && hasPoison
          && once(memory, 'layerKeys', `${context.targetId}:dual`)) {
          if (equipped.level >= 2) result.flags.push('EXTEND_BLEED_POISON');
        }
        if (context.hook === 'AFTER_MOVE' && context.bleedTriggeredByMove && hasBleed && hasPoison
          && once(memory, 'turnKeys', `${turnKey}:${context.targetId}`)) {
          result.flags.push('EXTRA_POISON_ON_BLEED_MOVE');
          if (equipped.level === 3) store(memory, 'M29_POISON_KILL');
        }
        if ((context.hook === 'KILL' || context.hook === 'STATUS_KILL') && equipped.level === 3
          && consume(memory, 'M29_POISON_KILL')) {
          result.spiritGain += value(2);
        }
        break;
      }
      case 'M30':
        if (context.hook === 'KILL' && context.targetHasStatus && context.targetStatuses?.length) {
          memory.states.filter((s) => s.startsWith('M30_AFTERMATH:') || s.startsWith('M30_SOURCE:')).forEach((s) => consume(memory, s));
          const status = context.targetStatuses[0]!;
          store(memory, `M30_AFTERMATH:${status}`);
          if (context.targetId) store(memory, `M30_SOURCE:${context.targetId}`);
        }
        if ((context.hook === 'BEFORE_HIT' || context.hook === 'AFTER_HIT') && context.targetId) {
          const aftermath = memory.states.find((s) => s.startsWith('M30_AFTERMATH:'));
          const sourceId = memory.states.find((s) => s.startsWith('M30_SOURCE:'))?.slice('M30_SOURCE:'.length);
          if (aftermath && sourceId && sourceId !== context.targetId) {
            const statusId = aftermath.slice('M30_AFTERMATH:'.length) as 'BLEED' | 'POISON' | 'BURN' | 'CHILL';
            if (context.hook === 'BEFORE_HIT') {
              result.applyStatuses.push({ id: statusId, stacks: value(0) });
              if (equipped.level === 3) result.damageMultiplierBonus += value(1);
            }
            if (context.hook === 'AFTER_HIT') {
              consume(memory, aftermath);
              if (sourceId) consume(memory, `M30_SOURCE:${sourceId}`);
            }
          }
        }
        break;
      case 'M31':
        if (context.hook === 'AFTER_MOVE' && context.inTaskObjectiveZone
          && once(memory, 'turnKeys', `${turnKey}:enter`)) {
          result.shield += (context.maxHp ?? 0) * value(0);
          if (equipped.level >= 2) store(memory, 'M31_ATTACK');
        }
        if (context.hook === 'BEFORE_HIT' && consume(memory, 'M31_ATTACK')) result.damageMultiplierBonus += value(1);
        if (context.hook === 'TURN_END' && equipped.level === 3 && context.inTaskObjectiveZone) result.spiritGain += value(2);
        break;
      case 'M32':
        if (context.hook === 'TURN_END' && !context.damagedThisTurn) store(memory, 'M32_SHIELD_PENDING');
        if (context.hook === 'TURN_START' && consume(memory, 'M32_SHIELD_PENDING')) {
          result.shield += (context.maxHp ?? 0) * value(0);
        }
        if (context.hook === 'BEFORE_MOVE' && equipped.level === 3 && (context.shield ?? 0) > 0
          && once(memory, 'turnKeys', turnKey)) {
          result.moveCostReduction = value(1);
        }
        break;
      case 'M33':
        if (context.hook === 'KILL' && context.source === 'ACTIVE_ACTION' && once(memory, 'turnKeys', turnKey)) {
          result.spiritGain += value(0);
        }
        if (context.hook === 'SPIRIT_BURST' && equipped.level === 3 && once(memory, 'layerKeys', equipped.id)) {
          result.apDelta += value(1);
        }
        break;
      case 'M34':
        if (context.hook === 'BEFORE_ATTACK' && (context.apCost ?? 0) >= 3 && (context.shield ?? 0) > 0) {
          result.consumeShieldRatioOfMaxHp = value(0);
          result.shieldToDamageRatio = value(1);
          store(memory, 'M34_SPIKE_ACTIVE');
        }
        if ((context.hook === 'AFTER_HIT' || context.hook === 'KILL') && equipped.level === 3
          && consume(memory, 'M34_SPIKE_ACTIVE')) {
          result.refundConsumedShieldRatio = value(2);
        }
        break;
      case 'M35': {
        const shieldThreshold = (context.maxHp ?? 0) * value(0);
        if (context.hook === 'TURN_END') {
          if ((context.shield ?? 0) >= shieldThreshold && !context.shieldBrokenThisTurn) {
            store(memory, 'M35_BUFF');
          } else if (memory.states.includes('M35_BUFF') && equipped.level === 3 && (context.shield ?? 0) >= shieldThreshold) {
            result.spiritGain += value(3);
            consume(memory, 'M35_BUFF');
            consume(memory, 'M35_MOVE');
            consume(memory, 'M35_PEN');
          } else if (memory.states.includes('M35_BUFF')) {
            consume(memory, 'M35_BUFF');
            consume(memory, 'M35_MOVE');
            consume(memory, 'M35_PEN');
          }
        }
        if (context.hook === 'TURN_START' && memory.states.includes('M35_BUFF')) {
          store(memory, 'M35_MOVE');
          if (equipped.level >= 2) store(memory, 'M35_PEN');
        }
        if (context.hook === 'BEFORE_MOVE' && consume(memory, 'M35_MOVE')) result.moveCostReduction = value(1);
        if (context.hook === 'BEFORE_HIT' && equipped.level >= 2 && consume(memory, 'M35_PEN')) {
          result.armorPenetrationBonus += value(2);
        }
        break;
      }
      case 'M36': {
        const lowHp = (context.hp ?? 0) <= (context.maxHp ?? 1) * 0.4;
        if (context.hook === 'HEALED' && lowHp) {
          const healing = context.effectiveHealing ?? context.actualHealing ?? 0;
          result.shield += healing * value(0);
          if (equipped.level === 3) store(memory, 'M36_ATTACK');
        }
        if (context.hook === 'BEFORE_HIT' && consume(memory, 'M36_ATTACK')) result.damageMultiplierBonus += value(1);
        break;
      }
      case 'M37':
        if (context.hook === 'DAMAGED' && once(memory, 'turnKeys', turnKey)
          && (context.actualDamage ?? 0) > (context.maxHp ?? 1) * value(0)) {
          result.overflowDamageReductionRatio = value(1);
          if (equipped.level === 3) store(memory, 'M37_MOVE');
        }
        if (context.hook === 'BEFORE_MOVE' && consume(memory, 'M37_MOVE')) result.moveCostReduction = value(2);
        break;
      case 'M38':
        if (context.hook === 'KILL' && context.source === 'ACTIVE_ACTION' && once(memory, 'turnKeys', turnKey)) {
          store(memory, 'M38_MOVE');
        }
        if (context.hook === 'BEFORE_MOVE' && consume(memory, 'M38_MOVE')) {
          result.moveCostReduction = value(0);
          if (equipped.level === 3) store(memory, 'M38_SHIELD_PENDING');
        }
        if (context.hook === 'AFTER_MOVE' && equipped.level === 3 && consume(memory, 'M38_SHIELD_PENDING')) {
          result.shield += (context.maxHp ?? 0) * value(2);
        }
        break;
      case 'M39':
        if (context.hook === 'BEFORE_HIT' && (context.targetAdjacentEnemyCount ?? 0) === 0) {
          result.damageMultiplierBonus += equipped.level >= 2 ? value(1) : value(0);
        }
        if (context.hook === 'KILL' && equipped.level === 3 && (context.targetAdjacentEnemyCount ?? 0) === 0) {
          result.spiritGain += value(1);
        }
        break;
      case 'M40':
        if (context.hook === 'BEFORE_HIT' && context.targetAdjacentToBlocking) {
          result.armorPenetrationBonus += equipped.level >= 2 ? value(1) : value(0);
        }
        if (context.hook === 'AFTER_HIT' && equipped.level === 3 && context.attackHadCollision) {
          result.secondaryDamageRatio = Math.max(result.secondaryDamageRatio, value(1));
        }
        break;
      case 'M41':
        if (context.hook === 'AFTER_HIT' && (context.targetAdjacentEnemyCount ?? 0) >= 2) {
          result.transferDamageRatio = value(0);
          result.transferMaxTargets = equipped.level >= 3 ? value(1) : 1;
        }
        break;
      case 'M42':
        if (context.hook === 'BEFORE_HIT' && context.targetHasArmor && once(memory, 'turnKeys', turnKey)) {
          result.armorPenetrationBonus += equipped.level >= 2 ? value(0) : value(0);
        }
        if (context.hook === 'AFTER_HIT' && equipped.level === 3 && context.targetHasArmor) {
          result.shield += (context.maxHp ?? 0) * value(1);
        }
        break;
      case 'M43': {
        if (context.hook === 'KILL' && context.targetTier === 'NORMAL' && context.source === 'ACTIVE_ACTION') {
          if (once(memory, 'turnKeys', `${turnKey}:kill1`)) {
            result.shield += (context.maxHp ?? 0) * value(0);
          } else if (equipped.level === 3 && once(memory, 'turnKeys', `${turnKey}:kill2`)) {
            result.shield += (context.maxHp ?? 0) * value(1);
          }
        }
        break;
      }
      case 'M44': {
        const eliteBoss = context.targetTier === 'ELITE' || context.targetTier === 'BOSS';
        if (context.hook === 'BEFORE_HIT' && eliteBoss && once(memory, 'turnKeys', turnKey)) {
          result.damageMultiplierBonus += equipped.level >= 2 ? value(0) : value(0);
          if (equipped.level >= 2) result.armorPenetrationBonus += value(1);
          if (equipped.level === 3 && (context.targetHpRatio ?? 1) <= value(3)) {
            result.damageMultiplierBonus += value(2);
          }
        }
        break;
      }
      case 'M45':
        if (context.turn <= 2) {
          if (context.hook === 'BEFORE_MOVE' && once(memory, 'turnKeys', `${turnKey}:move`)) {
            result.moveCostReduction = value(0);
          }
          if (context.hook === 'BEFORE_HIT' && equipped.level >= 2 && once(memory, 'turnKeys', `${turnKey}:hit`)) {
            result.damageMultiplierBonus += value(1);
          }
          if (context.hook === 'KILL' && equipped.level === 3 && once(memory, 'turnKeys', `${turnKey}:kill`)) {
            result.shield += (context.maxHp ?? 0) * value(2);
          }
        }
        break;
      case 'M46':
        if (context.hook === 'DAMAGED' && context.damageTargetIsEscort && context.escortUnitInRange2
          && once(memory, 'turnKeys', `${turnKey}:escort`)) {
          result.damageReductionRatio = Math.max(result.damageReductionRatio, value(0));
          if (equipped.level === 3) result.shield += (context.maxHp ?? 0) * value(1);
        }
        break;
      case 'M47':
        if (context.hook === 'AFTER_ATTACK' && (context.apCost ?? 0) <= value(1)) store(memory, 'M47_LIGHT');
        if (context.hook === 'BEFORE_HIT' && memory.states.includes('M47_LIGHT') && (context.apCost ?? 0) >= value(2)) {
          result.damageMultiplierBonus += value(0);
          if (equipped.level === 3) result.armorPenetrationBonus += value(1);
          consume(memory, 'M47_LIGHT');
        }
        break;
      case 'M48':
        if (context.hook === 'STATUS_APPLIED' && (context.playerStatusDuration ?? 0) > 0
          && once(memory, 'turnKeys', turnKey)) {
          result.flags.push('SHORTEN_PLAYER_STATUS');
          if (equipped.level >= 2) result.flags.push('REDUCE_PLAYER_STATUS_EFFECT');
          if (equipped.level === 3) store(memory, 'M48_ATTACK');
        }
        if (context.hook === 'BEFORE_HIT' && consume(memory, 'M48_ATTACK')) result.damageMultiplierBonus += value(2);
        break;
      case 'M49': {
        const threshold = equipped.level >= 2 ? value(1) : value(0);
        if (context.hook === 'BEFORE_HIT' && (context.targetHpRatio ?? 1) <= threshold) {
          result.damageMultiplierBonus += value(0);
        }
        if (context.hook === 'KILL' && equipped.level === 3 && (context.targetHpRatio ?? 1) <= threshold
          && once(memory, 'turnKeys', turnKey)) {
          result.apDelta += value(2);
        }
        break;
      }
      case 'M50':
        if (context.hook === 'BEFORE_HIT' && (context.inDangerTerrain || context.inAttackWarningZone)
          && once(memory, 'turnKeys', turnKey)) {
          result.damageMultiplierBonus += equipped.level >= 2 ? value(1) : value(0);
          if (equipped.level === 3) store(memory, 'M50_SHIELD');
        }
        if (context.hook === 'AFTER_HIT' && equipped.level === 3 && consume(memory, 'M50_SHIELD')) {
          result.shield += (context.maxHp ?? 0) * value(1);
        }
        break;
      case 'M51':
        if (context.hook === 'TASK_INTERACT' && context.isTaskInteract) {
          if (once(memory, 'turnKeys', `${turnKey}:start`)) {
            result.apDelta -= 1;
            store(memory, 'M51_STARTED');
          } else if (memory.states.includes('M51_STARTED') && once(memory, 'turnKeys', `${turnKey}:done`)) {
            consume(memory, 'M51_STARTED');
            if (equipped.level >= 2) result.shield += (context.maxHp ?? 0) * value(1);
            if (equipped.level === 3) store(memory, 'M51_ATTACK');
          }
        }
        if (context.hook === 'BEFORE_HIT' && consume(memory, 'M51_ATTACK')) {
          result.damageMultiplierBonus += value(2);
        }
        break;
      case 'M52':
        if (context.hook === 'DAMAGED' && (context.forcedDisplaceDistance ?? 0) > 0
          && once(memory, 'turnKeys', turnKey)) {
          result.forcedDisplaceReduction = value(0);
          store(memory, 'M52_ACTIVE');
          if (equipped.level >= 2 && (context.collisionDamage ?? 0) > 0) {
            result.damageReductionRatio = Math.max(result.damageReductionRatio, value(1));
          }
        }
        if (context.hook === 'AFTER_MOVE' && equipped.level === 3 && memory.states.includes('M52_ACTIVE')) {
          const remaining = Math.max(0, (context.forcedDisplaceDistance ?? 0) - value(0));
          if (remaining === 0) {
            result.shield += (context.maxHp ?? 0) * value(2);
            consume(memory, 'M52_ACTIVE');
          }
        }
        break;
      case 'M53':
        if (context.hook === 'TURN_START' && (context.adjacentEnemyCount ?? 0) > 0) store(memory, 'M53_READY');
        if (context.hook === 'BEFORE_HIT' && memory.states.includes('M53_READY') && once(memory, 'turnKeys', turnKey)) {
          result.damageMultiplierBonus += value(0);
          if (equipped.level >= 2) store(memory, 'M53_SHIELD');
        }
        if (context.hook === 'AFTER_HIT' && equipped.level >= 2 && consume(memory, 'M53_SHIELD')) {
          result.shield += (context.maxHp ?? 0) * value(1);
          if (equipped.level === 3 && !context.killed) store(memory, 'M53_MOVE');
        }
        if (context.hook === 'BEFORE_MOVE' && equipped.level === 3 && consume(memory, 'M53_MOVE')) {
          result.moveCostReduction = value(2);
        }
        break;
      case 'M54':
        if (context.hook === 'TURN_END' && (context.enemiesInRange2 ?? 1) === 0
          && once(memory, 'layerKeys', equipped.id)) {
          result.heal += (context.maxHp ?? 0) * (equipped.level >= 2 ? value(1) : value(0));
          if (equipped.level === 3) result.spiritGain += value(1);
        }
        break;
      case 'M55': {
        const openField = (context.adjacentEnemyCount ?? 0) === 0;
        const wideOpen = (context.enemiesInRange2 ?? 1) === 0;
        if (context.hook === 'TURN_START' && openField) store(memory, 'M55_READY');
        if (context.hook === 'BEFORE_MOVE' && memory.states.includes('M55_READY')) {
          if (once(memory, 'turnKeys', `${turnKey}:move1`)) {
            result.moveCostReduction = value(0);
          } else if (equipped.level >= 2 && wideOpen && once(memory, 'turnKeys', `${turnKey}:move2`)) {
            result.moveCostReduction = value(0);
          }
        }
        if (context.hook === 'AFTER_MOVE' && equipped.level === 3 && (context.activeMoveStepsThisTurn ?? 0) >= value(2)) {
          result.shield += (context.maxHp ?? 0) * value(3);
        }
        break;
      }
      case 'M56':
        if (context.hook === 'DAMAGED' && context.adjacentToBlocking && (context.actualDamage ?? 0) > 0
          && once(memory, 'turnKeys', turnKey)) {
          result.damageReductionRatio = Math.max(result.damageReductionRatio, equipped.level >= 2 ? value(1) : value(0));
          if (equipped.level === 3) store(memory, 'M56_PEN');
        }
        if (context.hook === 'BEFORE_HIT' && consume(memory, 'M56_PEN')) {
          result.armorPenetrationBonus += value(1);
        }
        break;
    }
  }
  result.apDelta = Math.max(-1, result.apDelta);
  result.moveCostReduction = Math.min(1, result.moveCostReduction);
  return result;
}
