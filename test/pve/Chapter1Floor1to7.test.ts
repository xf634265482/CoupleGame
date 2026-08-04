import { CHAPTER1_FLOOR3_BLOCKER_IDS, CHAPTER1_FLOORS, getChapter1FloorDefinition } from '../../assets/scripts/pve/core/chapter1/Chapter1FloorCatalog';
import { generateChapter1Floor, isReachable } from '../../assets/scripts/pve/core/chapter1/Chapter1FloorGenerator';
import { getChapter1Objective } from '../../assets/scripts/pve/core/objectives/Chapter1Objectives';
import { applyPersistentBattleResult, createPersistentFloorRuntime } from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';
import { createGoblinChiefEncounter, damageGoblinChief, stepGoblinChief } from '../../assets/scripts/pve/core/chapter1/Chapter1Encounters';
import { createDefaultPartners } from '../../assets/scripts/pve/core/partner/PartnerProfile';

function profile(activeChallengeId = 'c1'): PveProfile {
  const partnerDefaults = createDefaultPartners();
  return {
    version: 1,
    highestUnlockedFloor: 7,
    highestClearedFloor: 6,
    floorRecords: {},
    minghenCollection: {},
    minghenLoadout: [],
    minghenPresets: [],
    equipmentInventory: [],
    equipmentLoadout: {},
    gold: 0,
    minghenDust: 0,
    professions: {
      WARRIOR: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
      ARCHER: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
      RANGER: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
    },
    selectedProfessionId: 'WARRIOR',
    partners: partnerDefaults.partners,
    equippedPartnerId: partnerDefaults.equippedPartnerId,
    tracking: null,
    activeChallengeId,
    updatedAt: 1,
  };
}

function snapshot(floor: number): FloorChallengeSnapshot {
  return {
    challengeId: `c${floor}`,
    userId: 'u1',
    floor,
    mode: 'PROGRESSION',
    seed: 2,
    status: 'ACTIVE',
    config: {
      professionId: 'WARRIOR',
      equipmentLoadout: {},
      minghenLoadout: [],
      trackedMinghenId: null,
    },
    startedAt: 1,
    updatedAt: 1,
  };
}

