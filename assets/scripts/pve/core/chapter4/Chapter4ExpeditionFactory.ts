import { rollAp } from '../ApSystem';
import {
  makeAshHound,
  makeFireElemental,
  makeLavaCrab,
} from '../Chapter4Monsters';
import { makeSpiritEmber } from '../ChapterAnimaMonsters';
import { createFogGrid, revealAround } from '../FogSystem';
import {
  bossChapterScaling,
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
import { generateChapter4Floor } from './Chapter4FloorGenerator';
import type { Chapter4MonsterSpawn } from './Chapter4FloorCatalog';
import {
  F23_VENT_IDS,
  F24_ESCORT_BASE,
  F24_ESCORT_CORE,
  F28_BOSS_ID,
} from './Chapter4FloorCatalog';

function makeLavaLord(id: string, pos: Coord): Monster {
  const base = MONSTER_BASE.BOSS;
  const { hpMult, attackMult } = bossChapterScaling(4);
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
    bossId: 'LAVA_LORD',
    armor: 30,
  };
}

function makeEscortCore(id: string, pos: Coord): Monster {
  const hound = makeAshHound(id, pos);
  return {
    ...hound,
    side: 'ALLY',
    attack: 0,
    range: 0,
    hp: 600,
    maxHp: 600,
    variantId: 'ESCORT_CORE',
    aiState: 'IDLE',
  };
}

export function createChapter4Monster(spawn: Chapter4MonsterSpawn): Monster {
  const pos = { ...spawn.pos };
  let monster: Monster;
  switch (spawn.kind) {
    case 'LAVA_CRAB':
      monster = makeLavaCrab(spawn.id, pos);
      break;
    case 'FIRE_ELEMENTAL':
      monster = makeFireElemental(spawn.id, pos);
      break;
    case 'SPIRIT_EMBER':
      monster = makeSpiritEmber(spawn.id, pos);
      break;
    case 'LAVA_LORD':
      monster = makeLavaLord(spawn.id, pos);
      break;
    case 'ESCORT_CORE':
      monster = makeEscortCore(spawn.id, pos);
      break;
    default:
      monster = makeAshHound(spawn.id, pos);
      break;
  }
  if (spawn.role === 'ALLY' || spawn.kind === 'ESCORT_CORE') {
    monster = { ...monster, side: 'ALLY', attack: 0, range: 0 };
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
  const base = resolveProfessionBaseWithBalance(snapshot.config.professionId, balanceSnapshot, 4);
  const playerConfig = getPlayerBalanceConfig(balanceSnapshot, 4);
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

export function createChapter4ExpeditionState(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
  balanceSnapshot?: PveBalanceSnapshot | null,
): ExpeditionState {
  if (snapshot.floor < 22 || snapshot.floor > 28) throw new Error('CHAPTER4_FLOOR_OUT_OF_RANGE');
  const map = generateChapter4Floor(snapshot.floor, snapshot.seed, snapshot.mode, false);
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
    resolveProfessionBaseWithBalance(snapshot.config.professionId, balanceSnapshot, 4).apBase,
  );
  const entities: FixedEntity[] = map.walls.map((pos, index) => ({
    id: `ROCK_${index}`,
    type: 'ROCK',
    pos: { ...pos },
    consumed: false,
  }));
  for (let index = 0; index < map.lavaTiles.length; index += 1) {
    entities.push({
      id: `LAVA_TILE_${index}`,
      type: 'LAVA_TILE',
      pos: { ...map.lavaTiles[index]! },
      consumed: false,
    });
  }
  if (snapshot.floor === 22 && map.objectiveCells[0]) {
    entities.push({ id: 'KEY', type: 'KEY', pos: { ...map.objectiveCells[0] }, consumed: false });
  }
  if (snapshot.floor === 23) {
    map.objectiveCells.forEach((pos, index) => {
      entities.push({
        id: F23_VENT_IDS[index]!,
        type: 'LAVA_VENT',
        pos: { ...pos },
        consumed: false,
      });
    });
  }
  if (snapshot.floor === 24 && map.objectiveCells[0]) {
    entities.push({
      id: F24_ESCORT_BASE,
      type: 'ESCORT_BASE',
      pos: { ...map.objectiveCells[0] },
      consumed: false,
    });
  }
  if (snapshot.floor === 25 && map.objectiveCells[0]) {
    entities.push({
      id: 'F25_SAFE_ZONE',
      type: 'SAFE_ZONE',
      pos: { ...map.objectiveCells[0] },
      consumed: false,
    });
  }
  for (let index = 0; index < map.exitCells.length; index += 1) {
    entities.push({ id: `EXIT_${index + 1}`, type: 'EXIT', pos: { ...map.exitCells[index]! }, consumed: false });
  }
  for (let index = 0; index < map.chestCells.length; index += 1) {
    entities.push({ id: `CHEST_${index + 1}`, type: 'CHEST', pos: { ...map.chestCells[index]! }, consumed: false });
  }
  if (snapshot.floor === 26) {
    for (let index = 0; index < map.objectiveCells.length; index += 1) {
      entities.push({
        id: `WAVE_SPAWN_${index + 1}`,
        type: 'WAVE_SPAWN_MARKER',
        pos: { ...map.objectiveCells[index]! },
        consumed: false,
      });
    }
  }
  const monsters = map.monsters.map(createChapter4Monster);
  if (snapshot.floor === 26) {
    monsters.push(
      createChapter4Monster({ id: 'wave1_0', kind: 'ASH_HOUND', pos: { x: 0, y: 0 }, rewardEligible: false }),
      createChapter4Monster({ id: 'wave1_1', kind: 'ASH_HOUND', pos: { x: 8, y: 0 }, rewardEligible: false }),
    );
  }
  const escortIds = snapshot.floor === 24 ? [F24_ESCORT_CORE] : undefined;
  return {
    runSeed: snapshot.seed,
    chapter: 4,
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
      hasKey: snapshot.floor === 27,
      revealed,
      monsters,
      entities,
      status: 'EXPLORING',
      undyingAvailable: false,
      hasAfterimage: false,
      lavaTideRowsAdvanced: snapshot.floor === 27 ? 0 : undefined,
      minghenFloorTags: {
        objectiveZoneCells: map.objectiveCells.map((cell) => ({ ...cell })),
        escortMonsterIds: escortIds,
      },
    },
    balanceSnapshot: getBalanceSnapshot(balanceSnapshot),
    persistentFloorMode: true,
    equipmentDropPool: [...map.equipmentIds],
    lootSeq: 0,
  };
}

export { F28_BOSS_ID };
