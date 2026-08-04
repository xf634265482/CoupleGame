import type { ObjectiveKind } from '../objectives/FloorObjective';

export interface Chapter1Coord { x: number; y: number }
export type Chapter1FogMode = 'FULL' | 'NONE' | 'BOSS_FOG';
export interface Chapter1MonsterSpawn {
  id: string;
  kind: string;
  kindPool?: readonly string[];
  pos: Chapter1Coord;
  role?: 'NORMAL' | 'ELITE' | 'CLIMAX' | 'BOSS' | 'OBJECTIVE';
  rewardEligible: boolean;
}
export interface Chapter1FloorDefinition {
  floor: number; name: string; size: number; fogMode: Chapter1FogMode;
  objectiveKind: ObjectiveKind; player: Chapter1Coord;
  criticalTargets: Chapter1Coord[]; exitCells: Chapter1Coord[];
  chestCandidates: Chapter1Coord[]; fixedWalls: Chapter1Coord[];
  randomRockCandidates: Chapter1Coord[]; randomRockCount: number;
  fixedMonsters: Chapter1MonsterSpawn[]; randomMonsterPools: readonly string[][];
  minghenIds: string[]; equipmentIds: string[]; optionalObjectiveIds: string[];
  special?: Record<string, number | boolean | string | readonly number[]>;
}
const c = (x: number, y: number): Chapter1Coord => ({ x, y });

export const CHAPTER1_FLOOR3_BLOCKER_IDS = [
  'F3_GATE_W1',
  'F3_GATE_W2',
  'F3_GATE_A1',
  'F3_GATE_A2',
] as const;

export function hasLivingChapter1Floor3Blocker(
  monsters: readonly { id: string; hp: number; aiState?: string }[],
): boolean {
  const blockerIds = new Set<string>(CHAPTER1_FLOOR3_BLOCKER_IDS);
  return monsters.some((monster) => blockerIds.has(monster.id) && monster.hp > 0 && monster.aiState !== 'DEAD');
}

