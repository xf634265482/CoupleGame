import { createBossObjective, createBreakthroughObjective, createChaseObjective, createEliteHuntObjective, createKeyExploreObjective, createSingleAltarObjective, createWaveSurvivalObjective, getChapter1Objective } from '../../assets/scripts/pve/core/objectives/Chapter1Objectives';
import { resumeObjective, serializeObjective } from '../../assets/scripts/pve/core/objectives/FloorObjective';
import { CHAPTER1_OPTIONAL_OBJECTIVES, completedOptionalObjectiveIds } from '../../assets/scripts/pve/core/objectives/Chapter1OptionalObjectives';
import { CHAPTER1_FLOOR3_BLOCKER_IDS } from '../../assets/scripts/pve/core/chapter1/Chapter1FloorCatalog';

describe('chapter one objectives',()=>{
  test('floor 1 completes on key and ignores exit interaction',()=>{
    const d=createKeyExploreObjective();
    let s=d.create();
    expect(d.apply(s,{type:'EXIT_INTERACTED',apPaid:0}).state.status).toBe('ACTIVE');
    const r=d.apply(s,{type:'KEY_ACQUIRED',keyId:'KEY'});
    expect(r.state.status).toBe('COMPLETE');
    expect(r.state.data.hasKey).toBe(true);
    expect(r.commands.some((c)=>c.type==='OBJECTIVE_COMPLETE')).toBe(true);
  });
  test('elite hunt completes for the generated chapter-one elite id',()=>{const d=createEliteHuntObjective();expect(d.apply(d.create(),{type:'ENTITY_KILLED',entityId:'FLOOR2_ELITE',tags:['ENVIRONMENT_KILL']}).state.status).toBe('COMPLETE');});
  test('five-wave survival warns and spawns the next wave immediately on clear',()=>{const d=createWaveSurvivalObjective();let r=d.apply(d.create(),{type:'WAVE_SPAWNED',wave:1,entityIds:['a']});for(let wave=1;wave<=5;wave+=1){r=d.apply(r.state,{type:'ENTITY_KILLED',entityId:wave===1?'a':`w${wave}`});if(wave===5)break;expect(r.commands).toEqual([{type:'WARN_WAVE',wave:wave+1},{type:'SPAWN_WAVE',wave:wave+1}]);r=d.apply(r.state,{type:'WAVE_SPAWNED',wave:wave+1,entityIds:[`w${wave+1}`]});}expect(r.state.status).toBe('COMPLETE');});
  test('chase fails when the sentinel reaches the escape marker and succeeds on sentinel kill',()=>{const d=createChaseObjective();expect(d.apply(d.create(),{type:'TARGET_ESCAPED',entityId:'GOBLIN_SENTINEL'}).state.status).toBe('FAILED');expect(d.apply(d.create(),{type:'ENTITY_KILLED',entityId:'GOBLIN_SENTINEL'}).state.status).toBe('COMPLETE');});
  test('breakthrough requires barrel activation before blast detonation',()=>{const d=createBreakthroughObjective();expect(d.apply(d.create(),{type:'BLAST_DETONATED',entityId:'F5_BLAST_TARGET'}).state.status).toBe('ACTIVE');let s=d.apply(d.create(),{type:'GUNPOWDER_ACTIVATED',entityId:'F5_BARREL'}).state;expect(s.status).toBe('ACTIVE');s=d.apply(s,{type:'BLAST_DETONATED',entityId:'F5_BLAST_TARGET'}).state;expect(s.status).toBe('COMPLETE');});
  test('single altar waits for all blockade monsters and living summons to be cleared',()=>{const d=createSingleAltarObjective();let s=d.create();s=d.apply(s,{type:'SUMMONED',entityId:'s1',sourceId:'ALTAR_1'}).state;s=d.apply(s,{type:'ALTAR_DESTROYED',altarId:'ALTAR_1'}).state;expect(s.status).toBe('ACTIVE');for(const id of CHAPTER1_FLOOR3_BLOCKER_IDS)s=d.apply(s,{type:'ENTITY_KILLED',entityId:id}).state;expect(s.status).toBe('ACTIVE');s=d.apply(s,{type:'ENTITY_KILLED',entityId:'s1'}).state;expect(s.status).toBe('COMPLETE');});
  test('boss death completes without key, exit, or clearing summons',()=>{const d=createBossObjective();expect(d.apply(d.create(),{type:'ENTITY_KILLED',entityId:'GOBLIN_CHIEF'}).state.status).toBe('COMPLETE');});
  test('all objectives fail on player death and ignore events after terminal state',()=>{for(let floor=1;floor<=7;floor+=1){const d=getChapter1Objective(floor);const failed=d.apply(d.create(),{type:'PLAYER_DIED'}).state;expect(failed.status).toBe('FAILED');expect(d.apply(failed,{type:'PLAYER_TURN_ENDED'}).state).toBe(failed);}});
  test('objective state serializes and rejects a different floor definition',()=>{const d=createWaveSurvivalObjective();const saved=serializeObjective(d.apply(d.create(),{type:'WAVE_SPAWNED',wave:1,entityIds:['a']}).state);expect(resumeObjective(saved,d).data.aliveIds).toEqual(['a']);expect(()=>resumeObjective(saved,createBreakthroughObjective())).toThrow('OBJECTIVE_SAVE_MISMATCH');});
  test('optional objectives are retired (empty catalog)',()=>{expect(CHAPTER1_OPTIONAL_OBJECTIVES).toHaveLength(0);expect(completedOptionalObjectiveIds(4,{messengerDistanceAtKill:4})).toEqual([]);expect(completedOptionalObjectiveIds(6,{maxSummonsPerAltar:1})).toEqual([]);});
});
