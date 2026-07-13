import type { Chapter1Coord, Chapter1MonsterSpawn } from './chapter1/Chapter1FloorCatalog';
import type { GeneratedChapter1Floor } from './chapter1/Chapter1FloorGenerator';
import { createMinghenTriggerMemory, type MinghenTriggerMemory } from './minghen/MinghenEffects';
import type { MinghenAction, MinghenStatus } from './minghen/MinghenEventContext';
import type { FloorObjectiveState, ObjectiveCommand } from './objectives/FloorObjective';
import type { PveEquipmentInstance, PveProfile } from './PveProgressionTypes';

export interface PlayableMonster {
  id: string; kind: string; pos: Chapter1Coord; hp: number; maxHp: number;
  attack: number; range: number; alive: boolean; rewardEligible: boolean;
  role?: Chapter1MonsterSpawn['role']; statuses: Partial<Record<MinghenStatus, number>>;
}
export interface PersistentCombatState {
  playerPos: Chapter1Coord; monsters: PlayableMonster[]; weapon: PveEquipmentInstance | null;
  keyAcquired: boolean; wave: number; message: string; minghenMemory: MinghenTriggerMemory;
  movedThisTurn: boolean; attackedThisTurn: boolean; moveStepsThisTurn: number;
  hitsByTarget: Record<string, number>; lastAction: MinghenAction | null;
}
export interface Chapter1PlayableState { map: GeneratedChapter1Floor; objective: FloorObjectiveState; pendingCommands: ObjectiveCommand[]; combat: PersistentCombatState; }

const STATS: Record<string, [number, number, number]> = { GOBLIN_WARRIOR:[35,8,1], GOBLIN_ARCHER:[30,7,4], GOBLIN_SENTINEL:[45,9,3], BANNER_CAPTAIN:[80,12,4], MESSENGER:[60,0,0], FIRE_GOBLIN:[100,13,1], FROST_GOBLIN:[45,9,2], GOBLIN_CHIEF:[660,18,1], ALTAR:[60,0,0] };
export function createPlayableMonster(spawn: Chapter1MonsterSpawn): PlayableMonster { const [hp,attack,range]=STATS[spawn.kind]??[35,8,1]; return {...spawn,pos:{...spawn.pos},hp,maxHp:hp,attack,range,alive:true,statuses:{}}; }
export function createPersistentCombatState(map: GeneratedChapter1Floor, profile?: PveProfile): PersistentCombatState {
  const weaponId=profile?.equipmentLoadout.WEAPON;
  const weapon=weaponId?profile.equipmentInventory.find(x=>x.instanceId===weaponId)??null:null;
  const monsters=map.monsters.map(createPlayableMonster);
  if(map.floor===6) map.objectiveCells.forEach((pos,index)=>monsters.push(createPlayableMonster({id:`ALTAR_${index+1}`,kind:'ALTAR',pos,role:'OBJECTIVE',rewardEligible:false})));
  if(map.floor===3) [{id:'wave1_a',kind:'GOBLIN_WARRIOR',pos:map.objectiveCells[0]!},{id:'wave1_b',kind:'GOBLIN_WARRIOR',pos:map.objectiveCells[1]!}].forEach(x=>monsters.push(createPlayableMonster({...x,rewardEligible:false})));
  return {playerPos:{...map.player},monsters,weapon,keyAcquired:false,wave:map.floor===3?1:0,message:`进入${map.name}`,minghenMemory:createMinghenTriggerMemory(),movedThisTurn:false,attackedThisTurn:false,moveStepsThisTurn:0,hitsByTarget:{},lastAction:null};
}