export const CHAPTER1_FLOORS: Record<number, Chapter1FloorDefinition> = {
  1: { floor:1,name:'迷雾钥匙',size:8,fogMode:'FULL',objectiveKind:'KEY_EXPLORE',player:c(1,6),criticalTargets:[c(6,1),c(6,2)],exitCells:[],chestCandidates:[c(6,6),c(5,6)],fixedWalls:[c(3,2),c(3,3),c(3,4),c(3,5)],randomRockCandidates:[c(5,5),c(6,5),c(2,5),c(2,3)],randomRockCount:2,fixedMonsters:[{id:'f1_w1',kind:'GOBLIN_WARRIOR',pos:c(4,2),rewardEligible:true},{id:'f1_w2',kind:'GOBLIN_WARRIOR',pos:c(5,4),rewardEligible:true}],randomMonsterPools:[[],['GOBLIN_ARCHER']],minghenIds:['M05','M06','M07'],equipmentIds:['生锈短刃','皮革轻甲','旅行皮靴'],optionalObjectiveIds:[] },
  2: { floor:2,name:'鍙岀劙鐚庡満',size:8,fogMode:'FULL',objectiveKind:'ELITE_HUNT',player:c(3,7),criticalTargets:[c(3,2)],exitCells:[],chestCandidates:[c(6,6),c(1,6)],fixedWalls:[c(2,2),c(4,2),c(2,3),c(4,3)],randomRockCandidates:[c(1,4),c(5,4),c(1,5),c(5,5)],randomRockCount:2,fixedMonsters:[{id:'FLOOR2_ELITE',kind:'FROST_GOBLIN',kindPool:['FROST_GOBLIN','FIRE_GOBLIN'],pos:c(3,2),role:'ELITE',rewardEligible:true},{id:'f2_w',kind:'GOBLIN_WARRIOR',pos:c(2,4),rewardEligible:true},{id:'f2_a',kind:'GOBLIN_ARCHER',pos:c(4,4),rewardEligible:true}],randomMonsterPools:[['GOBLIN_WARRIOR'],['GOBLIN_ARCHER']],minghenIds:['M01','M02','M09','M15'],equipmentIds:['铁制长矛','木矛','皮革头盔'],optionalObjectiveIds:[] },
  3: { floor:3,name:'鍙疯鍓嶅摠',size:8,fogMode:'NONE',objectiveKind:'PURGE',player:c(4,7),criticalTargets:[c(4,1)],exitCells:[],chestCandidates:[],fixedWalls:[c(0,3),c(1,3),c(2,3),c(3,3),c(5,3),c(6,3),c(7,3),c(0,4),c(1,4),c(2,4),c(3,4),c(5,4),c(6,4),c(7,4)],randomRockCandidates:[],randomRockCount:0,fixedMonsters:[{id:'F3_GATE_W1',kind:'GOBLIN_WARRIOR',pos:c(4,4),rewardEligible:true},{id:'F3_GATE_W2',kind:'GOBLIN_WARRIOR',pos:c(4,3),rewardEligible:true},{id:'F3_GATE_A1',kind:'GOBLIN_ARCHER',pos:c(3,2),rewardEligible:true},{id:'F3_GATE_A2',kind:'GOBLIN_ARCHER',pos:c(5,2),rewardEligible:true}],randomMonsterPools:[],minghenIds:['M03','M04','M10'],equipmentIds:['精钢长枪','铁战斧','棉布软甲','铁制战盔'],optionalObjectiveIds:[],special:{altarCount:1,altarInteractAp:2,summonInterval:3,summonCapPerAltar:2} },
  4: { floor:4,name:'夺令追逃',size:9,fogMode:'NONE',objectiveKind:'CHASE',player:c(0,8),criticalTargets:[c(1,6),c(3,0)],exitCells:[],chestCandidates:[],fixedWalls:[c(2,0),c(4,0),c(2,1),c(4,1),c(3,4),c(4,4),c(5,4),c(4,6)],randomRockCandidates:[],randomRockCount:0,fixedMonsters:[{id:'GOBLIN_SENTINEL',kind:'GOBLIN_SENTINEL',pos:c(1,6),role:'OBJECTIVE',rewardEligible:true},{id:'f4_w1',kind:'GOBLIN_WARRIOR',pos:c(2,6),rewardEligible:true},{id:'f4_w2',kind:'GOBLIN_WARRIOR',pos:c(2,3),rewardEligible:true},{id:'f4_a1',kind:'GOBLIN_ARCHER',pos:c(5,3),rewardEligible:true},{id:'f4_a2',kind:'GOBLIN_ARCHER',pos:c(7,4),rewardEligible:true}],randomMonsterPools:[['GOBLIN_WARRIOR','GOBLIN_ARCHER'],['GOBLIN_WARRIOR','GOBLIN_WARRIOR']],minghenIds:['M08','M11','M12','M16'],equipmentIds:['钝铁斧','沙地靴','灵力宝珠','财运符'],optionalObjectiveIds:[],special:{messengerMove:2,unobstructedEscapeTurns:4,escapeMarkerX:3,escapeMarkerY:0} },
  5: { floor:5,name:'纰庣煶灏侀攣',size:9,fogMode:'NONE',objectiveKind:'BREAKTHROUGH',player:c(4,8),criticalTargets:[c(4,6),c(4,0)],exitCells:[],chestCandidates:[c(8,7),c(7,7)],fixedWalls:[c(2,1),c(2,2),c(2,4),c(2,5),c(6,2),c(6,3),c(6,5),c(4,1)],randomRockCandidates:[c(3,3),c(5,4),c(3,5)],randomRockCount:2,fixedMonsters:[{id:'f5_fire',kind:'FIRE_GOBLIN',pos:c(1,3),role:'ELITE',rewardEligible:true},{id:'f5_a1',kind:'GOBLIN_ARCHER',pos:c(4,4),rewardEligible:true},{id:'f5_a2',kind:'GOBLIN_ARCHER',pos:c(6,4),rewardEligible:true}],randomMonsterPools:[['GOBLIN_WARRIOR','GOBLIN_WARRIOR']],minghenIds:['M13','M14','M19'],equipmentIds:['铁战斧','铁制板甲','铁制战靴'],optionalObjectiveIds:[],special:{barrelInteractAp:1,blastInteractAp:1} },
  6: { floor:6,name:'夜袭固守',size:9,fogMode:'NONE',objectiveKind:'WAVE_SURVIVAL',player:c(4,4),criticalTargets:[c(0,0),c(8,0),c(0,8),c(8,8)],exitCells:[],chestCandidates:[],fixedWalls:[c(2,3),c(6,3),c(2,5),c(6,5)],randomRockCandidates:[],randomRockCount:0,fixedMonsters:[],randomMonsterPools:[],minghenIds:['M17','M18','M20','M22'],equipmentIds:['铁制重盔','灵力宝珠','生锈短刃','皮革轻甲','旅行皮靴','铁制长矛','木矛','皮革头盔','精钢长枪','铁战斧','棉布软甲','铁制战盔','钝铁斧','沙地靴','财运符','铁制板甲','铁制战靴'],optionalObjectiveIds:[],special:{waveCount:5,prepareTurns:0,spawnAnimationMs:0,waveRushSteps:4,waveRushStepsLate:5} },
  7: { floor:7,name:'閰嬮暱澶ц惀',size:10,fogMode:'BOSS_FOG',objectiveKind:'BOSS',player:c(5,9),criticalTargets:[c(5,1)],exitCells:[],chestCandidates:[],fixedWalls:[c(3,4),c(4,4),c(6,4),c(7,4),c(5,6)],randomRockCandidates:[],randomRockCount:0,fixedMonsters:[{id:'GOBLIN_CHIEF',kind:'GOBLIN_CHIEF',pos:c(5,1),role:'BOSS',rewardEligible:true}],randomMonsterPools:[],minghenIds:['M21','M23','M24'],equipmentIds:['铁战斧','铁制板甲','铁制战靴','铁制重盔','灵力宝珠'],optionalObjectiveIds:[],special:{bossHp:660,enrageHp:170,heavyInterval:3,heavyWarningTurns:1,heavyRadius:4,summonNormal:1,summonEnraged:2,summonCap:8,safeRoutes:2} },
};

export function getChapter1FloorDefinition(floor: number): Chapter1FloorDefinition {
  const value = CHAPTER1_FLOORS[floor];
  if (!value) throw new Error('CHAPTER1_FLOOR_NOT_FOUND');
  return value;
}