describe('chapter one floor 1-7 vertical slice',()=>{
 test('all seven floors bind the matching objective without optional objectives',()=>{expect(Object.keys(CHAPTER1_FLOORS)).toHaveLength(7);for(let floor=1;floor<=7;floor+=1){const d=getChapter1FloorDefinition(floor);expect(getChapter1Objective(floor).kind).toBe(d.objectiveKind);expect(d.optionalObjectiveIds).toEqual([]);expect(d.minghenIds.length).toBeGreaterThanOrEqual(3);expect(d.equipmentIds.length).toBeGreaterThanOrEqual(3);}});
 test.each(Array.from({length:7},(_,i)=>i+1))('floor %i is deterministic and critical cells remain reachable for 20 seeds',(floor)=>{for(let seed=1;seed<=20;seed+=1){const a=generateChapter1Floor(floor,seed,'PROGRESSION'),b=generateChapter1Floor(floor,seed,'PROGRESSION');expect(a).toEqual(b);for(const target of [...a.objectiveCells,...a.exitCells,...a.chestCells])expect(isReachable(a,a.player,target)).toBe(true);const occupied=new Set(a.walls.map(x=>`${x.x},${x.y}`));expect(occupied.has(`${a.player.x},${a.player.y}`)).toBe(false);for(const target of a.objectiveCells)expect(occupied.has(`${target.x},${target.y}`)).toBe(false);}});
 test('floor sizes, fog modes and encounter order rise by chapter progression',()=>{expect(CHAPTER1_FLOORS[1].size).toBe(8);expect(CHAPTER1_FLOORS[3].size).toBe(8);expect(CHAPTER1_FLOORS[4].size).toBe(11);expect(CHAPTER1_FLOORS[6].size).toBe(9);expect(CHAPTER1_FLOORS[7].size).toBe(10);expect([1,2].map(x=>CHAPTER1_FLOORS[x].fogMode)).toEqual(['FULL','FULL']);expect([3,4,5,6].every(x=>CHAPTER1_FLOORS[x].fogMode==='NONE')).toBe(true);expect(CHAPTER1_FLOORS[7].fogMode).toBe('BOSS_FOG');expect(CHAPTER1_FLOORS[3].objectiveKind).toBe('PURGE');expect(CHAPTER1_FLOORS[6].objectiveKind).toBe('WAVE_SURVIVAL');});
 test('floor two deterministically uses an existing frost or fire goblin elite',()=>{for(let seed=1;seed<=20;seed+=1){const elite=generateChapter1Floor(2,seed,'PROGRESSION').monsters.find(x=>x.id==='FLOOR2_ELITE');expect(['FROST_GOBLIN','FIRE_GOBLIN']).toContain(elite?.kind);}});
 test('floor one tutorial suppresses random archer without changing key reachability',()=>{for(let seed=1;seed<=20;seed+=1){const floor=generateChapter1Floor(1,seed,'PROGRESSION',true);expect(floor.monsters).toHaveLength(2);expect(isReachable(floor,floor.player,floor.objectiveCells[0])).toBe(true);}});
 test('sentinel unobstructed route is tracked against the escape marker',()=>{const d=getChapter1FloorDefinition(4);expect(d.size).toBe(11);const sentinel=d.criticalTargets[0],escape=d.criticalTargets[1];const distance=Math.abs(sentinel.x-escape.x)+Math.abs(sentinel.y-escape.y);const move=Number(d.special?.messengerMove??2);expect(distance).toBe(18);expect(distance/move).toBe(9);expect(d.exitCells).toHaveLength(0);expect(d.special?.unobstructedEscapeTurns).toBe(9);expect(d.special?.escapeMarkerX).toBe(10);expect(d.special?.escapeMarkerY).toBe(0);});
 test('floor six is a five-wave portal survival climax',()=>{const f6=getChapter1FloorDefinition(6);expect(f6.criticalTargets).toHaveLength(4);expect(f6.special).toMatchObject({waveCount:5,prepareTurns:0,waveRushSteps:4,waveRushStepsLate:5,waveForceSpawnTurns:4});});
 test('floor three seals the altar behind two rock rows and four existing goblins',()=>{const f3=getChapter1FloorDefinition(3);for(const y of [3,4])expect(f3.fixedWalls.filter(wall=>wall.y===y).map(wall=>wall.x).sort((a,b)=>a-b)).toEqual([0,1,2,3,5,6,7]);expect(f3.fixedMonsters.map(monster=>monster.id)).toEqual(CHAPTER1_FLOOR3_BLOCKER_IDS);expect(f3.fixedMonsters.map(monster=>monster.kind)).toEqual(['GOBLIN_WARRIOR','GOBLIN_WARRIOR','GOBLIN_ARCHER','GOBLIN_ARCHER']);});
  test('boss configuration preserves warning time during enrage and caps summons',()=>{const boss=getChapter1FloorDefinition(7).special!;expect(boss).toMatchObject({bossHp:660,enrageHp:170,heavyInterval:3,heavyWarningTurns:1,summonNormal:1,summonEnraged:2,summonCap:8});});
  test('official persistent runtime completes floor one objective by opening the portal',()=>{let runtime=createPersistentFloorRuntime(snapshot(1),profile('c1'),{tutorialCompleted:true},1);expect(runtime.battleState.expedition.floorState.monsters.filter(monster=>monster.id==='f1_w1'||monster.id==='f1_w2')).toHaveLength(2);runtime=applyPersistentBattleResult(runtime,{state:runtime.battleState.expedition,events:[{type:'PICK_KEY',entityId:'KEY'}]},2).runtime;runtime=applyPersistentBattleResult(runtime,{state:runtime.battleState.expedition,events:[{type:'FLOOR_CLEARED',floor:1}]},3).runtime;expect(runtime.status).toBe('ACTIVE');expect(runtime.battleState.objective.status).toBe('COMPLETE');expect(runtime.battleState.expedition.floorState.entities.some(entity=>entity.type==='PORTAL'&&!entity.consumed)).toBe(true);});
  test('official persistent runtime keeps chase active until death or target kill',()=>{let runtime=createPersistentFloorRuntime(snapshot(4),profile('c4'),undefined,1);runtime=applyPersistentBattleResult(runtime,{state:runtime.battleState.expedition,events:[]},2).runtime;expect(runtime.status).toBe('ACTIVE');expect(runtime.battleState.objective.status).toBe('ACTIVE');runtime=applyPersistentBattleResult(runtime,{state:{...runtime.battleState.expedition,status:'DEAD',floorState:{...runtime.battleState.expedition.floorState,status:'DEAD'}},events:[{type:'PLAYER_DEAD'}]},3).runtime;expect(runtime.status).toBe('DEAD');expect(runtime.battleState.objective.status).toBe('FAILED');});
  test('chief keeps warning time in enrage and horn respects eight summon cap',()=>{let state=damageGoblinChief(createGoblinChiefEncounter(),490);expect(state.enraged).toBe(true);let warned=false,hit=false;for(let i=0;i<5;i+=1){const result=stepGoblinChief(state);state=result.state;warned ||= result.commands.some(x=>x.type==='HEAVY_WARNING');hit ||= result.commands.some(x=>x.type==='HEAVY_HIT');}expect(warned).toBe(true);expect(hit).toBe(true);expect(state.summonsAlive).toBe(8);expect(stepGoblinChief(state).commands.some(x=>x.type==='HORN_SUMMON')).toBe(false);});
});
