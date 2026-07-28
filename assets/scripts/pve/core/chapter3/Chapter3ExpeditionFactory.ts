import { rollAp } from '../ApSystem';
import {
  makeFrostspikePorcupine,
  makeFrostSprite,
  makeGlacierShaper,
  makeSnowWolf,
} from '../Chapter3Monsters';
import { createFogGrid, revealAround } from '../FogSystem';
import {
  bossChapterScaling,
  CHAPTER3_BOUNTY_ATK_MULT,
  CHAPTER3_BOUNTY_HP_MULT,
  CHAPTER3_CORE_HP,
  CHAPTER3_ICE_WALL_HP,
  FROST_GIANT_ICE_DURATION,
  MONSTER_BASE,
} from '../PveConstants';
import type { Coord, ExpeditionState, FixedEntity, Monster, PveBalanceSnapshot, RunPlayer } from '../PveTypes';
import type { FloorChallengeSnapshot, PveProfile } from '../PveProgressionTypes';
import { createRng, hashSeed } from '../rng';
import { equipmentMaxHpBonus } from '../equipment/EquipmentProgression';
import {
  getBalanceSnapshot,
  getPlayerBalanceConfig,
  resolveProfessionBaseWithBalance,
} from '../PveBalance';
import { classIdFromProfessionId, loadoutToRunEquipment } from '../CampCombatPreview';
import { generateChapter3Floor } from './Chapter3FloorGenerator';
import type { Chapter3MonsterSpawn } from './Chapter3FloorCatalog';
import {
  F18_CORE,
  F18_PILLAR_ARMOR,
  F18_PILLAR_COLD,
  F18_PILLAR_WALL,
  F19_CONTROL_A,
  F19_CONTROL_B,
  F19_CONTROL_C,
  F21_BOSS_ID,
} from './Chapter3FloorCatalog';

function makeFrostGiant(id: string, pos: Coord): Monster {
  const base = MONSTER_BASE.BOSS;
  const { hpMult, attackMult } = bossChapterScaling(3);
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
    bossId: 'FROST_GIANT',
    armor: 25,
  };
}

function applyBountyScaling(monster: Monster): Monster {
  return {
    ...monster,
    isBounty: true,
    hp: Math.round(monster.hp * CHAPTER3_BOUNTY_HP_MULT),
    maxHp: Math.round(monster.maxHp * CHAPTER3_BOUNTY_HP_MULT),
    attack: Math.round(monster.attack * CHAPTER3_BOUNTY_ATK_MULT),
  };
}

export function createChapter3Monster(spawn: Chapter3MonsterSpawn): Monster {
  const pos = { ...spawn.pos };
  let monster: Monster;
  switch (spawn.kind) {
    case 'FROSTSPIKE_PORCUPINE':
      monster = makeFrostspikePorcupine(spawn.id, pos);
      break;
    case 'FROST_SPRITE':
      monster = makeFrostSprite(spawn.id, pos);
      break;
    case 'GLACIER_SHAPER':
      monster = makeGlacierShaper(spawn.id, pos);
      break;
    case 'FROST_GIANT':
      monster = makeFrostGiant(spawn.id, pos);
      break;
    default:
      monster = makeSnowWolf(spawn.id, pos);
      break;
  }
  if (spawn.role === 'OBJECTIVE') {
    monster = { ...monster, aiState: 'FLEE' };
  }
  if (spawn.isBounty) {
    monster = applyBountyScaling(monster);
  }
  if (!spawn.rewardEligible) {
    monster = { ...monster, summoned: true };
  }
  return monster;
}

function createPlayer(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
  balanceSnapshot?: PveBalanceSnapshot | null,
): RunPlayer {
  const equipment = loadoutToRunEquipment(profile);
  const base = resolveProfessionBaseWithBalance(snapshot.config.professionId, balanceSnapshot, 3);
  const playerConfig = getPlayerBalanceConfig(balanceSnapshot, 3);
  const maxHp = base.maxHp + equipmentMaxHpBonus(equipment);
  return {
    hp: maxHp,
    maxHp,
    gold: playerConfig.initialGold ?? 0,
    anima: playerConfig.initialAnima ?? 0,
    animaProgress: playerConfig.initialAnima ?? 0,
    animaThreshold: 100,
    classId: classIdFromProfessionId(snapshot.config.professionId),
    equipment,
    bag: [],
    campMaxHpBuys: 0,
  };
}

function addIceWall(
  entities: FixedEntity[],
  id: string,
  pos: Coord,
  hp: number,
): void {
  entities.push({ id, type: 'ICE_WALL', pos: { ...pos }, consumed: false, hp });
}

