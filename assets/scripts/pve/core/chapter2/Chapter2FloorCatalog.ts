import type { ObjectiveKind } from '../objectives/FloorObjective';

export interface Chapter2Coord { x: number; y: number }
export type Chapter2FogMode = 'FULL' | 'NONE' | 'BOSS_FOG';
export interface Chapter2MonsterSpawn {
  id: string;
  kind: string;
  kindPool?: readonly string[];
  pos: Chapter2Coord;
  role?: 'NORMAL' | 'ELITE' | 'CLIMAX' | 'BOSS' | 'OBJECTIVE';
  rewardEligible: boolean;
}
export type Chapter2FloorSpecial = Record<string, number | boolean | string | readonly number[] | readonly string[]>;
export interface Chapter2FloorDefinition {
  floor: number;
  name: string;
  size: number;
  fogMode: Chapter2FogMode;
  objectiveKind: ObjectiveKind;
  player: Chapter2Coord;
  criticalTargets: Chapter2Coord[];
  exitCells: Chapter2Coord[];
  chestCandidates: Chapter2Coord[];
  fixedWalls: Chapter2Coord[];
  randomRockCandidates: Chapter2Coord[];
  randomRockCount: number;
  fixedMonsters: Chapter2MonsterSpawn[];
  randomMonsterPools: readonly string[][];
  minghenIds: string[];
  equipmentIds: string[];
  optionalObjectiveIds: string[];
  special?: Chapter2FloorSpecial;
}

const c = (x: number, y: number): Chapter2Coord => ({ x, y });

/** Non-boss chapter-two equipment from floors 8–12 for floor 13 backflow pool. */
export const CHAPTER2_FLOOR13_BACKFLOW_EQUIPMENT_IDS = [
  '铁制长剑', '铁制锁甲', '沙地靴',
  '铁制长矛', '木矛', '皮革头盔',
  '钝铁斧', '铁制板甲', '铁制战盔',
  '铁战斧', '精制战靴', '聚灵碧玉', '财运挂件',
  '精钢剑', '精钢板甲', '精制战靴',
] as const;

