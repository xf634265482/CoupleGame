export interface FloorObjectiveMetrics {
  chestOpened?:boolean;clearHpRatio?:number;guardsAliveAtCaptainDeath?:number;rangedHitsTaken?:number;
  leftDefenseZone?:boolean;finalWaveClearTurns?:number;messengerDistanceAtKill?:number;burningTilesEntered?:number;
  fireGoblinKilled?:boolean;exitRoute?:'LEFT'|'MIDDLE'|'RIGHT';collisionCount?:number;
  maxSummonsPerAltar?:number;warDrumWallBlocks?:number;bossWallsDestroyed?:number;hornSummonKills?:number;
}
export interface OptionalObjectiveDefinition{id:string;floor:number;title:string;rewardType:'GOLD'|'EQUIPMENT_DRAW';rewardValue:number;complete(metrics:FloorObjectiveMetrics):boolean}
export const CHAPTER1_OPTIONAL_OBJECTIVES:readonly OptionalObjectiveDefinition[]=[
 {id:'F1_FULL_SEARCH',floor:1,title:'完备搜索',rewardType:'GOLD',rewardValue:10,complete:m=>m.chestOpened===true},
 {id:'F1_STEADY_START',floor:1,title:'稳健起步',rewardType:'EQUIPMENT_DRAW',rewardValue:1,complete:m=>(m.clearHpRatio??0)>=.7},
 {id:'F2_DECAPITATE',floor:2,title:'斩首',rewardType:'GOLD',rewardValue:15,complete:m=>(m.guardsAliveAtCaptainDeath??0)>=1},
 {id:'F2_SUPPRESS_FIRE',floor:2,title:'压制火力',rewardType:'EQUIPMENT_DRAW',rewardValue:1,complete:m=>(m.rangedHitsTaken??Infinity)<=2},
 {id:'F3_HOLD_GROUND',floor:3,title:'阵地不失',rewardType:'GOLD',rewardValue:20,complete:m=>m.leftDefenseZone===false},
 {id:'F3_LAST_WAVE',floor:3,title:'最后一波',rewardType:'EQUIPMENT_DRAW',rewardValue:1,complete:m=>(m.finalWaveClearTurns??Infinity)<=4},
 {id:'F4_CUT_ESCAPE',floor:4,title:'截断退路',rewardType:'GOLD',rewardValue:20,complete:m=>(m.messengerDistanceAtKill??0)>=4},
 {id:'F4_WALK_FIRE',floor:4,title:'踏火而行',rewardType:'EQUIPMENT_DRAW',rewardValue:1,complete:m=>(m.burningTilesEntered??0)>=2},
 {id:'F5_FRONTAL_BREAK',floor:5,title:'正面突破',rewardType:'GOLD',rewardValue:25,complete:m=>m.fireGoblinKilled===true&&m.exitRoute==='LEFT'},
 {id:'F5_STONE_BREAK',floor:5,title:'借石破阵',rewardType:'EQUIPMENT_DRAW',rewardValue:1,complete:m=>(m.collisionCount??0)>=2},
 {id:'F6_SILENCE',floor:6,title:'封口',rewardType:'GOLD',rewardValue:30,complete:m=>(m.maxSummonsPerAltar??Infinity)<2},
 {id:'F6_WALL_COVER',floor:6,title:'借墙避震',rewardType:'EQUIPMENT_DRAW',rewardValue:1,complete:m=>(m.warDrumWallBlocks??0)>=2},
 {id:'F7_STONE_WEAPON',floor:7,title:'以石制敌',rewardType:'GOLD',rewardValue:40,complete:m=>(m.bossWallsDestroyed??0)>=2},
 {id:'F7_SILENT_HORN',floor:7,title:'号角沉寂',rewardType:'EQUIPMENT_DRAW',rewardValue:1,complete:m=>(m.hornSummonKills??Infinity)<=4},
] as const;
export function completedOptionalObjectiveIds(floor:number,metrics:FloorObjectiveMetrics):string[]{return CHAPTER1_OPTIONAL_OBJECTIVES.filter(x=>x.floor===floor&&x.complete(metrics)).map(x=>x.id);}