export function createChapter3ExpeditionState(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
  balanceSnapshot?: PveBalanceSnapshot | null,
): ExpeditionState {
  if (snapshot.floor < 15 || snapshot.floor > 21) throw new Error('CHAPTER3_FLOOR_OUT_OF_RANGE');
  const map = generateChapter3Floor(snapshot.floor, snapshot.seed, snapshot.mode, false);
  const player = createPlayer(snapshot, profile, balanceSnapshot);
  const revealed = createFogGrid(map.size);
  if (map.fogMode === 'NONE') {
    for (const row of revealed) row.fill(true);
  } else {
    revealAround(revealed, map.player);
  }
  const rng = createRng(hashSeed(`${snapshot.seed}:floor:${snapshot.floor}:turn:1`));
  const { dice, ap } = rollAp(
    rng,
    resolveProfessionBaseWithBalance(snapshot.config.professionId, balanceSnapshot, 3).apBase,
  );
  const entities: FixedEntity[] = map.walls.map((pos, index) => ({
    id: `ICE_WALL_${index}`,
    type: 'ICE_WALL',
    pos: { ...pos },
    consumed: false,
    hp: CHAPTER3_ICE_WALL_HP,
  }));
  for (let index = 0; index < map.iceTiles.length; index += 1) {
    entities.push({
      id: `ICE_TILE_${index}`,
      type: 'ICE_TILE',
      pos: { ...map.iceTiles[index]! },
      consumed: false,
      remaining: FROST_GIANT_ICE_DURATION,
    });
  }
  if (snapshot.floor === 15 && map.objectiveCells[0]) {
    entities.push({ id: 'KEY', type: 'KEY', pos: { ...map.objectiveCells[0] }, consumed: false });
  }
  if (snapshot.floor === 17) {
    entities.push({
      id: 'F17_ESCAPE_MARKER',
      type: 'ESCAPE_MARKER',
      pos: { ...map.objectiveCells[1]! },
      consumed: false,
    });
  }
  for (let index = 0; index < map.exitCells.length; index += 1) {
    entities.push({ id: `EXIT_${index + 1}`, type: 'EXIT', pos: { ...map.exitCells[index]! }, consumed: false });
  }
  for (let index = 0; index < map.chestCells.length; index += 1) {
    entities.push({ id: `CHEST_${index + 1}`, type: 'CHEST', pos: { ...map.chestCells[index]! }, consumed: false });
  }
  if (snapshot.floor === 18) {
    addIceWall(entities, F18_CORE, map.objectiveCells[0]!, CHAPTER3_CORE_HP);
    addIceWall(entities, F18_PILLAR_ARMOR, { x: map.objectiveCells[0]!.x - 1, y: map.objectiveCells[0]!.y }, CHAPTER3_ICE_WALL_HP);
    addIceWall(entities, F18_PILLAR_WALL, { x: map.objectiveCells[0]!.x + 1, y: map.objectiveCells[0]!.y }, CHAPTER3_ICE_WALL_HP);
    addIceWall(entities, F18_PILLAR_COLD, { x: map.objectiveCells[0]!.x, y: map.objectiveCells[0]!.y - 1 }, CHAPTER3_ICE_WALL_HP);
  }
  if (snapshot.floor === 19) {
    const pointIds = [F19_CONTROL_A, F19_CONTROL_B, F19_CONTROL_C];
    map.objectiveCells.forEach((pos, index) => {
      entities.push({
        id: pointIds[index]!,
        type: 'CONTROL_POINT',
        pos: { ...pos },
        consumed: false,
      });
    });
  }
  if (snapshot.floor === 20) {
    for (let index = 0; index < map.objectiveCells.length; index += 1) {
      entities.push({
        id: `WAVE_SPAWN_${index + 1}`,
        type: 'WAVE_SPAWN_MARKER',
        pos: { ...map.objectiveCells[index]! },
        consumed: false,
      });
    }
  }
  const monsters = map.monsters.map(createChapter3Monster);
  if (snapshot.floor === 20) {
    monsters.push(
      createChapter3Monster({ id: 'wave1_0', kind: 'SNOW_WOLF', pos: { x: 0, y: 0 }, rewardEligible: false }),
      createChapter3Monster({ id: 'wave1_1', kind: 'SNOW_WOLF', pos: { x: 8, y: 0 }, rewardEligible: false }),
    );
  }
  return {
    runSeed: snapshot.seed,
    chapter: 3,
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
      controlPointProgress: snapshot.floor === 19
        ? { [F19_CONTROL_A]: 0, [F19_CONTROL_B]: 0, [F19_CONTROL_C]: 0 }
        : undefined,
      minghenFloorTags: {
        objectiveZoneCells: map.objectiveCells.map((cell) => ({ ...cell })),
      },
    },
    balanceSnapshot: getBalanceSnapshot(balanceSnapshot),
    persistentFloorMode: true,
    equipmentDropPool: [...map.equipmentIds],
    lootSeq: 0,
  };
}
