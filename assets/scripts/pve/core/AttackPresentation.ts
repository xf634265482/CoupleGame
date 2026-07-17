import type { Coord, PveEvent } from './PveTypes';

/**
 * 攻击表现用的「受击格」。
 * 哨兵/跳跃蜥等受击后会立刻位移：最终态坐标可能 ≥2 格，不能拿它判定近战/远程。
 * 同批若有该目标的 MOVE / HOPPER_REACTION，用位移前的 from。
 */
export function resolveAttackHitPos(
  events: readonly PveEvent[],
  targetId: string,
  fallback: Coord | null | undefined,
): Coord | null {
  for (const event of events) {
    if (event.type === 'MOVE' && event.entityId === targetId) return event.from;
    if (event.type === 'HOPPER_REACTION_ADVANCED' && event.monsterId === targetId) return event.from;
  }
  return fallback ?? null;
}