export const CHAPTER2_FLOORS: Record<number, Chapter2FloorDefinition> = {
  8: {
    floor: 8,
    name: '沙丘哨站',
    size: 8,
    fogMode: 'FULL',
    objectiveKind: 'KEY_EXPLORE',
    player: c(1, 6),
    criticalTargets: [c(6, 1), c(6, 2)],
    exitCells: [],
    chestCandidates: [c(6, 6), c(5, 6)],
    fixedWalls: [c(3, 2), c(3, 3), c(3, 4), c(3, 5)],
    randomRockCandidates: [c(5, 5), c(6, 5), c(2, 5), c(2, 3)],
    randomRockCount: 2,
    fixedMonsters: [
      { id: 'f8_r1', kind: 'DESERT_RAIDER', pos: c(4, 2), rewardEligible: true },
      { id: 'f8_r2', kind: 'DESERT_RAIDER', pos: c(5, 4), rewardEligible: true },
    ],
    randomMonsterPools: [[], ['DESERT_HOPPER_LIZARD']],
    minghenIds: ['M08', 'M22', 'M09'],
    equipmentIds: ['铁制长剑', '铁制锁甲', '沙地靴'],
    optionalObjectiveIds: [],
    special: { sandPitMovePenalty: 2 },
  },
  9: {
    floor: 9,
    name: '毒蝎猎场',
    size: 8,
    fogMode: 'FULL',
    objectiveKind: 'ELITE_HUNT',
    player: c(3, 7),
    criticalTargets: [c(3, 2)],
    exitCells: [],
    chestCandidates: [c(6, 6), c(1, 6)],
    fixedWalls: [c(2, 2), c(4, 2), c(2, 3), c(4, 3)],
    randomRockCandidates: [c(1, 4), c(5, 4), c(1, 5), c(5, 5)],
    randomRockCount: 2,
    fixedMonsters: [
      { id: 'FLOOR9_ELITE', kind: 'POISON_SCORPION', pos: c(3, 2), role: 'ELITE', rewardEligible: true },
      { id: 'f9_r1', kind: 'DESERT_RAIDER', pos: c(2, 4), rewardEligible: true },
      { id: 'f9_h1', kind: 'DESERT_HOPPER_LIZARD', pos: c(4, 4), rewardEligible: true },
    ],
    randomMonsterPools: [['DESERT_RAIDER'], ['DESERT_HOPPER_LIZARD']],
    minghenIds: ['M02', 'M17', 'M15', 'M10'],
    equipmentIds: ['铁制长矛', '木矛', '皮革头盔'],
    optionalObjectiveIds: [],
  },
  10: {
    floor: 10,
    name: '沙暴警戒',
    size: 8,
    fogMode: 'NONE',
    objectiveKind: 'PURGE',
    player: c(4, 7),
    criticalTargets: [c(4, 1)],
    exitCells: [],
    chestCandidates: [],
    fixedWalls: [c(1, 3), c(1, 4), c(6, 3), c(6, 4)],
    randomRockCandidates: [],
    randomRockCount: 0,
    fixedMonsters: [
      { id: 'F10_SENTINEL_1', kind: 'DUNE_SENTINEL', pos: c(3, 2), rewardEligible: true },
      { id: 'F10_SENTINEL_2', kind: 'DUNE_SENTINEL', pos: c(5, 2), rewardEligible: true },
      { id: 'f10_r1', kind: 'DESERT_RAIDER', pos: c(1, 5), rewardEligible: true },
      { id: 'f10_r2', kind: 'DESERT_RAIDER', pos: c(6, 5), rewardEligible: true },
      { id: 'f10_h1', kind: 'DESERT_HOPPER_LIZARD', pos: c(2, 4), rewardEligible: true },
      { id: 'f10_h2', kind: 'DESERT_HOPPER_LIZARD', pos: c(5, 4), rewardEligible: true },
    ],
    randomMonsterPools: [],
    minghenIds: ['M05', 'M03', 'M13'],
    equipmentIds: ['钝铁斧', '铁制板甲', '铁制战盔'],
    optionalObjectiveIds: [],
    special: { sentinelIds: ['F10_SENTINEL_1', 'F10_SENTINEL_2'] },
  },
  11: {
    floor: 11,
    name: '沙暴追剿',
    size: 9,
    fogMode: 'NONE',
    objectiveKind: 'CHASE',
    player: c(0, 8),
    criticalTargets: [c(4, 1), c(7, 0)],
    exitCells: [],
    chestCandidates: [],
    fixedWalls: [c(6, 0), c(8, 0), c(6, 1), c(8, 1), c(3, 4), c(4, 4), c(5, 4), c(4, 6)],
    randomRockCandidates: [],
    randomRockCount: 0,
    fixedMonsters: [
      { id: 'CHASE_TARGET', kind: 'DESERT_RAIDER', pos: c(4, 1), role: 'OBJECTIVE', rewardEligible: true },
      { id: 'f11_r1', kind: 'DESERT_RAIDER', pos: c(2, 5), rewardEligible: true },
      { id: 'f11_r2', kind: 'DESERT_RAIDER', pos: c(5, 5), rewardEligible: true },
      { id: 'f11_h1', kind: 'DESERT_HOPPER_LIZARD', pos: c(3, 3), rewardEligible: true },
      { id: 'f11_h2', kind: 'DESERT_HOPPER_LIZARD', pos: c(6, 3), rewardEligible: true },
    ],
    randomMonsterPools: [['DESERT_RAIDER', 'DESERT_HOPPER_LIZARD'], ['DESERT_RAIDER', 'DESERT_RAIDER']],
    minghenIds: ['M11', 'M12', 'M16', 'M14'],
    equipmentIds: ['铁战斧', '精制战靴', '聚灵碧玉', '财运挂件'],
    optionalObjectiveIds: [],
    special: { messengerMove: 2, unobstructedEscapeTurns: 6, escapeMarkerX: 7, escapeMarkerY: 0 },
  },
  12: {
    floor: 12,
    name: '沙暴走廊',
    size: 9,
    fogMode: 'NONE',
    objectiveKind: 'TIMED_ESCAPE',
    player: c(4, 8),
    criticalTargets: [c(4, 0)],
    exitCells: [c(4, 0)],
    chestCandidates: [],
    fixedWalls: [c(2, 1), c(2, 2), c(2, 4), c(2, 5), c(6, 2), c(6, 3), c(6, 5)],
    randomRockCandidates: [c(3, 3), c(5, 4), c(3, 5)],
    randomRockCount: 1,
    fixedMonsters: [
      { id: 'f12_r1', kind: 'DESERT_RAIDER', pos: c(4, 7), rewardEligible: true },
      { id: 'f12_h1', kind: 'DESERT_HOPPER_LIZARD', pos: c(3, 7), rewardEligible: true },
      { id: 'f12_r2', kind: 'DESERT_RAIDER', pos: c(5, 6), rewardEligible: true },
    ],
    randomMonsterPools: [],
    minghenIds: ['M19', 'M18', 'M20', 'M25'],
    equipmentIds: ['精钢剑', '精钢板甲', '精制战靴'],
    optionalObjectiveIds: [],
    special: { turnLimit: 12, sandstormDamage: 10, sandstormCells: 4, sandstormIntervalTurns: 2 },
  },
  13: {
    floor: 13,
    name: '流沙潮汐',
    size: 9,
    fogMode: 'NONE',
    objectiveKind: 'WAVE_SURVIVAL',
    player: c(4, 4),
    criticalTargets: [c(0, 0), c(8, 0), c(0, 8), c(8, 8)],
    exitCells: [],
    chestCandidates: [],
    fixedWalls: [c(2, 3), c(6, 3), c(2, 5), c(6, 5)],
    randomRockCandidates: [],
    randomRockCount: 0,
    fixedMonsters: [],
    randomMonsterPools: [],
    minghenIds: ['M21', 'M23', 'M22', 'M26'],
    equipmentIds: ['精制轻盔', '灵力宝珠', ...CHAPTER2_FLOOR13_BACKFLOW_EQUIPMENT_IDS],
    optionalObjectiveIds: [],
    special: { waveCount: 4, waveRushSteps: 4, expandPitsPerWave: 2 },
  },
  14: {
    floor: 14,
    name: '流沙王座',
    size: 10,
    fogMode: 'BOSS_FOG',
    objectiveKind: 'BOSS',
    player: c(5, 9),
    criticalTargets: [c(5, 1)],
    exitCells: [],
    chestCandidates: [],
    fixedWalls: [c(3, 4), c(4, 4), c(6, 4), c(7, 4), c(5, 6)],
    randomRockCandidates: [],
    randomRockCount: 0,
    fixedMonsters: [
      { id: 'QUICKSAND_SCORPION', kind: 'QUICKSAND_SCORPION', pos: c(5, 1), role: 'BOSS', rewardEligible: true },
    ],
    randomMonsterPools: [],
    minghenIds: ['M24', 'M01', 'M04'],
    equipmentIds: ['精钢剑', '精钢板甲', '精制战靴', '精制轻盔', '灵力宝珠'],
    optionalObjectiveIds: [],
  },
};

export function getChapter2FloorDefinition(floor: number): Chapter2FloorDefinition {
  const value = CHAPTER2_FLOORS[floor];
  if (!value) throw new Error('CHAPTER2_FLOOR_NOT_FOUND');
  return value;
}
