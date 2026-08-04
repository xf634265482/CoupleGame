import { rollAp } from '../ApSystem';
import { makeSpiritMirage } from '../ChapterAnimaMonsters';
import {
  makeFateWatcher,
  makeFateWheelBeast,
  makeShadowAssassin,
} from '../Chapter5Monsters';
import { spawnFateMirrorMonster } from '../bosses/FateGuardian';
import { createFogGrid, revealAround } from '../FogSystem';
import {
  bossChapterScaling,
  FATE_MIRROR_BOSS_ID,
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
import { generateChapter5Floor } from './Chapter5FloorGenerator';
import type { Chapter5MonsterSpawn } from './Chapter5FloorCatalog';
import {
  F31_SAFE_ZONE_ID,
  F31_SEAL_IDS,
  F33_MIRROR_ID,
  F35_BOSS_ID,
} from './Chapter5FloorCatalog';

const PROPHECY_EYE_HP = 900;
const PROPHECY_EYE_ARMOR = 60;

function makeFateGuardian(id: string, pos: Coord): Monster {
  const base = MONSTER_BASE.BOSS;
  const { hpMult, attackMult } = bossChapterScaling(5);
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
    bossId: 'FATE_GUARDIAN',
    armor: 40,
  };
}

function makeProphecyEye(id: string, pos: Coord): Monster {
  return {
    id,
    type: 'ELITE',
    variantId: 'PROPHECY_EYE',
    pos: { ...pos },
    hp: PROPHECY_EYE_HP,
    maxHp: PROPHECY_EYE_HP,
    attack: 0,
    range: 0,
    aggroRadius: 0,
    aiState: 'IDLE',
    armor: PROPHECY_EYE_ARMOR,
    summoned: true,
  };
}

export function createChapter5Monster(spawn: Chapter5MonsterSpawn): Monster {
  const pos = { ...spawn.pos };
  let monster: Monster;
  switch (spawn.kind) {
    case 'SHADOW_ASSASSIN':
      monster = makeShadowAssassin(spawn.id, pos);
      break;
    case 'FATE_WATCHER':
      monster = makeFateWatcher(spawn.id, pos);
      break;
    case 'FATE_WHEEL_BEAST':
      monster = makeFateWheelBeast(spawn.id, pos);
      break;
    case 'SPIRIT_MIRAGE':
      monster = makeSpiritMirage(spawn.id, pos);
      break;
    case 'PROPHECY_EYE':
      monster = makeProphecyEye(spawn.id, pos);
      break;
    case 'FATE_GUARDIAN':
      monster = makeFateGuardian(spawn.id, pos);
      break;
    default:
      monster = makeFateWatcher(spawn.id, pos);
      break;
  }
  if (spawn.role === 'ELITE' && spawn.kind !== 'PROPHECY_EYE') {
    monster = { ...monster, type: 'ELITE' };
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
  const base = resolveProfessionBaseWithBalance(snapshot.config.professionId, balanceSnapshot, 5);
  const playerConfig = getPlayerBalanceConfig(balanceSnapshot, 5);
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

export function createChapter5ExpeditionState(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
  balanceSnapshot?: PveBalanceSnapshot | null,
): ExpeditionState {
  if (snapshot.floor < 29 || snapshot.floor > 35) throw new Error('CHAPTER5_FLOOR_OUT_OF_RANGE');
  const map = generateChapter5Floor(snapshot.floor, snapshot.seed, snapshot.mode, false);
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
    resolveProfessionBaseWithBalance(snapshot.config.professionId, balanceSnapshot, 5).apBase,
  );
  const entities: FixedEntity[] = map.walls.map((pos, index) => ({
    id: `ROCK_${index}`,
    type: 'ROCK',
    pos: { ...pos },
    consumed: false,
  }));
  if (snapshot.floor === 29 && map.objectiveCells[0]) {
    entities.push({ id: 'KEY', type: 'KEY', pos: { ...map.objectiveCells[0] }, consumed: false });
  }
  if (snapshot.floor === 31) {
    F31_SEAL_IDS.forEach((sealId, index) => {
      const pos = map.objectiveCells[index];
      if (!pos) return;
      entities.push({ id: sealId, type: 'FATE_SEAL', pos: { ...pos }, consumed: false });
    });
    const safePos = map.objectiveCells[3];
    if (safePos) {
      entities.push({ id: F31_SAFE_ZONE_ID, type: 'SAFE_ZONE', pos: { ...safePos }, consumed: false });
    }
  }
  for (let index = 0; index < map.exitCells.length; index += 1) {
    entities.push({ id: `EXIT_${index + 1}`, type: 'EXIT', pos: { ...map.exitCells[index]! }, consumed: false });
  }
  for (let index = 0; index < map.chestCells.length; index += 1) {
    entities.push({ id: `CHEST_${index + 1}`, type: 'CHEST', pos: { ...map.chestCells[index]! }, consumed: false });
  }
  let monsters = map.monsters.map(createChapter5Monster);
  if (snapshot.floor === 33) {
    const mirrorPos = map.objectiveCells[0] ?? map.player;
    const mirrorSpawn = spawnFateMirrorMonster(
      {
        runSeed: snapshot.seed,
        chapter: 5,
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
        balanceSnapshot: getBalanceSnapshot(balanceSnapshot),
        persistentFloorMode: true,
        equipmentDropPool: [...map.equipmentIds],
        lootSeq: 0,
      },
      F33_MIRROR_ID,
      { ...mirrorPos },
    );
    monsters = [...monsters, mirrorSpawn.monster];
  }
  return {
    runSeed: snapshot.seed,
    chapter: 5,
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

export { F35_BOSS_ID, F33_MIRROR_ID, FATE_MIRROR_BOSS_ID };
