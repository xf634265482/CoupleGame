import { createRng, hashSeed } from '../rng';
import { getChapter2FloorDefinition, type Chapter2Coord, type Chapter2FogMode, type Chapter2MonsterSpawn } from './Chapter2FloorCatalog';
import type { FloorChallengeMode } from '../PveProgressionTypes';

export interface GeneratedChapter2Floor {
  floor: number;
  seed: number;
  mode: FloorChallengeMode;
  size: number;
  name: string;
  fogMode: Chapter2FogMode;
  player: Chapter2Coord;
  objectiveKind: string;
  objectiveCells: Chapter2Coord[];
  exitCells: Chapter2Coord[];
  chestCells: Chapter2Coord[];
  walls: Chapter2Coord[];
  monsters: Chapter2MonsterSpawn[];
  minghenIds: string[];
  equipmentIds: string[];
  optionalObjectiveIds: string[];
  special: Record<string, number | boolean | string | readonly number[] | readonly string[]>;
}

const key = (p: Chapter2Coord) => `${p.x},${p.y}`;

export function generateChapter2Floor(
  floor: number,
  seed: number,
  mode: FloorChallengeMode,
  firstTutorial = false,
): GeneratedChapter2Floor {
  const d = getChapter2FloorDefinition(floor);
  const rng = createRng(hashSeed(`${floor}:${seed}:${mode}`));
  const chestCells = d.chestCandidates.length ? [{ ...rng.pick(d.chestCandidates) }] : [];
  const reserved = new Set([
    ...d.fixedWalls,
    ...d.criticalTargets,
    ...d.exitCells,
    ...chestCells,
    d.player,
  ].map(key));
  const rocks = rng.shuffle(d.randomRockCandidates).filter((x) => !reserved.has(key(x))).slice(0, d.randomRockCount);
  const pool = d.randomMonsterPools.length ? rng.pick(d.randomMonsterPools) : [];
  const randomMonsters = pool.map((kind, index) => ({
    id: `f${floor}_random_${index}`,
    kind,
    pos: { x: (index * 2 + floor) % d.size, y: Math.max(1, d.size - 3 - index) },
    rewardEligible: true,
  }));
  const fixed = d.fixedMonsters.map((x) => ({
    ...x,
    kind: x.kindPool?.length ? rng.pick(x.kindPool) : x.kind,
    pos: { ...x.pos },
  }));
  const monsters = [...fixed, ...(floor === 8 && firstTutorial ? [] : randomMonsters)];
  const objectiveCells = floor === 8
    ? [{ ...rng.pick(d.criticalTargets) }]
    : d.criticalTargets.map((x) => ({ ...x }));
  return {
    floor,
    seed,
    mode,
    size: d.size,
    name: d.name,
    fogMode: d.fogMode,
    player: { ...d.player },
    objectiveKind: d.objectiveKind,
    objectiveCells,
    exitCells: d.exitCells.map((x) => ({ ...x })),
    chestCells,
    walls: [...d.fixedWalls.map((x) => ({ ...x })), ...rocks.map((x) => ({ ...x }))],
    monsters,
    minghenIds: [...d.minghenIds],
    equipmentIds: [...d.equipmentIds],
    optionalObjectiveIds: [...d.optionalObjectiveIds],
    special: { ...(d.special ?? {}) },
  };
}

export function isReachable(
  map: Pick<GeneratedChapter2Floor, 'size' | 'walls'>,
  from: Chapter2Coord,
  to: Chapter2Coord,
): boolean {
  const blocked = new Set(map.walls.map(key));
  const queue = [from];
  const seen = new Set([key(from)]);
  while (queue.length) {
    const p = queue.shift()!;
    if (p.x === to.x && p.y === to.y) return true;
    for (const n of [{ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 }]) {
      const k = key(n);
      if (n.x < 0 || n.y < 0 || n.x >= map.size || n.y >= map.size || blocked.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return false;
}
