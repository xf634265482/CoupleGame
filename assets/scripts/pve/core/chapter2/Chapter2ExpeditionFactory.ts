import { rollAp } from '../ApSystem';
import {
  makeDesertHopperLizard,
  makeDesertRaider,
  makeDuneSentinel,
  makePoisonScorpion,
} from '../Chapter2Monsters';
import { createFogGrid, revealAround } from '../FogSystem';
import { bossChapterScaling, CHAPTER2_SAND_PIT_COUNT, MONSTER_BASE, type ClassId } from '../PveConstants';
import type { Coord, Equipment, ExpeditionState, FixedEntity, Monster, RunPlayer } from '../PveTypes';
import type { FloorChallengeSnapshot, PveEquipmentInstance, PveProfile, PveProfessionId } from '../PveProgressionTypes';
import { createRng, hashSeed } from '../rng';
import { equipmentMaxHpBonus, toFixedEquipItem } from '../equipment/EquipmentProgression';
import { professionBaseStats } from '../professions/ProfessionBaseStats';
import { generateChapter2Floor } from './Chapter2FloorGenerator';
import type { Chapter2MonsterSpawn } from './Chapter2FloorCatalog';

function classIdOf(professionId: PveProfessionId): ClassId {
  if (professionId === 'ARCHER') return 'ARCHER';
  if (professionId === 'RANGER') return 'ROGUE';
  return 'BERSERKER';
}

function makeQuicksandScorpion(id: string, pos: Coord): Monster {
  const base = MONSTER_BASE.BOSS;
  const { hpMult, attackMult } = bossChapterScaling(2);
  const hp = Math.round(base.hp * hpMult);
  return {
    id,
    type: 'BOSS',
    pos: { ...pos },
    hp,
    maxHp: hp,
    attack: Math.round(base.attack * attackMult),
    range: base.range,
    aggroRadius: base.aggroRadius,
    aiState: 'IDLE',
    bossId: 'QUICKSAND_SCORPION',
    armor: 15,
  };
}

export function createChapter2Monster(spawn: Chapter2MonsterSpawn): Monster {
  const pos = { ...spawn.pos };
  let monster: Monster;
  switch (spawn.kind) {
    case 'DESERT_HOPPER_LIZARD':
      monster = makeDesertHopperLizard(spawn.id, pos);
      break;
    case 'DUNE_SENTINEL':
      monster = makeDuneSentinel(spawn.id, pos);
      break;
    case 'POISON_SCORPION':
      monster = makePoisonScorpion(spawn.id, pos);
      break;
    case 'QUICKSAND_SCORPION':
      monster = makeQuicksandScorpion(spawn.id, pos);
      break;
    default:
      monster = makeDesertRaider(spawn.id, pos);
      break;
  }
  if (spawn.role === 'OBJECTIVE') {
    monster = { ...monster, aiState: 'FLEE' };
  }
  if (!spawn.rewardEligible) {
    monster = { ...monster, summoned: true };
  }
  return monster;
}

function loadedInstance(profile: PveProfile, instanceId: string | undefined): PveEquipmentInstance | null {
  return instanceId
    ? profile.equipmentInventory.find((instance) => instance.instanceId === instanceId) ?? null
    : null;
}

function toRunEquipment(profile: PveProfile): Equipment {
  const equipment: Equipment = {};
  for (const slot of ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'] as const) {
    const instance = loadedInstance(profile, profile.equipmentLoadout[slot]);
    if (!instance) continue;
    equipment[slot] = toFixedEquipItem(instance);
  }
  return equipment;
}

function createPlayer(snapshot: FloorChallengeSnapshot, profile: PveProfile): RunPlayer {
  const equipment = toRunEquipment(profile);
  const base = professionBaseStats(snapshot.config.professionId);
  const maxHp = base.maxHp + equipmentMaxHpBonus(equipment);
  return {
    hp: maxHp,
    maxHp,
    gold: 0,
    anima: 0,
    animaProgress: 0,
    animaThreshold: 100,
    classId: classIdOf(snapshot.config.professionId),
    equipment,
    bag: [],
    campMaxHpBuys: 0,
  };
}

