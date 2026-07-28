import { rollAp } from '../ApSystem';
import {
  makeDesertHopperLizard,
  makeDesertRaider,
  makeDuneSentinel,
  makePoisonScorpion,
} from '../Chapter2Monsters';
import { createFogGrid, revealAround } from '../FogSystem';
import { bossChapterScaling, CHAPTER2_SAND_PIT_COUNT, MONSTER_BASE } from '../PveConstants';
import {
  getBalanceSnapshot,
  getPlayerBalanceConfig,
  resolveProfessionBaseWithBalance,
} from '../PveBalance';
import type { Coord, ExpeditionState, FixedEntity, Monster, PveBalanceSnapshot, RunPlayer } from '../PveTypes';
import type { FloorChallengeSnapshot, PveProfile } from '../PveProgressionTypes';
import { createRng, hashSeed } from '../rng';
import { equipmentMaxHpBonus } from '../equipment/EquipmentProgression';
import { classIdFromProfessionId, loadoutToRunEquipment } from '../CampCombatPreview';
import { generateChapter2Floor } from './Chapter2FloorGenerator';
import { getChapter2FloorDefinition, type Chapter2MonsterSpawn } from './Chapter2FloorCatalog';

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
    armor: 10,
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

function createPlayer(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
  balanceSnapshot?: PveBalanceSnapshot | null,
): RunPlayer {
  const equipment = loadoutToRunEquipment(profile);
  const base = resolveProfessionBaseWithBalance(snapshot.config.professionId, balanceSnapshot, 2);
  const playerConfig = getPlayerBalanceConfig(balanceSnapshot, 2);
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

function addDenseSandPits(
  entities: FixedEntity[],
  size: number,
  blocked: Set<string>,
  coveragePct: number,
  prefix: string,
): void {
  const centerLeft = Math.floor((size - 1) / 2);
  const centerRight = centerLeft + 1;
  const candidates: Coord[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const k = `${x},${y}`;
      if (!blocked.has(k)) candidates.push({ x, y });
    }
  }
  candidates.sort((a, b) => {
    const aLane = a.x === centerLeft || a.x === centerRight ? 0 : 1;
    const bLane = b.x === centerLeft || b.x === centerRight ? 0 : 1;
    if (aLane !== bLane) return aLane - bLane;
    const aHash = (a.x * 17 + a.y * 31 + a.x * a.y * 7) % 97;
    const bHash = (b.x * 17 + b.y * 31 + b.x * b.y * 7) % 97;
    return aHash - bHash;
  });
  const targetCount = Math.min(candidates.length, Math.floor(size * size * coveragePct / 100));
  for (let i = 0; i < targetCount; i += 1) {
    const pos = candidates[i]!;
    blocked.add(`${pos.x},${pos.y}`);
    entities.push({ id: `${prefix}_pit_${i}`, type: 'SAND_PIT', pos: { ...pos }, consumed: false });
  }
}

export function createChapter2ExpeditionState(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
  balanceSnapshot?: PveBalanceSnapshot | null,
): ExpeditionState {
  if (snapshot.floor < 8 || snapshot.floor > 14) throw new Error('CHAPTER2_FLOOR_OUT_OF_RANGE');
  const map = generateChapter2Floor(snapshot.floor, snapshot.seed, snapshot.mode, false);
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
    resolveProfessionBaseWithBalance(snapshot.config.professionId, balanceSnapshot, 2).apBase,
  );
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
    ...map.exitCells.map((p) => `${p.x},${p.y}`),
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
    const coveragePct = Number(getChapter2FloorDefinition(12).special?.sandPitCoveragePct ?? 70);
    addDenseSandPits(entities, map.size, blocked, coveragePct, 'F12');
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
