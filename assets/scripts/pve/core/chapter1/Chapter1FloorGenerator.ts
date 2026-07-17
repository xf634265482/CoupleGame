import { createRng, hashSeed } from '../rng';
import { getChapter1FloorDefinition, type Chapter1Coord, type Chapter1FogMode, type Chapter1MonsterSpawn } from './Chapter1FloorCatalog';
import type { FloorChallengeMode } from '../PveProgressionTypes';

export interface GeneratedChapter1Floor {
  floor:number; seed:number; mode:FloorChallengeMode; size:number; name:string;
  fogMode:Chapter1FogMode; player:Chapter1Coord; objectiveKind:string;
  objectiveCells:Chapter1Coord[]; exitCells:Chapter1Coord[]; chestCells:Chapter1Coord[];
  walls:Chapter1Coord[]; monsters:Chapter1MonsterSpawn[];
  minghenIds:string[]; equipmentIds:string[]; optionalObjectiveIds:string[];
  special:Record<string,number|boolean|string|readonly number[]>;
}
const key = (p:Chapter1Coord) => `${p.x},${p.y}`;

export function generateChapter1Floor(floor:number, seed:number, mode:FloorChallengeMode, firstTutorial=false):GeneratedChapter1Floor {
  const d=getChapter1FloorDefinition(floor);
  const rng=createRng(hashSeed(`${floor}:${seed}:${mode}`));
  const chestCells=d.chestCandidates.length ? [{...rng.pick(d.chestCandidates)}] : [];
  const reserved=new Set([...d.fixedWalls,...d.criticalTargets,...d.exitCells,...chestCells,d.player].map(key));
  const rocks=rng.shuffle(d.randomRockCandidates).filter(x=>!reserved.has(key(x))).slice(0,d.randomRockCount);
  const pool=d.randomMonsterPools.length?rng.pick(d.randomMonsterPools):[];
  const randomMonsters=pool.map((kind,index)=>({id:`f${floor}_random_${index}`,kind,pos:{x:(index*2+floor)%d.size,y:Math.max(1,d.size-3-index)},rewardEligible:true}));
  const fixed=d.fixedMonsters.map(x=>({...x,kind:x.kindPool?.length?rng.pick(x.kindPool):x.kind,pos:{...x.pos}}));
  const monsters=[...fixed,...(floor===1&&firstTutorial?[]:randomMonsters)];
  const objectiveCells=floor===1?[{...rng.pick(d.criticalTargets)}]:d.criticalTargets.map(x=>({...x}));
  return {floor,seed,mode,size:d.size,name:d.name,fogMode:d.fogMode,player:{...d.player},objectiveKind:d.objectiveKind,objectiveCells,exitCells:d.exitCells.map(x=>({...x})),chestCells,walls:[...d.fixedWalls.map(x=>({...x})),...rocks.map(x=>({...x}))],monsters,minghenIds:[...d.minghenIds],equipmentIds:[...d.equipmentIds],optionalObjectiveIds:[...d.optionalObjectiveIds],special:{...(d.special??{})}};
}

export function isReachable(map:Pick<GeneratedChapter1Floor,'size'|'walls'>,from:Chapter1Coord,to:Chapter1Coord):boolean {
  const blocked=new Set(map.walls.map(key)); const queue=[from]; const seen=new Set([key(from)]);
  while(queue.length){const p=queue.shift()!;if(p.x===to.x&&p.y===to.y)return true;for(const n of [{x:p.x+1,y:p.y},{x:p.x-1,y:p.y},{x:p.x,y:p.y+1},{x:p.x,y:p.y-1}]){const k=key(n);if(n.x<0||n.y<0||n.x>=map.size||n.y>=map.size||blocked.has(k)||seen.has(k))continue;seen.add(k);queue.push(n);}}
  return false;
}
