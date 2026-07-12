export type ObjectiveKind='KEY_EXPLORE'|'ELITE_HUNT'|'WAVE_SURVIVAL'|'CHASE'|'BREAKTHROUGH'|'PURGE'|'BOSS';
export type ObjectiveStatus='ACTIVE'|'COMPLETE'|'FAILED';
export type ObjectiveEvent=
 |{type:'PLAYER_DIED'}|{type:'WITHDRAW'}|{type:'KEY_ACQUIRED';keyId:string}|{type:'EXIT_INTERACTED';apPaid:number}
 |{type:'ENTITY_KILLED';entityId:string;tags?:string[]}|{type:'TARGET_ESCAPED';entityId:string}
 |{type:'WAVE_SPAWNED';wave:number;entityIds:string[]}|{type:'PLAYER_TURN_ENDED'}
 |{type:'ALTAR_DESTROYED';altarId:string}|{type:'SUMMONED';entityId:string;sourceId:string};
export type ObjectiveCommand={type:'UNLOCK_EXIT'}|{type:'WARN_WAVE';wave:number}|{type:'SPAWN_WAVE';wave:number}|{type:'OBJECTIVE_COMPLETE'}|{type:'OBJECTIVE_FAILED';reason:string};
export interface FloorObjectiveState{version:1;floor:number;kind:ObjectiveKind;status:ObjectiveStatus;progress:number;target:number;data:Record<string,unknown>}
export interface ObjectiveApplyResult{state:FloorObjectiveState;commands:ObjectiveCommand[]}
export interface ObjectiveDefinition{id:string;floor:number;kind:ObjectiveKind;title:string;description:string;create():FloorObjectiveState;apply(state:FloorObjectiveState,event:ObjectiveEvent):ObjectiveApplyResult}
export function failOnTerminalEvent(state:FloorObjectiveState,event:ObjectiveEvent):ObjectiveApplyResult|null{if(state.status!=='ACTIVE')return{state,commands:[]};if(event.type==='PLAYER_DIED'||event.type==='WITHDRAW')return{state:{...state,status:'FAILED'},commands:[{type:'OBJECTIVE_FAILED',reason:event.type}]};return null;}
export function complete(state:FloorObjectiveState):ObjectiveApplyResult{return{state:{...state,status:'COMPLETE',progress:state.target},commands:[{type:'OBJECTIVE_COMPLETE'}]};}
export function serializeObjective(state:FloorObjectiveState):string{return JSON.stringify(state);}
export function resumeObjective(serialized:string,definition:ObjectiveDefinition):FloorObjectiveState{let value:FloorObjectiveState;try{value=JSON.parse(serialized) as FloorObjectiveState;}catch(_err){throw new Error('INVALID_OBJECTIVE_SAVE');}if(value.version!==1||value.floor!==definition.floor||value.kind!==definition.kind)throw new Error('OBJECTIVE_SAVE_MISMATCH');return value;}