function addSandPits(
  entities: FixedEntity[],
  size: number,
  blocked: Set<string>,
  count: number,
  prefix: string,
): void {
  const candidates: Coord[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const k = `${x},${y}`;
      if (!blocked.has(k)) candidates.push({ x, y });
    }
  }
  for (let i = 0; i < count && candidates.length > 0; i += 1) {
    const idx = i % candidates.length;
    const pos = candidates[idx]!;
    blocked.add(`${pos.x},${pos.y}`);
    entities.push({ id: `${prefix}_pit_${i}`, type: 'SAND_PIT', pos: { ...pos }, consumed: false });
  }
}

export function createChapter2ExpeditionState(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
): ExpeditionState {
  if (snapshot.floor < 8 || snapshot.floor > 14) throw new Error('CHAPTER2_FLOOR_OUT_OF_RANGE');
  const map = generateChapter2Floor(snapshot.floor, snapshot.seed, snapshot.mode, false);
  const player = createPlayer(snapshot, profile);
  const revealed = createFogGrid(map.size);
  if (map.fogMode === 'NONE') {
    for (const row of revealed) row.fill(true);
  } else {
    revealAround(revealed, map.player);
  }
  const rng = createRng(hashSeed(`${snapshot.seed}:floor:${snapshot.floor}:turn:1`));
  const { dice, ap } = rollAp(rng, professionBaseStats(snapshot.config.professionId).apBase);
  const entities: FixedEntity[] = map.walls.map((pos, index) => ({
    id: `ROCK_${index}`,
    type: 'ROCK',
    pos: { ...pos },
    consumed: false,
    hp: 50,
  }));
  const blocked = new Set([
    ...map.walls.map((p) => `${p.x},${p.y}`),
    `${map.player.x},${map.player.y}`,
    ...map.monsters.map((m) => `${m.pos.x},${m.pos.y}`),
  ]);
  if (snapshot.floor === 8 && map.objectiveCells[0]) {
    entities.push({ id: 'KEY', type: 'KEY', pos: { ...map.objectiveCells[0] }, consumed: false });
    addSandPits(entities, map.size, blocked, 3, 'F8');
  }
  if (snapshot.floor === 11) {
    entities.push({ id: 'F11_ESCAPE_MARKER', type: 'ESCAPE_MARKER', pos: { ...map.objectiveCells[1]! }, consumed: false });
  }
  for (let index = 0; index < map.exitCells.length; index += 1) {
    entities.push({ id: `EXIT_${index + 1}`, type: 'EXIT', pos: { ...map.exitCells[index]! }, consumed: false });
  }
  for (let index = 0; index < map.chestCells.length; index += 1) {
    entities.push({ id: `CHEST_${index + 1}`, type: 'CHEST', pos: { ...map.chestCells[index]! }, consumed: false });
  }
  if (snapshot.floor === 13) {
    for (let index = 0; index < map.objectiveCells.length; index += 1) {
      entities.push({
        id: `WAVE_SPAWN_${index + 1}`,
        type: 'WAVE_SPAWN_MARKER',
        pos: { ...map.objectiveCells[index]! },
        consumed: false,
      });
    }
  }
  if (snapshot.floor === 12) {
    addSandPits(entities, map.size, blocked, 4, 'F12');
  }
  if (snapshot.floor === 14) {
    addSandPits(entities, map.size, blocked, CHAPTER2_SAND_PIT_COUNT, 'F14');
  }
  const monsters = map.monsters.map(createChapter2Monster);
  if (snapshot.floor === 13) {
    monsters.push(
      createChapter2Monster({ id: 'wave1_0', kind: 'DESERT_RAIDER', pos: { x: 0, y: 0 }, rewardEligible: false }),
      createChapter2Monster({ id: 'wave1_1', kind: 'DESERT_RAIDER', pos: { x: 8, y: 0 }, rewardEligible: false }),
    );
  }
  return {
    runSeed: snapshot.seed,
    chapter: 2,
    floor: snapshot.floor,
    status: 'ACTIVE',
    player,
    floorState: {
      floor: snapshot.floor,
      size: map.size,
      seed: snapshot.seed,
      rngState: rng.state(),
      player: { ...map.player },
      ap,
      maxAp: ap,
      dice,
      turn: 1,
      hasKey: false,
      revealed,
      monsters,
      entities,
      status: 'EXPLORING',
      undyingAvailable: false,
      hasAfterimage: false,
    },
    balanceSnapshot: null,
    persistentFloorMode: true,
    equipmentDropPool: [...map.equipmentIds],
    lootSeq: 0,
  };
}
