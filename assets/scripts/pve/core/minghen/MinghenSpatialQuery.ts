export type GridPos = { x: number; y: number };

function chebyshev(a: GridPos, b: GridPos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Count entities with Chebyshev distance === 1 (8-directional adjacent). */
export function countAdjacentEntities(origin: GridPos, entities: readonly GridPos[]): number {
  let count = 0;
  for (const entity of entities) {
    if (chebyshev(origin, entity) === 1) count += 1;
  }
  return count;
}

/** Count entities with Chebyshev distance <= range. */
export function countEntitiesInChebyshevRange(
  origin: GridPos,
  entities: readonly GridPos[],
  range: number,
): number {
  let count = 0;
  for (const entity of entities) {
    if (chebyshev(origin, entity) <= range) count += 1;
  }
  return count;
}

export function isAdjacentToAny(origin: GridPos, blockers: readonly GridPos[]): boolean {
  for (const blocker of blockers) {
    if (chebyshev(origin, blocker) === 1) return true;
  }
  return false;
}
