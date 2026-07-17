import { rollAp } from '../ApSystem';
import { GOBLIN_CHIEF_RANGE } from '../bosses/GoblinChief';
import {
  makeFireGoblin,
  makeFrostGoblin,
  makeGoblinArcher,
  makeGoblinSentinel,
  makeGoblinWarrior,
  makeSpiritRat,
} from '../Chapter1Monsters';
import { createFogGrid, revealAround } from '../FogSystem';
import { bossChapterScaling, MONSTER_BASE, type ClassId } from '../PveConstants';
import type { Coord, Equipment, ExpeditionState, FixedEntity, Monster, RunPlayer } from '../PveTypes';
import type { FloorChallengeSnapshot, PveEquipmentInstance, PveProfile, PveProfessionId } from '../PveProgressionTypes';
import { createRng, hashSeed } from '../rng';
import { equipmentMaxHpBonus, toFixedEquipItem } from '../equipment/EquipmentProgression';
import { professionBaseStats } from '../professions/ProfessionBaseStats';
import { generateChapter1Floor } from './Chapter1FloorGenerator';
import type { Chapter1MonsterSpawn } from './Chapter1FloorCatalog';

function classIdOf(professionId: PveProfessionId): ClassId {
  if (professionId === 'ARCHER') return 'ARCHER';
  if (professionId === 'RANGER') return 'ROGUE';
  return 'BERSERKER';
}

/** 与 MapGenerator.makeBoss 第一章路径一致：数值/射程走 MONSTER_BASE + bossChapterScaling + GOBLIN_CHIEF_RANGE。 */
function makeGoblinChief(id: string, pos: Coord): Monster {
  const base = MONSTER_BASE.BOSS;
  const { hpMult, attackMult } = bossChapterScaling(1);
  const hp = Math.round(base.hp * hpMult);
  return {
    id,
    type: 'BOSS',
    pos: { ...pos },
    hp,
    maxHp: hp,
    attack: Math.round(base.attack * attackMult),
    range: GOBLIN_CHIEF_RANGE,
    aggroRadius: base.aggroRadius,
    aiState: 'IDLE',
    bossId: 'GOBLIN_CHIEF',
  };
}

/**
 * 永久楼层只决定刷怪位与角色语义（如 OBJECTIVE→FLEE / summoned），
 * HP/攻击/射程/探查半径一律复用 Chapter1Monsters / 原 Boss 工厂，不用单独数值表覆盖。
 */
export function createChapter1Monster(spawn: Chapter1MonsterSpawn): Monster {
  const pos = { ...spawn.pos };
  let monster: Monster;
  switch (spawn.kind) {
    case 'GOBLIN_ARCHER':
      monster = makeGoblinArcher(spawn.id, pos);
      break;
    case 'GOBLIN_SENTINEL':
      monster = makeGoblinSentinel(spawn.id, pos);
      break;
    case 'FIRE_GOBLIN':
      monster = makeFireGoblin(spawn.id, pos);
      break;
    case 'FROST_GOBLIN':
      monster = makeFrostGoblin(spawn.id, pos);
      break;
    case 'SPIRIT_RAT':
      monster = makeSpiritRat(spawn.id, pos);
      break;
    case 'GOBLIN_CHIEF':
      monster = makeGoblinChief(spawn.id, pos);
      break;
    default:
      monster = makeGoblinWarrior(spawn.id, pos);
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

function toLegacyEquipment(profile: PveProfile): Equipment {
  const equipment: Equipment = {};
  for (const slot of ['WEAPON', 'HELMET', 'ARMOR', 'SHOES', 'TRINKET'] as const) {
    const instance = loadedInstance(profile, profile.equipmentLoadout[slot]);
    if (!instance) continue;
    equipment[slot] = toFixedEquipItem(instance);
  }
  return equipment;
}

function createPlayer(snapshot: FloorChallengeSnapshot, profile: PveProfile): RunPlayer {
  const equipment = toLegacyEquipment(profile);
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
    classTraits: [],
    equipment,
    bag: [],
    relics: [],
    ownedRelics: [],
    campMaxHpBuys: 0,
  };
}

export function createChapter1ExpeditionState(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
): ExpeditionState {
  if (snapshot.floor < 1 || snapshot.floor > 7) throw new Error('CHAPTER1_FLOOR_OUT_OF_RANGE');
  const map = generateChapter1Floor(snapshot.floor, snapshot.seed, snapshot.mode, false);
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
  if (snapshot.floor === 1 && map.objectiveCells[0]) {
    entities.push({ id: 'KEY', type: 'KEY', pos: { ...map.objectiveCells[0] }, consumed: false });
  }
  for (let index = 0; index < map.exitCells.length; index += 1) {
    entities.push({ id: `EXIT_${index + 1}`, type: 'EXIT', pos: { ...map.exitCells[index]! }, consumed: false });
  }
  for (let index = 0; index < map.chestCells.length; index += 1) {
    entities.push({ id: `CHEST_${index + 1}`, type: 'CHEST', pos: { ...map.chestCells[index]! }, consumed: false });
  }
  if (snapshot.floor === 3) {
    entities.push({ id: 'ALTAR_1', type: 'ALTAR', pos: { ...map.objectiveCells[0]! }, consumed: false, hp: 60 });
  }
  if (snapshot.floor === 4) {
    entities.push({ id: 'F4_ESCAPE_MARKER', type: 'ESCAPE_MARKER', pos: { ...map.objectiveCells[1]! }, consumed: false });
  }
  if (snapshot.floor === 5) {
    entities.push(
      { id: 'F5_BARREL', type: 'GUNPOWDER_BARREL', pos: { ...map.objectiveCells[0]! }, consumed: false },
      { id: 'F5_BLAST_TARGET', type: 'BLAST_TARGET', pos: { ...map.objectiveCells[1]! }, consumed: false },
    );
  }
  if (snapshot.floor === 6) {
    for (let index = 0; index < map.objectiveCells.length; index += 1) {
      entities.push({
        id: `WAVE_SPAWN_${index + 1}`,
        type: 'WAVE_SPAWN_MARKER',
        pos: { ...map.objectiveCells[index]! },
        consumed: false,
      });
    }
  }
  const monsters = map.monsters.map(createChapter1Monster);
  if (snapshot.floor === 6) {
    // 第一波直接占两个刷怪点（上边两角），与后续 spawnWave 落点一致。
    monsters.push(
      createChapter1Monster({ id: 'wave1_0', kind: 'GOBLIN_WARRIOR', pos: { x: 0, y: 0 }, rewardEligible: false }),
      createChapter1Monster({ id: 'wave1_1', kind: 'GOBLIN_WARRIOR', pos: { x: 8, y: 0 }, rewardEligible: false }),
    );
  }
  return {
    runSeed: snapshot.seed,
    chapter: 1,
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
      hasKey: snapshot.floor === 5,
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
