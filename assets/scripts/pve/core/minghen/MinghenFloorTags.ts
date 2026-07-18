import type { Coord, FixedEntity, FixedEntityType, FloorState, Monster } from '../PveTypes';

/** Explicit floor tags for Minghen; floors may set these, effects only read via resolve. */
export interface MinghenFloorTags {
  /** Task objective zone cells (occupy / interact / blast points). */
  objectiveZoneCells?: Coord[];
  /** Explicit enemy attack-warning cells for the current telegraph. */
  attackWarningCells?: Coord[];
  /** Monster ids that count as escorted / protected units. */
  escortMonsterIds?: string[];
}

/** Entity types whose cell is a task objective zone when not consumed. */
export const MINGHEN_OBJECTIVE_ENTITY_TYPES: ReadonlySet<FixedEntityType> = new Set([
  'KEY',
  'ESCAPE_MARKER',
  'ALTAR',
  'GUNPOWDER_BARREL',
  'BLAST_TARGET',
  'WAVE_SPAWN_MARKER',
  'EXIT',
  'PORTAL',
]);

/** Entity types whose interact counts as 任务交互 for M51. */
export const MINGHEN_TASK_INTERACT_ENTITY_TYPES: ReadonlySet<FixedEntityType> = new Set([
  'GUNPOWDER_BARREL',
  'BLAST_TARGET',
  'ALTAR',
  'KEY',
  'PORTAL',
  'EXIT',
]);

export function cellKey(pos: Coord): string {
  return `${pos.x},${pos.y}`;
}

export function mergeMinghenFloorTags(
  base: MinghenFloorTags | undefined,
  patch: MinghenFloorTags,
): MinghenFloorTags {
  return {
    objectiveZoneCells: patch.objectiveZoneCells ?? base?.objectiveZoneCells,
    attackWarningCells: patch.attackWarningCells ?? base?.attackWarningCells,
    escortMonsterIds: patch.escortMonsterIds ?? base?.escortMonsterIds,
  };
}

export function withMinghenFloorTags(floor: FloorState, patch: MinghenFloorTags): FloorState {
  return {
    ...floor,
    minghenFloorTags: mergeMinghenFloorTags(floor.minghenFloorTags, patch),
  };
}

export function seedObjectiveZonesFromCells(cells: readonly Coord[]): MinghenFloorTags {
  return {
    objectiveZoneCells: cells.map((cell) => ({ ...cell })),
  };
}

function chebyshev(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function collectObjectiveCells(floor: FloorState): Coord[] {
  const keyed = new Map<string, Coord>();
  const push = (pos: Coord): void => {
    keyed.set(cellKey(pos), { ...pos });
  };
  for (const cell of floor.minghenFloorTags?.objectiveZoneCells ?? []) push(cell);
  for (const entity of floor.entities) {
    if (entity.consumed) continue;
    if (MINGHEN_OBJECTIVE_ENTITY_TYPES.has(entity.type)) push(entity.pos);
  }
  return [...keyed.values()];
}

function collectWarningCells(floor: FloorState): Coord[] {
  const keyed = new Map<string, Coord>();
  const push = (pos: Coord): void => {
    keyed.set(cellKey(pos), { ...pos });
  };
  for (const cell of floor.minghenFloorTags?.attackWarningCells ?? []) push(cell);
  if (floor.fateProphecy) {
    const { center } = floor.fateProphecy;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        push({ x: center.x + dx, y: center.y + dy });
      }
    }
  }
  for (const cell of floor.lavaEruptionMark?.cells ?? []) push(cell);
  return [...keyed.values()];
}

function escortMonsters(floor: FloorState): Monster[] {
  const tagged = new Set(floor.minghenFloorTags?.escortMonsterIds ?? []);
  return floor.monsters.filter((monster) => {
    if (monster.aiState === 'DEAD') return false;
    if (monster.side === 'ALLY') return true;
    return tagged.has(monster.id);
  });
}

export interface ResolvedMinghenFloorTags {
  inTaskObjectiveZone: boolean;
  inAttackWarningZone: boolean;
  escortUnitInRange2: boolean;
  damageTargetIsEscort: boolean;
  objectiveZoneCells: Coord[];
  attackWarningCells: Coord[];
  escortIds: string[];
}

export function resolveMinghenFloorTags(
  floor: FloorState,
  playerPos: Coord = floor.player,
  options?: { damageTargetId?: string },
): ResolvedMinghenFloorTags {
  const objectiveZoneCells = collectObjectiveCells(floor);
  const attackWarningCells = collectWarningCells(floor);
  const escorts = escortMonsters(floor);
  const escortIds = escorts.map((monster) => monster.id);
  const inTaskObjectiveZone = objectiveZoneCells.some(
    (cell) => cell.x === playerPos.x && cell.y === playerPos.y,
  );
  const inAttackWarningZone = attackWarningCells.some(
    (cell) => cell.x === playerPos.x && cell.y === playerPos.y,
  );
  const escortUnitInRange2 = escorts.some((monster) => chebyshev(playerPos, monster.pos) <= 2);
  const damageTargetIsEscort = options?.damageTargetId
    ? escortIds.includes(options.damageTargetId)
    : false;
  return {
    inTaskObjectiveZone,
    inAttackWarningZone,
    escortUnitInRange2,
    damageTargetIsEscort,
    objectiveZoneCells,
    attackWarningCells,
    escortIds,
  };
}

export function isMinghenTaskInteractEntity(entity: Pick<FixedEntity, 'type' | 'consumed'>): boolean {
  return !entity.consumed && MINGHEN_TASK_INTERACT_ENTITY_TYPES.has(entity.type);
}
