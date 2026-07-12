const { createDefaultProfile }=require('../pve/PveProfile');
const { beginTracking,grantCopy,settleMinghen }=require('../pve/PveMinghen');
function challenge(mode,id='M01'){return{mode,floor:2,config:{trackedMinghenId:id,minghenLoadout:[{id,level:2}]}};}
const prev={firstClearedAt:1,graduatedMinghenIds:[]};
describe('PveMinghen',()=>{
 test('copies stop at level two until trial succeeds',()=>{let c={};for(let i=0;i<4;i+=1)c=grantCopy(c,'M01');expect(c.M01).toMatchObject({copies:4,level:2,trialCompleted:false});});
 test('hunt grants deterministic one or two progress and transitions to trial ready',()=>{let p=createDefaultProfile(1);p={...p,highestClearedFloor:2,minghenCollection:{M01:{id:'M01',level:2,copies:2,trialCompleted:false}}};p=beginTracking(p,2,'M01');let r=settleMinghen(p,challenge('HUNT'),{huntBonusAchieved:true},prev);expect(r.collection.M01).toMatchObject({copies:4,level:2});expect(r.tracking.state).toBe('TRIAL_READY');});
 test('failed trial preserves materials and cloud-validated evidence graduates once',()=>{const p={...createDefaultProfile(1),minghenCollection:{M01:{id:'M01',level:2,copies:4,trialCompleted:false}},tracking:{floor:2,minghenId:'M01',progress:4,state:'TRIAL_READY'}};expect(()=>settleMinghen(p,challenge('TRIAL'),{trialCompleted:true,trialEvidence:{bleedApplied:6}},prev)).toThrow('升格试炼条件未满足');const r=settleMinghen(p,challenge('TRIAL'),{trialEvidence:{bleedApplied:6,bloodwalkKills:2}},prev);expect(r.collection.M01).toMatchObject({level:3,trialCompleted:true});expect(r.dust).toBe(20);expect(r.graduated).toEqual(['M01']);});
 test('graduated Minghen cannot start a dust farming loop',()=>{const p={...createDefaultProfile(1),minghenCollection:{M01:{id:'M01',level:3,copies:4,trialCompleted:true}}};expect(()=>beginTracking(p,2,'M01')).toThrow('命痕已经毕业');});
});
